-- Conta corrente gerencial do Financeiro. Não executa operações bancárias ou fiscais.
create table private.fc_banco_contas(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references public.fc_empresas(id),
 nome text not null,banco text not null,agencia text not null,numero text not null,
 data_inicial date not null,saldo_inicial bigint not null check(abs(saldo_inicial::numeric)<=9007199254740991),
 criado_por uuid not null,criado_em timestamptz not null default clock_timestamp(),
 unique(empresa_id,banco,agencia,numero),unique(id,empresa_id)
);
create table private.fc_banco_movimentos(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null,
 conta_id uuid not null,data date not null,referencia text not null,descricao text not null,
 centavos bigint not null check(centavos<>0 and abs(centavos::numeric)<=9007199254740991),arquivo text not null,
 criado_por uuid not null,criado_em timestamptz not null default clock_timestamp(),
 foreign key(conta_id,empresa_id) references private.fc_banco_contas(id,empresa_id),unique(conta_id,referencia),unique(id,empresa_id)
);
create index fc_banco_movimentos_empresa on private.fc_banco_movimentos(empresa_id,data,id);
create table private.fc_banco_conciliacoes(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references public.fc_empresas(id),
 requisicao uuid not null,pedido jsonb not null,tipo text not null check(tipo in('TITULO','TRANSFERENCIA','ESTORNO')),
 movimento_id uuid not null,movimento2_id uuid,titulo_tipo text,titulo_id text,
 centavos bigint not null check(centavos>0 and centavos<=9007199254740991),antes jsonb,depois jsonb,
 estorna_id uuid unique references private.fc_banco_conciliacoes(id),motivo text not null,
 criado_por uuid not null,criado_em timestamptz not null default clock_timestamp(),
 foreign key(movimento_id,empresa_id) references private.fc_banco_movimentos(id,empresa_id),
 foreign key(movimento2_id,empresa_id) references private.fc_banco_movimentos(id,empresa_id),unique(empresa_id,requisicao)
);
create index fc_banco_conciliacoes_movimento on private.fc_banco_conciliacoes(movimento_id);
create index fc_banco_conciliacoes_movimento2 on private.fc_banco_conciliacoes(movimento2_id);
create index fc_banco_conciliacoes_empresa on private.fc_banco_conciliacoes(empresa_id,criado_em);
create index fc_banco_conciliacoes_titulo on private.fc_banco_conciliacoes(empresa_id,titulo_tipo,titulo_id);
alter table private.fc_banco_contas enable row level security;
alter table private.fc_banco_movimentos enable row level security;
alter table private.fc_banco_conciliacoes enable row level security;
create policy fc_banco_contas_backend on private.fc_banco_contas to service_role using(true) with check(true);
create policy fc_banco_movimentos_backend on private.fc_banco_movimentos to service_role using(true) with check(true);
create policy fc_banco_conciliacoes_backend on private.fc_banco_conciliacoes to service_role using(true) with check(true);
revoke all on private.fc_banco_contas,private.fc_banco_movimentos,private.fc_banco_conciliacoes from public,anon,authenticated;
create function private.fc_banco_imutavel() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'Registro bancário imutável. Use o estorno de conciliação com motivo.';end;$$;
create trigger fc_banco_contas_imutavel before update or delete on private.fc_banco_contas for each row execute function private.fc_banco_imutavel();
create trigger fc_banco_movimentos_imutavel before update or delete on private.fc_banco_movimentos for each row execute function private.fc_banco_imutavel();
create trigger fc_banco_conciliacoes_imutavel before update or delete on private.fc_banco_conciliacoes for each row execute function private.fc_banco_imutavel();

create function private.fc_centavos(p_value text) returns bigint language plpgsql immutable security invoker set search_path='' as $$
declare v numeric;
begin
 if p_value is null or p_value !~ '^-?[0-9]+([.][0-9]{1,2})?$' then raise exception 'Valor inválido. Informe reais com até duas casas decimais.';end if;
 v:=p_value::numeric*100;if abs(v)>9007199254740991 then raise exception 'Valor fora dos limites monetários.';end if;return v::bigint;
end;$$;
create function private.fc_identidade_banco() returns public.fc_perfis language plpgsql stable security definer set search_path='' as $$
declare p public.fc_perfis;
begin
 select * into p from public.fc_perfis where user_id=auth.uid();
 if auth.uid() is null or not found or not p.ativo or p.trocar_senha or p.status_aprovacao<>'APROVADO'
 or not public.fc_pode_acessar_financeiro(p.empresa_id) then raise exception 'Acesso financeiro ativo e aprovado obrigatório.' using errcode='42501';end if;return p;
end;$$;
create function private.fc_banco_livre(p_movimento uuid) returns bigint language sql stable security invoker set search_path='' as $$
 select (abs(m.centavos::numeric)-coalesce((select sum(c.centavos) from private.fc_banco_conciliacoes c
 where (c.movimento_id=m.id or c.movimento2_id=m.id) and c.tipo<>'ESTORNO'
 and not exists(select 1 from private.fc_banco_conciliacoes e where e.estorna_id=c.id)),0))::bigint
 from private.fc_banco_movimentos m where m.id=p_movimento;
