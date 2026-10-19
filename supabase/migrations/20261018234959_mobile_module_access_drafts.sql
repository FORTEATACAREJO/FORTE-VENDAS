begin;
-- Included verbatim in the project migration; not applied separately.
create table public.access_registration_drafts(
 user_id uuid not null references auth.users(id) on delete cascade,
 app text not null,status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED')),
 data jsonb not null default '{}' check(jsonb_typeof(data)='object'),revision integer not null default 0,
 correction_reason text,updated_at timestamptz not null default now(),primary key(user_id,app),
 foreign key(user_id,app) references public.access_requests(user_id,app) on delete cascade
);
alter table public.access_registration_drafts enable row level security;
revoke all on public.access_registration_drafts from public,anon,authenticated;
grant all on public.access_registration_drafts to service_role;
create function private.access_create_registration_draft() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.app in ('vendas','financeiro','venda-externa','fiscal') then
  insert into public.access_registration_drafts(user_id,app,data) values(new.user_id,new.app,jsonb_build_object('nome',new.nome,'cpf',new.cpf,'whatsapp',new.whatsapp,'email',new.email,'data_nascimento',new.data_nascimento)) on conflict do nothing;
 end if;return new;
end;$$;
revoke all on function private.access_create_registration_draft() from public,anon,authenticated;
create trigger access_create_registration_draft after insert on public.access_requests for each row execute function private.access_create_registration_draft();
alter table public.access_requests add column assigned_role text,add column assigned_permissions jsonb not null default '{}';
alter table public.access_requests drop constraint access_requests_status_check;
alter table public.access_requests add constraint access_requests_status_check check(status in ('PENDENTE','APROVADO','RECUSADO','SUSPENSO','REVOGADO'));

