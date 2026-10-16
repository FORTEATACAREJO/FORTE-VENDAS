begin;
-- Release candidate: never applied automatically. Existing balances and records remain intact.
create or replace function private.can_access_financeiro(p_empresa_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.access_app_allowed('vendas') and exists(select 1 from public.fc_perfis p
 where p.user_id=auth.uid() and p.empresa_id=p_empresa_id and p.ativo and p.status_aprovacao='APROVADO'
 and not p.trocar_senha and p.perfil='MASTER')
$$;
revoke all on function private.can_access_financeiro(uuid) from public,anon;
grant execute on function private.can_access_financeiro(uuid) to authenticated,service_role;
-- The historical admin shortcut must not bypass the financial authorization helper.
create or replace function private.fc_guardar_alteracoes_financeiras()
returns trigger language plpgsql set search_path='' as $$
begin
 if current_user='authenticated' then
  if new.empresa_id is distinct from old.empresa_id then raise exception 'Não é permitido trocar a empresa da base.' using errcode='42501';end if;
  perform private.fc_validar_alteracao_financeira(old.estado,new.estado,private.can_access_financeiro(new.empresa_id));
 end if;
 return new;
end;$$;
revoke all on function private.fc_guardar_alteracoes_financeiras() from public,anon;
commit;
