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

update public.access_requests r set assigned_role=p.role::text from public.profiles p where p.id=r.user_id and r.status='APROVADO';
create function private.access_granted_for(p_user uuid,p_app text) returns boolean language sql stable security definer set search_path='' as $$
 select p_app='fiscal' and exists(select 1 from public.profiles where id=p_user and active and not must_change_password) and case when exists(select 1 from public.access_requests where user_id=p_user and app=p_app) then exists(select 1 from public.access_requests where user_id=p_user and app=p_app and status='APROVADO') else not exists(select 1 from public.access_requests where user_id=p_user and managed_account) end;
$$;
create function private.access_role_for(p_user uuid,p_app text) returns text language sql stable security definer set search_path='' as $$
 select case when private.access_granted_for(p_user,p_app) then coalesce((select assigned_role from public.access_requests where user_id=p_user and app=p_app and status='APROVADO'),(select role::text from public.profiles where id=p_user)) end;
$$;
create function private.access_can_review(p_user uuid,p_app text) returns boolean language sql stable security definer set search_path='' as $$select coalesce(private.access_role_for(p_user,p_app) in ('MASTER','ADMINISTRADOR'),false)$$;
create function private.access_assert_same_scope(p_actor uuid,p_target uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.user_establishments t where t.user_id=p_target and not exists(select 1 from public.user_establishments a where a.user_id=p_actor and a.establishment_id=t.establishment_id)) then raise exception 'Usuário fora dos estabelecimentos autorizados.' using errcode='42501';end if;
end;$$;
create or replace function private.access_app_allowed(p_app text) returns boolean language sql stable security definer set search_path='' as $$select private.access_granted_for(auth.uid(),p_app)$$;
create function public.access_module_context(p_user uuid,p_app text) returns jsonb language sql stable security invoker set search_path='' as $$select jsonb_build_object('allowed',private.access_granted_for(p_user,p_app),'role',private.access_role_for(p_user,p_app),'isAdmin',private.access_can_review(p_user,p_app),'permissions','{}'::jsonb)$$;
revoke all on function private.access_granted_for(uuid,text),private.access_role_for(uuid,text),private.access_can_review(uuid,text),private.access_assert_same_scope(uuid,uuid),public.access_module_context(uuid,text) from public,anon,authenticated;
grant execute on function private.access_granted_for(uuid,text),private.access_role_for(uuid,text),private.access_can_review(uuid,text),private.access_assert_same_scope(uuid,uuid),public.access_module_context(uuid,text) to service_role;

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
CREATE OR REPLACE FUNCTION public.access_review_with_role(p_request uuid, p_actor uuid, p_decision text, p_role text, p_units uuid[], p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.access_requests; a public.profiles; t public.profiles; chosen text; units uuid[];
begin
 if not private.access_is_admin(p_actor) then raise exception 'Somente admin ou master aprovado pode analisar.' using errcode='42501'; end if;
 select * into a from public.profiles where id=p_actor for share;
 select * into r from public.access_requests where id=p_request for update;
 if not found or r.status<>'PENDENTE' or r.app<>'fiscal' then raise exception 'Cadastro não está aguardando análise.'; end if;
 if not private.access_can_review(p_actor,r.app) then raise exception 'Sem autorização neste módulo.';end if;
 select * into t from public.profiles where id=r.user_id for update;
 if not found then raise exception 'Cadastro não permitido.';end if;
 perform private.access_assert_same_scope(p_actor,r.user_id);
 if t.role::text in ('MASTER','ADMINISTRADOR','ULTRA_ADMIN') and a.role::text not in ('MASTER','ULTRA_ADMIN') then raise exception 'Somente master pode analisar usuários administrativos.' using errcode='42501'; end if;
 if p_decision is null or p_decision not in ('APROVADO','RECUSADO') or (p_decision='RECUSADO' and length(trim(coalesce(p_reason,'')))<3) then raise exception 'Informe decisão e motivo válidos.'; end if;
 if p_decision='APROVADO' then
  chosen:=nullif(trim(p_role),'');
  if chosen is null then raise exception 'Selecione o perfil do usuário antes de aprovar.'; end if;
  if not chosen=any(array['MASTER','ADMINISTRADOR','OPERADOR_GERAL','OPERADOR_PATIO','MOTORISTA','VENDEDOR_EXTERNO','VENDEDOR_INTERNO']) then raise exception 'Perfil inválido para este sistema.'; end if;
  if chosen in ('MASTER','ADMINISTRADOR') and a.role::text not in ('MASTER','ULTRA_ADMIN') then raise exception 'Somente master pode conceder perfil master ou administrador.' using errcode='42501'; end if;
  units:=array(select distinct x from unnest(coalesce(p_units,'{}'::uuid[])) x);
  if cardinality(units)=0 or exists(select 1 from unnest(units) x where x is null or not exists(select 1 from public.user_establishments ue join public.establishments e on e.id=ue.establishment_id where ue.user_id=p_actor and ue.establishment_id=x and e.active)) then raise exception 'Escolha ao menos uma unidade fiscal autorizada.';end if;
  update public.profiles set active=true,role=chosen::public.user_role where id=r.user_id;
  insert into public.user_establishments(user_id,establishment_id) select r.user_id,x from unnest(units) x on conflict do nothing;
  -- Auth metadata is synchronized by access-standard using the Admin API.
 end if;
 update public.access_requests set status=p_decision,reviewed_by=p_actor,reviewed_at=now(),reason=nullif(trim(p_reason),''),assigned_role=case when p_decision='APROVADO' then chosen else assigned_role end where id=r.id;
 insert into public.access_audit(app,event,user_id) values(r.app,'PERFIL_'||coalesce(chosen,t.role::text)||'_'||p_decision,r.user_id);
 return jsonb_build_object('status',p_decision,'app',r.app,'role',coalesce(chosen,t.role::text));
end;$function$;


create function public.access_current_module(p_app text) returns jsonb language sql stable security definer set search_path='' as $$select public.access_module_context(auth.uid(),p_app)$$;
revoke all on function public.access_current_module(text) from public,anon;
grant execute on function public.access_current_module(text) to authenticated,service_role;
commit;
