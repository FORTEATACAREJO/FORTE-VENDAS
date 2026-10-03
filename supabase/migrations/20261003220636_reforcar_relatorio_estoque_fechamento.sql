-- Campos ausentes também invalidam o relatório de fechamento.
create or replace function private.fc_guardar_estado() returns trigger
language plpgsql security definer set search_path='' as $$
declare oldcx jsonb;cx jsonb;prior jsonb;status jsonb;patio jsonb;caixas jsonb:='[]';p public.fc_perfis;seen text[]:=array[]::text[];est record;it jsonb;n integer;f text;v numeric;sale jsonb;payments jsonb;pay jsonb;formas jsonb:='{}';cash numeric;revenue numeric;ids jsonb;initial numeric;method text;
begin
 if tg_op='DELETE' then raise exception 'A base operacional não pode ser excluída por este fluxo.';end if;
 if jsonb_typeof(new.estado)<>'object' then raise exception 'Base operacional inválida.';end if;
 if tg_op='UPDATE' then
  if new.versao is distinct from old.versao+1 then raise exception 'A base foi atualizada por outro usuário. Atualize os dados antes de gravar.' using errcode='40001';end if;
  for oldcx in select x from jsonb_array_elements(coalesce(old.estado->'caixasBalcao','[]')) x where x->>'status'='FECHADO' loop
   select x into cx from jsonb_array_elements(coalesce(new.estado->'caixasBalcao','[]')) x where x->>'id'=oldcx->>'id';
   if cx is distinct from oldcx then raise exception 'Caixa fechado é imutável e não pode ser removido ou reaberto.';end if;
  end loop;
 end if;
 for cx in select x from jsonb_array_elements(coalesce(new.estado->'caixasBalcao','[]')) x loop
  if nullif(cx->>'id','') is null or cx->>'id'=any(seen) then raise exception 'Caixa sem identificação ou duplicado.';end if;
  seen:=array_append(seen,cx->>'id');prior:=null;
  if tg_op='UPDATE' then select x into prior from jsonb_array_elements(coalesce(old.estado->'caixasBalcao','[]')) x where x->>'id'=cx->>'id';end if;
  if cx->>'status'='FECHADO' and coalesce(prior->>'status','')<>'FECHADO' then
   if prior is null or prior->>'status'<>'ABERTO' then raise exception 'Fechamento exige caixa aberto previamente registrado.';end if;
   if (new.estado-'caixasBalcao') is distinct from (old.estado-'caixasBalcao') then raise exception 'Salve e atualize a base antes de fechar o caixa.' using errcode='40001';end if;
   foreach f in array array['data','unidade','operador','abertoEm','saldoInicial'] loop
    if cx->f is distinct from prior->f then raise exception 'Dados de abertura do caixa não podem ser alterados no fechamento.';end if;
   end loop;
   formas:='{}';cash:=0;revenue:=0;ids:='[]';
   initial:=private.fc_dinheiro(prior->>'saldoInicial');
   for sale in select x from jsonb_array_elements(coalesce(new.estado->'vendasBalcao','[]')) x
    where x->>'caixaId'=cx->>'id' and x->>'status'='CONCLUÍDA' and coalesce(x->'regraPagamento'->'entraCaixa','true')<>'false'::jsonb loop
    revenue:=revenue+private.fc_dinheiro(sale->>'total');ids:=ids||jsonb_build_array(sale->>'id');
    if sale->>'origemVendaParcial'='VALOR RECEBIDO' then payments:=jsonb_build_array(jsonb_build_object('forma',sale->>'pagamento','valor',sale->'valorRecebido'));
    elsif jsonb_typeof(sale->'pagamentos')='array' and jsonb_array_length(sale->'pagamentos')>0 then payments:=sale->'pagamentos';
    else payments:=jsonb_build_array(jsonb_build_object('forma',coalesce(sale->>'pagamento','NÃO INFORMADO'),'valor',sale->'total'));end if;
    for pay in select x from jsonb_array_elements(payments) x loop
     v:=private.fc_dinheiro(pay->>'valor');if v<0 then raise exception 'Pagamento de venda negativo.';end if;
     method:=coalesce(nullif(pay->>'forma',''),'NÃO INFORMADO');
     formas:=jsonb_set(formas,array[method],to_jsonb(coalesce((formas->>method)::numeric,0)+v),true);
     if upper(btrim(method)) in ('DINHEIRO','A VISTA','À VISTA') then cash:=cash+v;end if;
    end loop;
   end loop;
   if private.fc_dinheiro(cx->>'totalVendas')<>revenue or private.fc_dinheiro(cx->>'saldoEsperado')<>initial+cash or cx->'vendaIds' is distinct from ids then raise exception 'Vendas ou numerário do fechamento não conferem com a base.';end if;
   if jsonb_typeof(cx->'porForma') is distinct from 'object' then raise exception 'Conferência das formas de pagamento ausente.';end if;
   for f in select key from jsonb_each(formas||coalesce(cx->'porForma','{}')) loop
    if private.fc_dinheiro(coalesce(cx->'porForma'->>f,'0'))<>coalesce((formas->>f)::numeric,0) then raise exception 'Forma de pagamento não confere com as vendas: %.',f;end if;
   end loop;
   cx:=cx||jsonb_build_object('totalVendas',revenue,'porForma',formas,'saldoInicial',initial,'saldoEsperado',initial+cash,
    'saldoContado',private.fc_dinheiro(cx->>'saldoContado'),'diferenca',private.fc_dinheiro(cx->>'diferenca'));
   p:=private.fc_identidade_patio(true);
   if p.empresa_id<>new.empresa_id then raise exception 'Caixa de outra empresa.' using errcode='42501';end if;
   status:=private.fc_status_patio(new.empresa_id,cx->>'id',new.estado);
   if not (status->>'liberado')::boolean then raise exception 'Fechamento bloqueado: confira todos os produtos do pátio, resolva diferenças e atualize contagens após movimentos.';end if;
   n:=0;
   for est in select * from private.fc_itens_patio(new.estado) loop
    select x into it from jsonb_array_elements(coalesce(cx->'estoqueSnapshot','[]')) x where x->>'produtoId'=est.produto_id;
    if it is null or (it->>'saldoFinal')::numeric is distinct from est.total or (it->>'bloqueadoOrcamento')::numeric is distinct from est.bloqueado or (it->>'disponivel')::numeric is distinct from est.disponivel then raise exception 'Relatório de estoque não confere com a base e contagem atuais.';end if;
    n:=n+1;
   end loop;
   if jsonb_array_length(cx->'estoqueSnapshot')<>n then raise exception 'Relatório de estoque com produtos ausentes ou repetidos.';end if;
   foreach f in array array['totalVendas','saldoInicial','saldoEsperado','saldoContado','diferenca'] loop
    begin v:=(cx->>f)::numeric;exception when others then raise exception 'Valor de fechamento inválido: %.',f;end;
    if v is null or v::text in ('NaN','Infinity','-Infinity') or abs(v)>90071992547409.91 or (f<>'diferenca' and v<0) then raise exception 'Valor de fechamento inválido: %.',f;end if;
   end loop;
   if (cx->>'saldoContado')::numeric<0 or round((cx->>'saldoContado')::numeric-(cx->>'saldoEsperado')::numeric,2) is distinct from round((cx->>'diferenca')::numeric,2) then raise exception 'Saldo e diferença do fechamento inconsistentes.';end if;
   if round((cx->>'diferenca')::numeric,2)<>0 and nullif(btrim(cx->>'justificativa'),'') is null then raise exception 'Justificativa obrigatória para diferença de caixa.';end if;
   patio:=status||jsonb_build_object('validadoEm',clock_timestamp());
   cx:=cx||jsonb_build_object('patioConferencia',patio,'fechadoPor',p.nome,'fechadoPorId',p.user_id,'fechadoEm',clock_timestamp());
   insert into public.fc_caixa_fechamentos(id,empresa_id,data,unidade,operador,aberto_em,fechado_em,status,total_vendas,saldo_inicial,saldo_esperado,saldo_contado,diferenca,snapshot)
   values(cx->>'id',new.empresa_id,(cx->>'data')::date,cx->>'unidade',cx->>'operador',(cx->>'abertoEm')::timestamptz,(cx->>'fechadoEm')::timestamptz,'FECHADO',
    (cx->>'totalVendas')::numeric,(cx->>'saldoInicial')::numeric,(cx->>'saldoEsperado')::numeric,(cx->>'saldoContado')::numeric,(cx->>'diferenca')::numeric,cx);
  end if;
  caixas:=caixas||jsonb_build_array(cx);
 end loop;
 new.estado:=jsonb_set(new.estado,'{caixasBalcao}',caixas,true);new.updated_by:=auth.uid();return new;
end;$$;
