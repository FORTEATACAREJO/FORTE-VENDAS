begin;
create function public.fc_operacao_autorizada() returns boolean language sql stable security invoker set search_path='' as $$select auth.uid() is not null and public.fc_pode_operar_base(public.fc_current_empresa_id()) and private.access_app_allowed('vendas')$$;
revoke all on function public.fc_operacao_autorizada() from public,anon;
grant execute on function public.fc_operacao_autorizada() to authenticated;
-- Keep the full canonical row intact; authenticated reads go through a role-filtered RPC.
create function private.fc_finance_keys() returns text[] language sql immutable set search_path='' as $$
 select array['contasPagar','contasReceber','pagamentosFretes','fornecedorCreditos','emprestimos','contasBancarias','extratosBancarios','conciliacoesFinanceiras','bankConnections','bankEvents','preConferenciaBoletos','pagamentosItau','despesas','boletosFornecedores','cartoesCredito','cnabImportacoes','infinitePayTransacoes','infinitePayTransferencias']::text[]
$$;
create function private.fc_projetar_estado(p_estado jsonb,p_master boolean) returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb:=p_estado;k text;cash jsonb;
begin
 if p_master or p_estado is null then return p_estado;end if;
 foreach k in array private.fc_finance_keys() loop result:=jsonb_set(result,array[k],'[]');end loop;
 select coalesce(jsonb_agg(x-'resumoFinanceiro'-'resultadoFinanceiro'),'[]') into cash from jsonb_array_elements(coalesce(result->'caixasBalcao','[]')) x;
 return jsonb_set(result,'{caixasBalcao}',cash);
end $$;
create function private.fc_carregar_estado() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare empresa uuid:=public.fc_current_empresa_id();a public.fc_app_state;
begin
 if auth.uid() is null or not public.fc_pode_operar_base(empresa) or not private.access_app_allowed('vendas') then raise exception 'Acesso operacional não autorizado.' using errcode='42501';end if;
 select * into a from public.fc_app_state where empresa_id=empresa;
 if not found then return null;end if;
 return jsonb_build_object('estado',private.fc_projetar_estado(a.estado,private.can_access_financeiro(empresa)),'versao',a.versao);
end $$;
create function public.fc_carregar_estado() returns jsonb language sql security invoker set search_path='' as $$select private.fc_carregar_estado()$$;
-- A restrictive policy also closes raw REST/GraphQL, joins and realtime payloads.
revoke all on public.fc_app_state from anon;
-- Raw-table gate is activated by the final rollout migration after clients and Edge Functions are updated.