$$;
create function private.fc_banco_painel() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.fc_perfis;contas jsonb;movs jsonb;hist jsonb;
begin
 p:=private.fc_identidade_banco();
 if exists(select 1 from private.fc_banco_contas c where c.empresa_id=p.empresa_id and abs(c.saldo_inicial::numeric+coalesce((select sum(m.centavos) from private.fc_banco_movimentos m where m.conta_id=c.id),0))>9007199254740991) then raise exception 'Saldo agregado fora da precisão monetária suportada.';end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.nome),'[]') into contas from(select c.*,c.saldo_inicial::numeric/100 saldo_abertura,
 (c.saldo_inicial::numeric+coalesce((select sum(m.centavos) from private.fc_banco_movimentos m where m.conta_id=c.id),0))/100 saldo,
 (select count(*) from private.fc_banco_movimentos m where m.conta_id=c.id) movimentos from private.fc_banco_contas c where c.empresa_id=p.empresa_id)q;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.data desc,q.criado_em desc),'[]') into movs from(select m.*,m.centavos::numeric/100 valor,private.fc_banco_livre(m.id)::numeric/100 disponivel from private.fc_banco_movimentos m where m.empresa_id=p.empresa_id order by m.data desc,m.criado_em desc limit 1000)q;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.criado_em desc),'[]') into hist from(select c.*,c.centavos::numeric/100 valor,
 exists(select 1 from private.fc_banco_conciliacoes e where e.estorna_id=c.id) estornado,
 (select x.nome from public.fc_perfis x where x.user_id=c.criado_por) responsavel from private.fc_banco_conciliacoes c where c.empresa_id=p.empresa_id order by c.criado_em desc limit 500)q;
 return jsonb_build_object('contas',contas,'movimentos',movs,'historico',hist,'limiteMovimentos',1000,'limiteHistorico',500);
end;$$;