create function public.access_save_registration(p_user uuid,p_app text,p_data jsonb,p_revision integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare d public.access_registration_drafts;r public.access_requests;v jsonb;k text;
begin
 select * into strict r from public.access_requests where user_id=p_user and app=p_app for update;
 select * into strict d from public.access_registration_drafts where user_id=p_user and app=p_app for update;
 if r.status<>'PENDENTE' or d.status<>'DRAFT' then raise exception 'Cadastro não está aberto para edição.';end if;
 if p_revision is distinct from d.revision then raise exception 'Cadastro alterado em outra tela. Entre novamente para carregar a versão atual.';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>12000 then raise exception 'Dados inválidos.';end if;
 v:='{}';foreach k in array array['cpf','nome','whatsapp','data_nascimento','email','observacao'] loop if p_data ? k then v:=v||jsonb_build_object(k,p_data->k);end if;end loop;
 if regexp_replace(coalesce(v->>'cpf',''),'[^0-9]','','g')<>r.cpf then raise exception 'O CPF não pode ser alterado.';end if;
 update public.access_registration_drafts set data=v,revision=revision+1,updated_at=now() where user_id=p_user and app=p_app;
 return jsonb_build_object('revision',d.revision+1);
end;$$;

create function public.access_submit_registration(p_user uuid,p_app text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare d public.access_registration_drafts;r public.access_requests;v jsonb;
begin
 select * into strict r from public.access_requests where user_id=p_user and app=p_app for update;
 select * into strict d from public.access_registration_drafts where user_id=p_user and app=p_app for update;
 if r.status<>'PENDENTE' then raise exception 'Cadastro não está aberto para envio.';end if;
 if d.status='SUBMITTED' then return jsonb_build_object('status','SUBMITTED');end if;
 v:=d.data;
 if length(btrim(coalesce(v->>'nome','')))<5 or position(' ' in btrim(coalesce(v->>'nome','')))=0 or regexp_replace(coalesce(v->>'cpf',''),'[^0-9]','','g')<>r.cpf or regexp_replace(coalesce(v->>'whatsapp',''),'[^0-9]','','g') !~ '^(55)?[1-9][0-9][2-9][0-9]{7,8}$' or (nullif(v->>'data_nascimento','')::date<current_date) is distinct from true then raise exception 'Complete nome, CPF, WhatsApp e nascimento válidos.';end if;
 if coalesce(v->>'email','')<>'' and v->>'email' !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'E-mail inválido.';end if;
 update public.access_requests set nome=v->>'nome',whatsapp=v->>'whatsapp',data_nascimento=(v->>'data_nascimento')::date,email=nullif(v->>'email','') where id=r.id;
 update public.access_registration_drafts set status='SUBMITTED',revision=revision+1,updated_at=now() where user_id=p_user and app=p_app;
 insert into public.access_audit(app,event,user_id) values(p_app,'CADASTRO_COMPLETO_ENVIADO',p_user);
 return jsonb_build_object('status','SUBMITTED');
end;$$;

create function private.access_complete_before_approval() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status='APROVADO' and exists(select 1 from public.access_registration_drafts where user_id=new.user_id and app=new.app and status<>'SUBMITTED') then raise exception 'O usuário deve enviar o cadastro completo antes da aprovação.';end if;
 return new;
end;$$;
create trigger access_complete_before_approval before update on public.access_requests for each row execute function private.access_complete_before_approval();
revoke all on function public.access_save_registration(uuid,text,jsonb,integer),public.access_submit_registration(uuid,text) from public,anon,authenticated;
grant execute on function public.access_save_registration(uuid,text,jsonb,integer),public.access_submit_registration(uuid,text) to service_role;

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

CREATE OR REPLACE FUNCTION public.access_review_with_role(p_request uuid, p_actor uuid, p_decision text, p_role text, p_units uuid[], p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.access_requests; a public.fc_perfis; t public.fc_perfis; chosen text; units uuid[];
begin
 if not private.access_is_admin(p_actor) then raise exception 'Somente admin ou master aprovado pode analisar.' using errcode='42501'; end if;
 select * into a from public.fc_perfis where user_id=p_actor for share;
 select * into r from public.access_requests where id=p_request for update;
 if not found or r.status<>'PENDENTE' then raise exception 'Cadastro não está aguardando análise.'; end if;
 if not private.access_can_review(p_actor,r.app) then raise exception 'Sem autorização administrativa para este módulo.' using errcode='42501';end if;
 select * into t from public.fc_perfis where user_id=r.user_id for update;
 if not found or t.empresa_id is distinct from a.empresa_id then raise exception 'Cadastro não permitido.'; end if;
 if t.perfil::text in ('MASTER','ADMINISTRADOR','ULTRA_ADMIN') and a.perfil::text not in ('MASTER','ULTRA_ADMIN') then raise exception 'Somente master pode analisar usuários administrativos.' using errcode='42501'; end if;
 if p_decision is null or p_decision not in ('APROVADO','RECUSADO') or (p_decision='RECUSADO' and length(trim(coalesce(p_reason,'')))<3) then raise exception 'Informe decisão e motivo válidos.'; end if;
 if p_decision='APROVADO' then
  chosen:=nullif(trim(p_role),'');
  if chosen is null then raise exception 'Selecione o perfil do usuário antes de aprovar.'; end if;
  if not chosen=any(array['MASTER','ADMINISTRADOR','OPERADOR_GERAL','OPERADOR_PATIO','MOTORISTA','VENDEDOR_EXTERNO','VENDEDOR_INTERNO']) then raise exception 'Perfil inválido para este sistema.'; end if;
  if chosen in ('MASTER','ADMINISTRADOR') and private.access_role_for(p_actor,r.app) not in ('MASTER','ULTRA_ADMIN') then raise exception 'Somente master pode conceder perfil master ou administrador.' using errcode='42501'; end if;
  update public.fc_perfis set ativo=true,status_aprovacao='APROVADO',aprovado_por=p_actor,aprovado_em=now(),perfil=case when not t.ativo then chosen::public.fc_perfil else t.perfil end,permissoes=permissoes||jsonb_build_object(r.app,true) where user_id=r.user_id;
  -- Auth metadata is synchronized by access-standard using the Admin API.
 end if;
 update public.access_requests set status=p_decision,reviewed_by=p_actor,reviewed_at=now(),reason=nullif(trim(p_reason),''),assigned_role=case when p_decision='APROVADO' then chosen else assigned_role end where id=r.id;
 insert into public.access_audit(app,event,user_id) values(r.app,'PERFIL_'||coalesce(chosen,t.perfil::text)||'_'||p_decision,r.user_id);
 return jsonb_build_object('status',p_decision,'app',r.app,'role',coalesce(chosen,t.perfil::text));
end;$function$
;


create function public.access_change_module_state(p_actor uuid,p_request uuid,p_app text,p_state text,p_reason text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.access_requests;
begin
 if not private.access_can_review(p_actor,p_app) then raise exception 'Sem autorização administrativa para este módulo.' using errcode='42501';end if;
 select * into strict r from public.access_requests where id=p_request and app=p_app for update;
 perform private.access_assert_same_scope(p_actor,r.user_id);
 if p_state not in ('APROVADO','SUSPENSO','REVOGADO') or length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Informe situação e motivo válidos.';end if;
 if r.status not in ('APROVADO','SUSPENSO','REVOGADO') then raise exception 'Analise primeiro a solicitação pendente.';end if;
 if r.assigned_role in ('MASTER','ADMINISTRADOR') and private.access_role_for(p_actor,p_app)<>'MASTER' then raise exception 'Somente Master do módulo pode alterar um acesso administrativo.';end if;
 if r.user_id=p_actor then raise exception 'Peça a outro Master autorizado para alterar seu próprio acesso.';end if;
 update public.access_requests set status=p_state,reason=left(p_reason,1000),reviewed_by=p_actor,reviewed_at=now() where id=r.id;
 insert into public.access_audit(app,event,user_id) values(p_app,'ACESSO_'||r.status||'_'||p_state||'_POR_'||p_actor::text,r.user_id);
 return jsonb_build_object('message','Situação alterada somente neste módulo.','status',p_state);
end;$$;
create function public.access_request_correction(p_actor uuid,p_request uuid,p_app text,p_reason text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.access_requests;
begin
 if not private.access_can_review(p_actor,p_app) then raise exception 'Sem autorização administrativa para este módulo.' using errcode='42501';end if;
 select * into strict r from public.access_requests where id=p_request and app=p_app for update;
 perform private.access_assert_same_scope(p_actor,r.user_id);
 if r.status not in ('PENDENTE','RECUSADO') or length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Informe motivo e um cadastro pendente ou recusado.';end if;
 if not exists(select 1 from public.access_registration_drafts where user_id=r.user_id and app=p_app) then raise exception 'Este cadastro anterior deve ser revisado pelo fluxo existente.';end if;
 update public.access_registration_drafts set status='DRAFT',correction_reason=left(p_reason,1000),revision=revision+1,updated_at=now() where user_id=r.user_id and app=p_app;
 update public.access_requests set status='PENDENTE',reason=left(p_reason,1000),reviewed_by=p_actor,reviewed_at=now() where id=r.id;
 insert into public.access_audit(app,event,user_id) values(p_app,'CORRECAO_SOLICITADA_POR_'||p_actor::text,r.user_id);
 return jsonb_build_object('message','Correção solicitada. O usuário retomará o formulário ao entrar.');
end;$$;
revoke all on function public.access_change_module_state(uuid,uuid,text,text,text),public.access_request_correction(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.access_change_module_state(uuid,uuid,text,text,text),public.access_request_correction(uuid,uuid,text,text) to service_role;
CREATE OR REPLACE FUNCTION private.fc_itau_profile()
 RETURNS fc_perfis
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.fc_perfis;
begin
 if not private.access_app_allowed('financeiro') then raise exception 'Aprovação financeira obrigatória.' using errcode='42501';end if;
 if auth.uid() is null then raise exception 'Entre no sistema.';end if;
 select * into p from public.fc_perfis where user_id=auth.uid();
 p.perfil:=private.access_role_for(auth.uid(),'financeiro')::public.fc_perfil;
 if not found or p.ativo is not true or p.status_aprovacao is distinct from 'APROVADO' or coalesce(p.trocar_senha,false)
 or not (p.perfil in('MASTER','ADMINISTRADOR') or (p.perfil in('OPERADOR_GERAL','VENDEDOR_INTERNO') and coalesce(p.permissoes->'COBRANÇAS ITAÚ'->>'editar','false')='true')) then raise exception 'Emissão não autorizada.';end if;
 return p;
end $function$;

CREATE OR REPLACE FUNCTION private.fc_identidade_banco()
 RETURNS fc_perfis
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.fc_perfis;
begin
 select * into p from public.fc_perfis where user_id=auth.uid();
 if auth.uid() is null or not found or not p.ativo or p.trocar_senha or p.status_aprovacao<>'APROVADO'
 or not public.fc_pode_acessar_financeiro(p.empresa_id) then raise exception 'Acesso financeiro ativo e aprovado obrigatório.' using errcode='42501';end if;p.perfil:=private.access_role_for(auth.uid(),'financeiro')::public.fc_perfil;return p;
end;$function$;

CREATE OR REPLACE FUNCTION private.fc_identidade_patio(p_fechamento boolean DEFAULT false)
 RETURNS fc_perfis
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.fc_perfis;
begin
 if not private.access_app_allowed(case when p_fechamento then 'vendas' else 'patio' end) then raise exception 'Aplicativo aguardando aprovação.' using errcode='42501';end if;
 select * into p from public.fc_perfis where user_id=auth.uid();
 if auth.uid() is null or not found or not p.ativo or p.status_aprovacao<>'APROVADO' or p.trocar_senha
 or not public.fc_usuario_ativo() then raise exception 'Acesso ativo e aprovado obrigatório.' using errcode='42501';end if;
 p.perfil:=private.access_role_for(auth.uid(),case when p_fechamento then 'vendas' else 'patio' end)::public.fc_perfil;
 if p_fechamento then
  if p.perfil not in ('MASTER','ADMINISTRADOR','CAIXA','VENDAS','VENDEDOR_INTERNO')
   and coalesce(p.permissoes->'VENDAS E COMPRAS'->'editar','false')<>'true'::jsonb then raise exception 'Sem permissão para fechar caixa.' using errcode='42501';end if;
 elsif p.perfil not in ('MASTER','ADMINISTRADOR','OPERADOR_PATIO','CONFERENCIA','CAIXA','VENDAS','VENDEDOR_INTERNO')
  and coalesce(p.permissoes->'patio',p.permissoes->'PATIO',p.permissoes->'PÁTIO / ESTOQUE'->'editar','false')<>'true'::jsonb then
   raise exception 'Sem permissão para conferir pátio.' using errcode='42501';
 end if;
 return p;
end;$function$;

CREATE OR REPLACE FUNCTION private.fc_gravar_workflow(p_empresa uuid, p_actor uuid, p_versao bigint, p_estado jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.fc_app_state;p public.fc_perfis;old_claim text;
begin
 if not private.access_granted_for(p_actor,'vendas') then raise exception 'Módulo sem aprovação.' using errcode='42501';end if;
 select * into p from public.fc_perfis where user_id=p_actor and empresa_id=p_empresa and ativo and status_aprovacao='APROVADO' and not trocar_senha;
 p.perfil:=private.access_role_for(p_actor,'vendas')::public.fc_perfil;
 if not found or p.perfil not in ('MASTER','ADMINISTRADOR','OPERADOR_GERAL','VENDEDOR_INTERNO') then raise exception 'Ator não autorizado.' using errcode='42501';end if;
 if p.perfil not in ('MASTER','ADMINISTRADOR') and not(coalesce(p.permissoes->'vendas'='true',false) or coalesce(p.permissoes->'carga-direta'='true',false) or coalesce(p.permissoes->'VENDAS E COMPRAS'->>'editar'='true',false)) then raise exception 'Sem permissão comercial.' using errcode='42501';end if;
 select * into a from public.fc_app_state where empresa_id=p_empresa for update;
 if not found or a.versao<>p_versao then raise exception 'Conflito de versão.' using errcode='40001';end if;
 if p_estado->'motoristas' is distinct from a.estado->'motoristas' then raise exception 'Motoristas são administrados pelo Forte Frete.' using errcode='42501';end if;
 perform private.fc_validar_alteracao_financeira(a.estado,p_estado,(private.access_role_for(p_actor,'financeiro')='MASTER'));
 old_claim:=current_setting('request.jwt.claim.sub',true);
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 update public.fc_app_state set estado=p_estado,versao=p_versao+1,updated_by=p_actor where empresa_id=p_empresa;
 perform set_config('request.jwt.claim.sub',coalesce(old_claim,''),true);
 return p_versao+1;
end $function$;

CREATE OR REPLACE FUNCTION private.fc_pode_integrar_frete(p_empresa uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select auth.uid() is not null and private.access_app_allowed('vendas') and public.fc_pode_operar_base(p_empresa) and exists(select 1 from public.fc_perfis p where p.user_id=auth.uid() and p.empresa_id=p_empresa and p.ativo and p.status_aprovacao='APROVADO' and not p.trocar_senha and (private.access_role_for(auth.uid(),'vendas') in ('MASTER','ADMINISTRADOR') or (private.access_role_for(auth.uid(),'vendas') in ('OPERADOR_GERAL','VENDEDOR_INTERNO') and (p.permissoes->'vendas'='true' or p.permissoes->'carga-direta'='true' or p.permissoes->'VENDAS E COMPRAS'->>'editar'='true'))))
$function$;


create function public.access_current_module(p_app text) returns jsonb language sql stable security definer set search_path='' as $$select public.access_module_context(auth.uid(),p_app)$$;
revoke all on function public.access_current_module(text) from public,anon;
grant execute on function public.access_current_module(text) to authenticated,service_role;
create or replace function public.employee_review_with_role(p_pending uuid,p_actor uuid,p_action text,p_role text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.fc_usuarios_pendentes;t public.fc_perfis;r public.access_requests;result jsonb;
begin
 if not private.access_can_review(p_actor,'vendas') then raise exception 'Administração autorizada no Forte Vendas é obrigatória.' using errcode='42501';end if;
 select * into strict p from public.fc_usuarios_pendentes where id=p_pending for update;
 if p.auth_user_id is null or p.status not in ('CADASTRO_PENDENTE','PREENCHIMENTO_OBRIGATORIO','AGUARDANDO_APROVACAO') then raise exception 'Cadastro não está aguardando análise.';end if;
 perform private.access_assert_same_scope(p_actor,p.auth_user_id);
 select * into strict t from public.fc_perfis where user_id=p.auth_user_id for update;
 if p_action='APPROVE' and p.status<>'AGUARDANDO_APROVACAO' then raise exception 'O funcionário deve enviar o cadastro completo.';end if;
 if p_action not in ('APPROVE','REJECT') then raise exception 'Ação inválida.';end if;
 insert into public.access_requests(user_id,app,nome,cpf,whatsapp,email,data_nascimento,managed_account) values(t.user_id,'vendas',t.nome,t.cpf,t.whatsapp,t.email,t.data_nascimento,false) on conflict(user_id,app) do nothing;
 select * into strict r from public.access_requests where user_id=t.user_id and app='vendas' for update;
 if p_action='APPROVE' then update public.access_registration_drafts set status='SUBMITTED' where user_id=t.user_id and app='vendas';end if;
 result:=public.access_review_with_role(r.id,p_actor,case p_action when 'APPROVE' then 'APROVADO' else 'RECUSADO' end,p_role,'{}',case when p_action='REJECT' then 'Cadastro recusado pela administração do Forte Vendas.' end);
 update public.fc_usuarios_pendentes set status=case p_action when 'APPROVE' then 'ATIVO' else 'BLOQUEADO' end,analisado_por=p_actor,analisado_em=now() where id=p.id;
 return result||jsonb_build_object('ok',true,'message','Decisão registrada somente no Forte Vendas.');
end;$$;

create or replace function private.access_is_admin(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from unnest(array['vendas','financeiro','venda-externa','carga-direta','patio','site']) app where private.access_can_review(p_user,app))$$;
commit;