create function private.fc_salvar_estado_projetado(p_estado jsonb,p_versao bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare empresa uuid:=public.fc_current_empresa_id();a public.fc_app_state;candidate jsonb:=p_estado;can_finance boolean;k text;cash jsonb:='[]';cx jsonb;oldcx jsonb;t jsonb;oldtitle jsonb;receivables jsonb;customer jsonb;prior_customer jsonb;sale jsonb;linked numeric;limit_value numeric;used numeric;
begin
 if auth.uid() is null or not public.fc_pode_operar_base(empresa) or not private.access_app_allowed('vendas') then raise exception 'Acesso operacional não autorizado.' using errcode='42501';end if;
 if jsonb_typeof(candidate)<>'object' then raise exception 'Base operacional inválida.' using errcode='22023';end if;
 select * into a from public.fc_app_state where empresa_id=empresa for update;
 if found and (p_versao is null or a.versao<>p_versao) or not found and p_versao is not null then raise exception 'A base foi atualizada. Atualize antes de gravar.' using errcode='40001';end if;
 can_finance:=private.can_access_financeiro(empresa);
 -- Guard previously evaluated with current_user='authenticated'; explicit actor checks keep it enforced inside this bounded definer.
 if p_versao is not null and candidate->'motoristas' is distinct from a.estado->'motoristas' then raise exception 'Cadastro de motoristas é exclusivo do Forte Frete.' using errcode='42501';end if;
 if not can_finance then
  foreach k in array private.fc_finance_keys() loop
   if k='contasReceber' then continue;end if;
   if candidate->k is not null and candidate->k not in ('null'::jsonb,'[]'::jsonb) then raise exception 'Alteração financeira exige Master: %.',k using errcode='42501';end if;
   if a.estado ? k then candidate:=jsonb_set(candidate,array[k],a.estado->k);else candidate:=candidate-k;end if;
  end loop;
  -- Sales may add pending receivables; existing titles and all settlement history stay server-side.
  receivables:=coalesce(a.estado->'contasReceber','[]');
  for t in select value from jsonb_array_elements(coalesce(candidate->'contasReceber','[]')) loop
   select value into oldtitle from jsonb_array_elements(receivables) where value->>'id'=t->>'id';
   if oldtitle is not null then raise exception 'Recebível existente exige Master.' using errcode='42501';end if;
   if nullif(t->>'vendaId','') is null or not exists(select 1 from jsonb_array_elements(coalesce(candidate->'vendas','[]')||coalesce(candidate->'vendasBalcao','[]')) sale where sale->>'id'=t->>'vendaId') then raise exception 'Recebível sem venda vinculada.' using errcode='42501';end if;
   receivables:=receivables||jsonb_build_array(t);
  end loop;
  -- Validate the pending sales titles against canonical credit and sale amounts, without exposing the ledger.
  for sale in select value from jsonb_array_elements(coalesce(candidate->'vendas','[]')||coalesce(candidate->'vendasBalcao','[]')) loop
   if not exists(select 1 from jsonb_array_elements(coalesce(candidate->'contasReceber','[]')) nt where nt->>'vendaId'=sale->>'id') then continue;end if;
   select coalesce(sum((rt->>'valor')::numeric),0) into linked from jsonb_array_elements(receivables) rt where rt->>'vendaId'=sale->>'id';
   if linked>coalesce((sale->>'totalGeral')::numeric,(sale->>'total')::numeric,(sale->>'qtd')::numeric*(sale->>'precoUnitario')::numeric,0) then raise exception 'Recebíveis excedem o valor da venda.' using errcode='42501';end if;
   select value into customer from jsonb_array_elements(coalesce(candidate->'clientes','[]')) where value->>'id'=sale->>'clienteId';
   select value into prior_customer from jsonb_array_elements(coalesce(a.estado->'clientes','[]')) where value->>'id'=sale->>'clienteId';
   limit_value:=coalesce((prior_customer->>'limiteCredito')::numeric,0);
   select coalesce(sum(coalesce((rt->>'saldoAberto')::numeric,(rt->>'valor')::numeric,0)),0) into used from jsonb_array_elements(receivables) rt where rt->>'clienteId'=sale->>'clienteId' and upper(coalesce(rt->>'status','')) !~ '^(PAGO|LIQUIDADO|RECEBIDO|CANCELADO)';
   if used>limit_value then raise exception 'Venda excede o crédito disponível do cliente.' using errcode='42501';end if;
  end loop;
  for customer in select value from jsonb_array_elements(coalesce(candidate->'clientes','[]')) loop
   select value into prior_customer from jsonb_array_elements(coalesce(a.estado->'clientes','[]')) where value->>'id'=customer->>'id';
   if coalesce((customer->>'limiteCredito')::numeric,0)<>coalesce((prior_customer->>'limiteCredito')::numeric,0) then raise exception 'Limite de crédito exige Master.' using errcode='42501';end if;
  end loop;
  candidate:=jsonb_set(candidate,'{contasReceber}',receivables);
  for t in select value from jsonb_array_elements(coalesce(candidate->'documentos','[]')) where value->>'categoria'='COMPROVANTE FRETE' loop
   select value into oldtitle from jsonb_array_elements(coalesce(a.estado->'documentos','[]')) where value->>'id'=t->>'id';
   if oldtitle is null and (coalesce(t->>'validationStatus','RECEBIDO')<>'RECEBIDO' or t ? 'validadoFinanceiroPor') or oldtitle is not null and ((oldtitle ? 'validadoFinanceiroPor' and t is distinct from oldtitle) or (t->'validationStatus',t->'validadoFinanceiroPor',t->'storagePath',t->'hash',t->'cargaId',t->'categoria') is distinct from (oldtitle->'validationStatus',oldtitle->'validadoFinanceiroPor',oldtitle->'storagePath',oldtitle->'hash',oldtitle->'cargaId',oldtitle->'categoria')) then raise exception 'Autorização do comprovante de frete exige Master.' using errcode='42501';end if;
  end loop;
  for oldtitle in select value from jsonb_array_elements(coalesce(a.estado->'documentos','[]')) where value->>'categoria'='COMPROVANTE FRETE' and value ? 'validadoFinanceiroPor' loop
   if not exists(select 1 from jsonb_array_elements(coalesce(candidate->'documentos','[]')) doc where doc=oldtitle) then raise exception 'Comprovante financeiro autorizado não pode ser alterado ou removido por este perfil.' using errcode='42501';end if;
  end loop;
  -- Closed cash records remain immutable, including the hidden financial report.
  for cx in select value from jsonb_array_elements(coalesce(candidate->'caixasBalcao','[]')) loop
   select value into oldcx from jsonb_array_elements(coalesce(a.estado->'caixasBalcao','[]')) where value->>'id'=cx->>'id';
   if oldcx->>'status'='FECHADO' then
    if (cx-'resumoFinanceiro'-'resultadoFinanceiro') is distinct from (oldcx-'resumoFinanceiro'-'resultadoFinanceiro') then raise exception 'Caixa fechado é imutável.';end if;
    cx:=oldcx;
   end if;
   cash:=cash||jsonb_build_array(cx);
  end loop;
  candidate:=jsonb_set(candidate,'{caixasBalcao}',cash);
 end if;
 perform private.fc_validar_alteracao_financeira(coalesce(a.estado,'{}'),candidate,can_finance);
 if p_versao is null then
  insert into public.fc_app_state(empresa_id,estado,versao,updated_by) values(empresa,candidate,1,auth.uid()) returning * into a;
 else
  update public.fc_app_state set estado=candidate,versao=p_versao+1,updated_by=auth.uid() where empresa_id=empresa and versao=p_versao returning * into a;
  if not found then raise exception 'A base foi atualizada. Atualize antes de gravar.' using errcode='40001';end if;
 end if;
 return jsonb_build_object('estado',private.fc_projetar_estado(a.estado,can_finance),'versao',a.versao);
end $$;
create function public.fc_salvar_estado_projetado(p_estado jsonb,p_versao bigint) returns jsonb language sql security invoker set search_path='' as $$select private.fc_salvar_estado_projetado(p_estado,p_versao)$$;
revoke all on function private.fc_finance_keys(),private.fc_projetar_estado(jsonb,boolean),private.fc_carregar_estado(),private.fc_salvar_estado_projetado(jsonb,bigint),public.fc_carregar_estado(),public.fc_salvar_estado_projetado(jsonb,bigint) from public,anon;
-- Projection helpers are internal implementation details, not callable by clients.
revoke all on function private.fc_finance_keys(),private.fc_projetar_estado(jsonb,boolean) from authenticated;
grant execute on function private.fc_carregar_estado(),private.fc_salvar_estado_projetado(jsonb,bigint),public.fc_carregar_estado(),public.fc_salvar_estado_projetado(jsonb,bigint) to authenticated;
commit;