create function private.fc_banco_criar_conta(p_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.fc_perfis;c private.fc_banco_contas;v bigint;d date;k text;
begin
 p:=private.fc_identidade_banco();perform 1 from public.fc_app_state where empresa_id=p.empresa_id for update;
 foreach k in array array['nome','banco','agencia','numero'] loop if nullif(btrim(p_dados->>k),'') is null or length(p_dados->>k)>100 then raise exception 'Dados obrigatórios da conta ausentes ou inválidos: %.',k;end if;end loop;
 v:=private.fc_centavos(p_dados->>'saldo');d:=(p_dados->>'data')::date;if d is null then raise exception 'Data inicial obrigatória.';end if;
 select * into c from private.fc_banco_contas where empresa_id=p.empresa_id and banco=btrim(p_dados->>'banco') and agencia=btrim(p_dados->>'agencia') and numero=btrim(p_dados->>'numero');
 if found then
  if c.saldo_inicial<>v or c.data_inicial<>d or c.nome<>btrim(p_dados->>'nome') then raise exception 'Conta já cadastrada com dados diferentes. O saldo inicial não pode ser sobrescrito.';end if;
 else insert into private.fc_banco_contas(empresa_id,nome,banco,agencia,numero,data_inicial,saldo_inicial,criado_por) values(p.empresa_id,btrim(p_dados->>'nome'),btrim(p_dados->>'banco'),btrim(p_dados->>'agencia'),btrim(p_dados->>'numero'),d,v,p.user_id) returning * into c;end if;
 return jsonb_build_object('contaId',c.id);
end;$$;
create function private.fc_banco_importar(p_conta uuid,p_linhas jsonb,p_arquivo text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.fc_perfis;c private.fc_banco_contas;x jsonb;m private.fc_banco_movimentos;d date;v bigint;ref text;descr text;n int:=0;repetidos int:=0;
begin
 p:=private.fc_identidade_banco();perform 1 from public.fc_app_state where empresa_id=p.empresa_id for update;
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

-- Read the exact title entity; state and normalized rows are locked before mutations.
create function private.fc_banco_titulo(p_tipo text,p_id text,p_empresa uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare t jsonb;lista text;
begin
 if p_tipo not in('PAGAR','RECEBER') then raise exception 'Tipo de título inválido.';end if;
 if p_id like 'vendas:'||p_tipo||':%' then
  lista:=case when p_tipo='PAGAR' then 'contasPagar' else 'contasReceber' end;
  select x into t from public.fc_app_state a,jsonb_array_elements(coalesce(a.estado->lista,'[]')) x where a.empresa_id=p_empresa and x->>'id'=substr(p_id,length('vendas:'||p_tipo||':')+1);
 elsif p_tipo='PAGAR' then select to_jsonb(n) into t from public.fc_contas_pagar n where n.empresa_id=p_empresa and n.id::text=p_id for update;
 else select to_jsonb(n) into t from public.fc_contas_receber n where n.empresa_id=p_empresa and n.id::text=p_id for update;end if;
 if t is null then raise exception 'Título desta empresa não encontrado.';end if;return t;
end;$$;
create function private.fc_banco_escrever_titulo(p_tipo text,p_id text,p_empresa uuid,p_titulo jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare lista text;
begin
 if p_id like 'vendas:'||p_tipo||':%' then
  lista:=case when p_tipo='PAGAR' then 'contasPagar' else 'contasReceber' end;
  update public.fc_app_state a set estado=jsonb_set(a.estado,array[lista],(select jsonb_agg(case when x->>'id'=p_titulo->>'id' then p_titulo else x end order by ord) from jsonb_array_elements(a.estado->lista) with ordinality e(x,ord))),versao=versao+1 where a.empresa_id=p_empresa;
 elsif p_tipo='PAGAR' then update public.fc_contas_pagar set saldo=(p_titulo->>'saldo')::numeric,status=p_titulo->>'status',updated_at=clock_timestamp() where empresa_id=p_empresa and id::text=p_id;
 else update public.fc_contas_receber set saldo=(p_titulo->>'saldo')::numeric,status=p_titulo->>'status',updated_at=clock_timestamp() where empresa_id=p_empresa and id::text=p_id;end if;
end;$$;

create function private.fc_banco_conciliar(p_pedido jsonb,p_requisicao uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.fc_perfis;m private.fc_banco_movimentos;m2 private.fc_banco_movimentos;c private.fc_banco_conciliacoes;oldc private.fc_banco_conciliacoes;t record;before_t jsonb;after_t jsonb;kind text;tip text;tid text;v bigint;expected bigint;rest bigint;amount bigint;paid bigint;field text;reason text;
begin
 p:=private.fc_identidade_banco();perform 1 from public.fc_app_state where empresa_id=p.empresa_id for update;
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
   if before_t is distinct from oldc.depois then raise exception 'Título mudou após a conciliação. Confira alterações posteriores e estorne na ordem inversa.' using errcode='40001';end if;
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
    after_t:=before_t||jsonb_build_object(field,(paid+v)::numeric/100,'saldoAberto',(rest-v)::numeric/100,'status',case when rest=v then 'LIQUIDADO / CONCILIADO' else 'PARCIALMENTE PAGO' end);
   else after_t:=before_t||jsonb_build_object('saldo',(rest-v)::numeric/100,'status',case when rest=v then 'LIQUIDADO / CONCILIADO' else 'PARCIALMENTE PAGO' end);end if;
   perform private.fc_banco_escrever_titulo(tip,tid,p.empresa_id,after_t);
   after_t:=private.fc_banco_titulo(tip,tid,p.empresa_id);
  else raise exception 'Tipo de conciliação inválido.';end if;
  insert into private.fc_banco_conciliacoes(empresa_id,requisicao,pedido,tipo,movimento_id,movimento2_id,titulo_tipo,titulo_id,centavos,antes,depois,motivo,criado_por)
  values(p.empresa_id,p_requisicao,p_pedido,kind,m.id,case when kind='TRANSFERENCIA' then m2.id end,tip,tid,v,before_t,after_t,reason,p.user_id) returning * into c;
 end if;
 return jsonb_build_object('id',c.id,'repetida',false);
end;$$;

create function public.fc_banco_painel() returns jsonb language sql stable security invoker set search_path='' as $$select private.fc_banco_painel();$$;
create function public.fc_banco_criar_conta(p_dados jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.fc_banco_criar_conta(p_dados);$$;
create function public.fc_banco_importar(p_conta uuid,p_linhas jsonb,p_arquivo text) returns jsonb language sql security invoker set search_path='' as $$select private.fc_banco_importar(p_conta,p_linhas,p_arquivo);$$;
create function public.fc_banco_conciliar(p_pedido jsonb,p_requisicao uuid) returns jsonb language sql security invoker set search_path='' as $$select private.fc_banco_conciliar(p_pedido,p_requisicao);$$;
revoke all on function private.fc_banco_imutavel(),private.fc_centavos(text),private.fc_identidade_banco(),private.fc_banco_livre(uuid),private.fc_banco_painel(),private.fc_banco_criar_conta(jsonb),private.fc_banco_importar(uuid,jsonb,text),private.fc_banco_titulo(text,text,uuid),private.fc_banco_escrever_titulo(text,text,uuid,jsonb),private.fc_banco_conciliar(jsonb,uuid) from public,anon,authenticated;
grant execute on function private.fc_banco_painel(),private.fc_banco_criar_conta(jsonb),private.fc_banco_importar(uuid,jsonb,text),private.fc_banco_conciliar(jsonb,uuid) to authenticated;
revoke all on function public.fc_banco_painel(),public.fc_banco_criar_conta(jsonb),public.fc_banco_importar(uuid,jsonb,text),public.fc_banco_conciliar(jsonb,uuid) from public,anon;
grant execute on function public.fc_banco_painel(),public.fc_banco_criar_conta(jsonb),public.fc_banco_importar(uuid,jsonb,text),public.fc_banco_conciliar(jsonb,uuid) to authenticated;
