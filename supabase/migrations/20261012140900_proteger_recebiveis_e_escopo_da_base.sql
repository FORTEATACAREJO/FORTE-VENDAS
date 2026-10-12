-- Restrictive policy prevents broader permissive policies from crossing company/role boundaries.
create policy fc_state_operational_scope on public.fc_app_state as restrictive
for all to authenticated
using (public.fc_pode_operar_base(empresa_id))
with check (public.fc_pode_operar_base(empresa_id));

create or replace function private.fc_validar_alteracao_financeira(p_old jsonb,p_new jsonb,p_financeiro boolean)
returns void language plpgsql set search_path='' as $$
declare k text;t jsonb;prior jsonb;payment jsonb;amount numeric;received numeric;open_amount numeric;seen text[];
begin
 if not p_financeiro then
  foreach k in array array['contasPagar','pagamentosFretes','fornecedorCreditos','emprestimos','contasBancarias','extratosBancarios','conciliacoesFinanceiras','bankConnections','preConferenciaBoletos','pagamentosItau','despesas'] loop
   if coalesce(p_new->k,'[]'::jsonb) is distinct from coalesce(p_old->k,'[]'::jsonb) then
    raise exception 'Alteração de % exige permissão financeira aprovada.',k using errcode='42501';
   end if;
  end loop;
  for prior in select value from jsonb_array_elements(coalesce(p_old->'contasReceber','[]')) loop
   select value into t from jsonb_array_elements(coalesce(p_new->'contasReceber','[]')) where value->>'id'=prior->>'id';
   if t is distinct from prior then raise exception 'Alterar ou remover um recebível existente exige permissão financeira.' using errcode='42501';end if;
  end loop;
 end if;
 foreach k in array array['contasReceber','contasPagar'] loop
  if p_new->k is not null and jsonb_typeof(p_new->k)<>'array' then raise exception 'Lista financeira inválida: %.',k;end if;
  seen:='{}';
  for t in select value from jsonb_array_elements(coalesce(p_new->k,'[]')) loop
   if nullif(t->>'id','') is null or (t->>'id')=any(seen) then raise exception 'Título sem identificação ou duplicado: %.',k;end if;
   seen:=array_append(seen,t->>'id');
   select value into prior from jsonb_array_elements(coalesce(p_old->k,'[]')) where value->>'id'=t->>'id';
   if t is not distinct from prior then continue;end if;
   amount:=private.fc_dinheiro(t->>'valor');
   received:=private.fc_dinheiro(coalesce(t->>case when k='contasReceber' then 'valorRecebido' else 'valorPago' end,'0'));
   if amount<0 or received<0 or received>amount then raise exception 'Valor ou baixa financeira inválida.';end if;
   if t->'saldoAberto' is not null and t->'saldoAberto'<>'null'::jsonb and upper(coalesce(t->>'status','')) not like 'CANCELAD%' then
    open_amount:=private.fc_dinheiro(t->>'saldoAberto');
    if open_amount<0 or open_amount<>amount-received then raise exception 'Saldo aberto diverge do valor e das baixas.';end if;
   end if;
   if not p_financeiro and prior is null and (received<>0 or coalesce(jsonb_array_length(t->'pagamentos'),0)>0 or upper(coalesce(t->>'status','')) ~ '^(PAGO|PAGA|LIQUIDADO|RECEBIDO|CREDITADO|CONCILIADO)') then
    raise exception 'Recebimento ou liquidação exige permissão financeira.' using errcode='42501';
   end if;
   for payment in select value from jsonb_array_elements(coalesce(t->'pagamentos','[]')) loop
    if payment->>'origem'='COMPROVANTE ANEXADO' and not coalesce(prior->'pagamentos','[]'::jsonb) @> jsonb_build_array(payment) then
     raise exception 'Comprovante anexado é evidência; confirme o recebimento na conciliação antes de baixar.';
    end if;
   end loop;
  end loop;
 end loop;
end;$$;
revoke all on function private.fc_validar_alteracao_financeira(jsonb,jsonb,boolean) from public,anon;
grant execute on function private.fc_validar_alteracao_financeira(jsonb,jsonb,boolean) to authenticated,service_role;

create or replace function private.fc_guardar_alteracoes_financeiras()
returns trigger language plpgsql set search_path='' as $$
begin
 if current_user='authenticated' then
  if new.empresa_id is distinct from old.empresa_id then raise exception 'Não é permitido trocar a empresa da base.' using errcode='42501';end if;
  perform private.fc_validar_alteracao_financeira(old.estado,new.estado,public.fc_eh_admin() or private.can_access_financeiro(new.empresa_id));
 end if;
 return new;
end;$$;
revoke all on function private.fc_guardar_alteracoes_financeiras() from public,anon;
create trigger fc_00_guardar_alteracoes_financeiras before update on public.fc_app_state
for each row execute function private.fc_guardar_alteracoes_financeiras();
