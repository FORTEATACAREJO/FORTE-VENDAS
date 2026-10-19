-- Existing unmanaged users retain their effective legacy access. New managed grants are module specific.
update public.access_requests r set assigned_role=p.perfil::text from public.fc_perfis p where p.user_id=r.user_id and r.status='APROVADO';
create function private.access_granted_for(p_user uuid,p_app text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare p public.fc_perfis;r public.access_requests;
begin
 if p_app not in ('vendas','financeiro','venda-externa','carga-direta','patio','site') then return false;end if;
 select * into p from public.fc_perfis where user_id=p_user;
 if not found or not p.ativo or p.status_aprovacao is distinct from 'APROVADO' or p.trocar_senha then return false;end if;
 select * into r from public.access_requests where user_id=p_user and app=p_app;
 if found then return r.status='APROVADO';end if;
 if exists(select 1 from public.access_requests where user_id=p_user and managed_account) then return false;end if;
 if p.perfil in ('MASTER','ADMINISTRADOR') then return true;end if;
 if coalesce(p.permissoes->p_app='true',false) then return true;end if;
 if p_app='financeiro' then return coalesce(p.permissoes->'FINANCEIRO'='true',false);end if;
 if p_app='venda-externa' then return p.perfil='VENDEDOR_EXTERNO';end if;
 if p_app='patio' then return p.perfil='OPERADOR_PATIO';end if;
 if p_app='vendas' then return p.perfil not in ('OPERADOR_PATIO','MOTORISTA','VENDEDOR_EXTERNO');end if;
 return false;
end;$$;
create function private.access_role_for(p_user uuid,p_app text) returns text language sql stable security definer set search_path='' as $$
 select case when private.access_granted_for(p_user,p_app) then coalesce((select assigned_role from public.access_requests where user_id=p_user and app=p_app and status='APROVADO'),(select perfil::text from public.fc_perfis where user_id=p_user)) end;
$$;
create function private.access_can_review(p_user uuid,p_app text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.access_role_for(p_user,p_app) in ('MASTER','ADMINISTRADOR'),false);
$$;
create function private.access_assert_same_scope(p_actor uuid,p_target uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.fc_perfis a join public.fc_perfis t on a.empresa_id=t.empresa_id where a.user_id=p_actor and t.user_id=p_target) then raise exception 'Usuário fora da empresa autorizada.' using errcode='42501';end if;
end;$$;
revoke all on function private.access_assert_same_scope(uuid,uuid) from public,anon,authenticated;
grant execute on function private.access_assert_same_scope(uuid,uuid) to service_role;
create or replace function private.access_app_allowed(p_app text) returns boolean language sql stable security definer set search_path='' as $$select private.access_granted_for(auth.uid(),p_app)$$;
create function public.access_module_context(p_user uuid,p_app text) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('allowed',private.access_granted_for(p_user,p_app),'role',private.access_role_for(p_user,p_app),'isAdmin',private.access_can_review(p_user,p_app),'permissions',coalesce((select assigned_permissions from public.access_requests where user_id=p_user and app=p_app and status='APROVADO'),(select permissoes from public.fc_perfis where user_id=p_user),'{}'::jsonb));
$$;
create or replace function public.fc_eh_admin() returns boolean language sql stable security definer set search_path='' as $$select private.access_can_review(auth.uid(),'vendas')$$;
create or replace function public.fc_eh_master() returns boolean language sql stable security definer set search_path='' as $$select coalesce(private.access_role_for(auth.uid(),'vendas')='MASTER',false)$$;
create or replace function private.can_access_financeiro(p_empresa_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.access_role_for(auth.uid(),'financeiro')='MASTER',false) and exists(select 1 from public.fc_perfis where user_id=auth.uid() and empresa_id=p_empresa_id);
$$;
create or replace function public.fc_pode_operar_base(p_empresa uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.access_granted_for(auth.uid(),'vendas') and public.fc_usuario_ativo() and private.access_role_for(auth.uid(),'vendas') not in ('OPERADOR_PATIO','CONFERENCIA','CONSULTA','MOTORISTA','MOTORISTA_ENTREGA') and exists(select 1 from public.fc_perfis where user_id=auth.uid() and empresa_id=p_empresa);
$$;
create or replace function public.fc_pode(modulo text,acao text) returns boolean language sql stable security definer set search_path='' as $$
 select private.access_granted_for(auth.uid(),case when upper(modulo) in ('FINANCEIRO','BANCOS') then 'financeiro' else 'vendas' end) and (private.access_role_for(auth.uid(),case when upper(modulo) in ('FINANCEIRO','BANCOS') then 'financeiro' else 'vendas' end) in ('MASTER','ADMINISTRADOR') or exists(select 1 from public.fc_perfis where user_id=auth.uid() and coalesce((permissoes->upper(modulo)->>lower(acao))::boolean,false)));
$$;
-- Raw JSON contains financial data. Commercial users use the existing projected RPC instead.
create policy module_state_private_read on public.fc_app_state as restrictive for select to authenticated using(private.can_access_financeiro(empresa_id));
alter policy access_standard_vendas_state on public.fc_app_state using(private.access_app_allowed('vendas') or private.can_access_financeiro(empresa_id)) with check(private.access_app_allowed('vendas'));
revoke all on function private.access_granted_for(uuid,text),private.access_role_for(uuid,text),private.access_can_review(uuid,text),public.access_module_context(uuid,text) from public,anon,authenticated;
grant execute on function private.access_granted_for(uuid,text),private.access_role_for(uuid,text),private.access_can_review(uuid,text),public.access_module_context(uuid,text) to service_role;
