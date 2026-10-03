-- Centavos aceitam zeros de escala, mantendo precisão de duas casas.
-- Estorno compara o conteúdo do título, sem confundir horário de atualização com mudança financeira.
create or replace function private.fc_centavos(p_value text) returns bigint language plpgsql immutable security invoker set search_path='' as $$
declare v numeric;
begin
 if p_value is null or p_value !~ '^-?[0-9]+([.][0-9]{1,20})?$' then raise exception 'Valor inválido. Informe reais com até duas casas decimais.';end if;
 v:=p_value::numeric*100;if v<>trunc(v) then raise exception 'Valor inválido. Informe até duas casas decimais.';end if;if abs(v)>9007199254740991 then raise exception 'Valor fora dos limites monetários.';end if;return v::bigint;
end;$$;

create or replace function private.fc_banco_criar_conta(p_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.fc_perfis;c private.fc_banco_contas;v bigint;d date;k text;
begin
 p:=private.fc_identidade_banco();perform 1 from public.fc_app_state where empresa_id=p.empresa_id for update;if not found then raise exception 'Base operacional desta empresa ainda não disponível.';end if;
 foreach k in array array['nome','banco','agencia','numero'] loop if nullif(btrim(p_dados->>k),'') is null or length(p_dados->>k)>100 then raise exception 'Dados obrigatórios da conta ausentes ou inválidos: %.',k;end if;end loop;
 v:=private.fc_centavos(p_dados->>'saldo');d:=(p_dados->>'data')::date;if d is null then raise exception 'Data inicial obrigatória.';end if;
 select * into c from private.fc_banco_contas where empresa_id=p.empresa_id and banco=btrim(p_dados->>'banco') and agencia=btrim(p_dados->>'agencia') and numero=btrim(p_dados->>'numero');
 if found then
  if c.saldo_inicial<>v or c.data_inicial<>d or c.nome<>btrim(p_dados->>'nome') then raise exception 'Conta já cadastrada com dados diferentes. O saldo inicial não pode ser sobrescrito.';end if;
 else insert into private.fc_banco_contas(empresa_id,nome,banco,agencia,numero,data_inicial,saldo_inicial,criado_por) values(p.empresa_id,btrim(p_dados->>'nome'),btrim(p_dados->>'banco'),btrim(p_dados->>'agencia'),btrim(p_dados->>'numero'),d,v,p.user_id) returning * into c;end if;
 return jsonb_build_object('contaId',c.id);
end;$$;

create or replace function private.fc_banco_importar(p_conta uuid,p_linhas jsonb,p_arquivo text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.fc_perfis;c private.fc_banco_contas;x jsonb;m private.fc_banco_movimentos;d date;v bigint;ref text;descr text;n int:=0;repetidos int:=0;
begin
 p:=private.fc_identidade_banco();perform 1 from public.fc_app_state where empresa_id=p.empresa_id for update;if not found then raise exception 'Base operacional desta empresa ainda não disponível.';end if;
 select * into c from private.fc_banco_contas where id=p_conta and empresa_id=p.empresa_id;if not found then raise exception 'Conta desta empresa não encontrada.';end if;
 if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas)=0 or jsonb_array_length(p_linhas)>5000 then raise exception 'Extrato inválido. Importe de 1 a 5.000 movimentos por arquivo.';end if;
 if nullif(btrim(p_arquivo),'') is null or length(p_arquivo)>255 then raise exception 'Nome do arquivo obrigatório.';end if;
 for x in select e from jsonb_array_elements(p_linhas)e loop
  ref:=nullif(btrim(x->>'referencia'),'');descr:=nullif(btrim(x->>'descricao'),'');
  if ref is null or descr is null or length(ref)>200 or length(descr)>500 then raise exception 'Identificador bancário e descrição obrigatórios em cada movimento.';end if;
  d:=(x->>'data')::date;if d is null or d<c.data_inicial then raise exception 'Data do movimento anterior à abertura da conta ou ausente.';end if;
  v:=private.fc_centavos(x->>'valor');if v=0 then raise exception 'Movimento bancário não pode ter valor zero.';end if;
  select * into m from private.fc_banco_movimentos where conta_id=p_conta and referencia=ref;
  if found then
   if m.data is distinct from d or m.centavos is distinct from v or m.descricao is distinct from descr then raise exception 'Identificador bancário repetido com conteúdo diferente: %.',ref;end if;repetidos:=repetidos+1;
  else insert into private.fc_banco_movimentos(empresa_id,conta_id,data,referencia,descricao,centavos,arquivo,criado_por) values(p.empresa_id,p_conta,d,ref,descr,v,p_arquivo,p.user_id);n:=n+1;end if;
 end loop;
 if abs(c.saldo_inicial::numeric+coalesce((select sum(centavos) from private.fc_banco_movimentos where conta_id=p_conta),0))>9007199254740991 then raise exception 'Saldo agregado fora dos limites monetários.';end if;
 return jsonb_build_object('importados',n,'repetidos',repetidos);
end;$$;

create or replace function private.fc_banco_conciliar(p_pedido jsonb,p_requisicao uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.fc_perfis;m private.fc_banco_movimentos;m2 private.fc_banco_movimentos;c private.fc_banco_conciliacoes;oldc private.fc_banco_conciliacoes;t record;before_t jsonb;after_t jsonb;kind text;tip text;tid text;v bigint;expected bigint;rest bigint;amount bigint;paid bigint;field text;reason text;
begin
 p:=private.fc_identidade_banco();perform 1 from public.fc_app_state where empresa_id=p.empresa_id for update;if not found then raise exception 'Base operacional desta empresa ainda não disponível.';end if;
 if p_requisicao is null or jsonb_typeof(p_pedido) is distinct from 'object' then raise exception 'Identificador da operação obrigatório.';end if;
 select * into c from private.fc_banco_conciliacoes where empresa_id=p.empresa_id and requisicao=p_requisicao;
 if found then if c.pedido is distinct from p_pedido then raise exception 'Identificador da operação reutilizado com conteúdo diferente.';end if;return jsonb_build_object('id',c.id,'repetida',true);end if;
 kind:=p_pedido->>'tipo';reason:=nullif(btrim(p_pedido->>'motivo'),'');if reason is null or length(reason)>1000 then raise exception 'Motivo da conferência obrigatório, até 1.000 caracteres.';end if;
 if kind='ESTORNO' then
  select * into oldc from private.fc_banco_conciliacoes where id=(p_pedido->>'conciliacaoId')::uuid and empresa_id=p.empresa_id;
  if not found or oldc.tipo='ESTORNO' then raise exception 'Conciliação desta empresa não encontrada para estorno.';end if;
  if exists(select 1 from private.fc_banco_conciliacoes where estorna_id=oldc.id) then raise exception 'Conciliação já estornada.';end if;
  if oldc.tipo='TITULO' then
   before_t:=private.fc_banco_titulo(oldc.titulo_tipo,oldc.titulo_id,p.empresa_id);
   if (before_t-'updated_at') is distinct from (oldc.depois-'updated_at') then raise exception 'Título mudou após a conciliação. Confira alterações posteriores e estorne na ordem inversa.' using errcode='40001';end if;
   perform private.fc_banco_escrever_titulo(oldc.titulo_tipo,oldc.titulo_id,p.empresa_id,oldc.antes);
  end if;
  insert into private.fc_banco_conciliacoes(empresa_id,requisicao,pedido,tipo,movimento_id,movimento2_id,titulo_tipo,titulo_id,centavos,antes,depois,estorna_id,motivo,criado_por)
  values(p.empresa_id,p_requisicao,p_pedido,kind,oldc.movimento_id,oldc.movimento2_id,oldc.titulo_tipo,oldc.titulo_id,oldc.centavos,oldc.depois,oldc.antes,oldc.id,reason,p.user_id) returning * into c;
 else
  select * into m from private.fc_banco_movimentos where id=(p_pedido->>'movimentoId')::uuid and empresa_id=p.empresa_id;if not found then raise exception 'Movimento desta empresa não encontrado.';end if;
  if kind='TRANSFERENCIA' then
   select * into m2 from private.fc_banco_movimentos where id=(p_pedido->>'movimento2Id')::uuid and empresa_id=p.empresa_id;
   if not found or m.id=m2.id or m.conta_id=m2.conta_id or m.centavos>=0 or m2.centavos<=0 or m.centavos<>-m2.centavos then raise exception 'Transferência exige débito e crédito de mesmo valor em contas diferentes.';end if;
   if private.fc_banco_livre(m.id)<>abs(m.centavos) or private.fc_banco_livre(m2.id)<>m2.centavos then raise exception 'Transferência contém movimento já conciliado.';end if;v:=m2.centavos;
  elsif kind='TITULO' then
   tip:=p_pedido->>'tituloTipo';tid:=p_pedido->>'tituloId';v:=private.fc_centavos(p_pedido->>'valor');expected:=private.fc_centavos(p_pedido->>'saldoEsperado');
   if v<=0 or v>private.fc_banco_livre(m.id) then raise exception 'Valor da conciliação supera o saldo disponível do movimento ou é inválido.';end if;
   if (tip='PAGAR' and m.centavos>=0) or (tip='RECEBER' and m.centavos<=0) then raise exception 'Sinal do extrato incompatível com pagar ou receber.';end if;
   before_t:=private.fc_banco_titulo(tip,tid,p.empresa_id);
   select * into t from public.fc_financeiro_titulos() where tipo=tip and id=tid;
   if not found then raise exception 'Título não disponível para conciliação.';end if;
   rest:=private.fc_centavos(t.saldo::text);amount:=private.fc_centavos(t.valor::text);
   if expected is distinct from rest then raise exception 'Saldo do título mudou. Atualize antes de conciliar.' using errcode='40001';end if;
   if rest<=0 or v>rest then raise exception 'Título encerrado ou valor maior que seu saldo aberto.';end if;
   if tid like 'vendas:'||tip||':%' then
    field:=case when tip='PAGAR' then 'valorPago' else 'valorRecebido' end;
    paid:=case when before_t ? field then private.fc_centavos(before_t->>field) else amount-rest end;
    if paid<>amount-rest then raise exception 'Baixas anteriores inconsistentes com o saldo do título.';end if;
    after_t:=before_t||jsonb_build_object(field,round((paid+v)::numeric/100,2),'saldoAberto',round((rest-v)::numeric/100,2),'status',case when rest=v then 'LIQUIDADO / CONCILIADO' else 'PARCIALMENTE PAGO' end);
   else after_t:=before_t||jsonb_build_object('saldo',round((rest-v)::numeric/100,2),'status',case when rest=v then 'LIQUIDADO / CONCILIADO' else 'PARCIALMENTE PAGO' end);end if;
   perform private.fc_banco_escrever_titulo(tip,tid,p.empresa_id,after_t);
   after_t:=private.fc_banco_titulo(tip,tid,p.empresa_id);
  else raise exception 'Tipo de conciliação inválido.';end if;
  insert into private.fc_banco_conciliacoes(empresa_id,requisicao,pedido,tipo,movimento_id,movimento2_id,titulo_tipo,titulo_id,centavos,antes,depois,motivo,criado_por)
  values(p.empresa_id,p_requisicao,p_pedido,kind,m.id,case when kind='TRANSFERENCIA' then m2.id end,tip,tid,v,before_t,after_t,reason,p.user_id) returning * into c;
 end if;
 return jsonb_build_object('id',c.id,'repetida',false);
end;$$;

