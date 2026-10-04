
create schema if not exists private;
create table if not exists public.access_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 app text not null check(app in ('vendas','financeiro','venda-externa','carga-direta','patio','site','frete','fiscal')),
 nome text not null, cpf text not null, whatsapp text not null, data_nascimento date not null,
 email text, managed_account boolean not null default true, status text not null default 'PENDENTE' check(status in ('PENDENTE','APROVADO','RECUSADO')),
 created_at timestamptz not null default now(), reviewed_at timestamptz, reviewed_by uuid references auth.users(id), reason text,
 unique(user_id,app), check(data_nascimento<current_date)
);
create index if not exists access_requests_pending_idx on public.access_requests(app,created_at) where status='PENDENTE';
alter table public.access_requests enable row level security;
revoke all on public.access_requests from anon,authenticated;
grant select on public.access_requests to authenticated;
create policy access_requests_self on public.access_requests for select to authenticated using(user_id=(select auth.uid()));
create table if not exists public.access_notifications (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references public.access_requests(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, audience text not null check(audience in ('ADMIN','USER')),
 event text not null check(event in ('NOVO_CADASTRO','APROVADO','RECUSADO')), message text not null,
 created_at timestamptz not null default now(), unique(request_id,audience,event)
);
alter table public.access_notifications enable row level security;
revoke all on public.access_notifications from anon,authenticated;
grant select on public.access_notifications to authenticated;
create policy access_notifications_self on public.access_notifications for select to authenticated using(audience='USER' and user_id=(select auth.uid()));
create index if not exists access_notifications_user_idx on public.access_notifications(user_id,created_at);
create index if not exists access_notifications_request_idx on public.access_notifications(request_id);
create or replace function private.access_notify() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
 insert into public.access_notifications(request_id,user_id,audience,event,message) values
 (new.id,new.user_id,'ADMIN','NOVO_CADASTRO','Novo usuário aguardando análise: '||new.nome||' • '||new.app),
 (new.id,new.user_id,'USER','NOVO_CADASTRO','Cadastro enviado para análise. Aguarde aprovação do admin ou master.') on conflict do nothing;
 elsif new.status is distinct from old.status and new.status in ('APROVADO','RECUSADO') then
 insert into public.access_notifications(request_id,user_id,audience,event,message)
 values(new.id,new.user_id,'USER',new.status,case when new.status='APROVADO' then 'Acesso aprovado para '||new.app||'.' else 'Acesso recusado: '||coalesce(new.reason,'Contate o administrador.') end) on conflict do nothing;
 end if;return new;
end;$$;
revoke all on function private.access_notify() from public,anon,authenticated;
create trigger access_notify after insert or update of status on public.access_requests for each row execute function private.access_notify();
create or replace function private.access_app_allowed(p_app text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
 not exists(select 1 from public.access_requests where user_id=(select auth.uid()) and managed_account)
 or exists(select 1 from public.access_requests where user_id=(select auth.uid()) and app=p_app and status='APROVADO'));
$$;
revoke all on function private.access_app_allowed(text) from public,anon;
grant execute on function private.access_app_allowed(text) to authenticated,service_role;

grant all on public.access_requests,public.access_notifications to service_role;

alter table public.fc_perfis add column if not exists data_nascimento date;
create or replace function private.access_is_admin(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.fc_perfis where user_id=p_user and ativo and status_aprovacao='APROVADO' and not trocar_senha and perfil in ('MASTER','ADMINISTRADOR'));
$$;
create or replace function public.access_register_profile(p_user uuid,p_app text,p_nome text,p_cpf text,p_whatsapp text,p_birth date,p_email text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare r uuid; empresa uuid;
begin
 select id into empresa from public.fc_empresas where ativo order by created_at limit 1;
 if empresa is null then raise exception 'Empresa não configurada.';end if;
 insert into public.fc_perfis(user_id,empresa_id,nome,cpf,whatsapp,email,data_nascimento,perfil,ativo,trocar_senha,status_aprovacao)
 values(p_user,empresa,p_nome,p_cpf,p_whatsapp,p_email,p_birth,'CONSULTA',false,false,'PENDENTE');
 insert into public.access_requests(user_id,app,nome,cpf,whatsapp,data_nascimento,email) values(p_user,p_app,p_nome,p_cpf,p_whatsapp,p_birth,p_email) returning id into r;
 return r;
end;$$;
create or replace function public.access_review(p_request uuid,p_actor uuid,p_decision text,p_unit uuid default null,p_reason text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.access_requests; p public.fc_perfis; a public.fc_perfis; new_role public.fc_perfil;
begin
 if not private.access_is_admin(p_actor) then raise exception 'Somente admin ou master aprovado pode analisar.' using errcode='42501';end if;
 select * into a from public.fc_perfis where user_id=p_actor;
 select * into r from public.access_requests where id=p_request for update;
 if not found or r.status<>'PENDENTE' then raise exception 'Cadastro não está aguardando análise.';end if;
 select * into p from public.fc_perfis where user_id=r.user_id for update;
 if p.empresa_id<>a.empresa_id or p.perfil='MASTER' then raise exception 'Cadastro não permitido.';end if;
 if p_decision not in ('APROVADO','RECUSADO') or (p_decision='RECUSADO' and length(trim(coalesce(p_reason,'')))<3) then raise exception 'Informe decisão e motivo válidos.';end if;
 if p_decision='APROVADO' then
 new_role:=p.perfil;
 if r.managed_account and r.app='vendas' then new_role:='VENDAS';
 elsif r.managed_account and r.app='venda-externa' and p.perfil='CONSULTA' then new_role:='VENDEDOR_EXTERNO';
 elsif r.managed_account and r.app='patio' and p.perfil='CONSULTA' then new_role:='OPERADOR_PATIO';end if;
 update public.fc_perfis set ativo=true,status_aprovacao='APROVADO',aprovado_por=p_actor,aprovado_em=now(),perfil=new_role,
 permissoes=permissoes||jsonb_build_object(r.app,true) where user_id=r.user_id;
 end if;
 update public.access_requests set status=p_decision,reviewed_by=p_actor,reviewed_at=now(),reason=nullif(trim(p_reason),'') where id=r.id;
 return jsonb_build_object('status',p_decision,'app',r.app);
end;$$;
-- A new approval for another application cannot unlock the Vendas state.
create policy access_standard_vendas_state on public.fc_app_state as restrictive for all to authenticated
using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
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
 if p_fechamento then
  if p.perfil not in ('MASTER','ADMINISTRADOR','CAIXA','VENDAS','VENDEDOR_INTERNO')
   and coalesce(p.permissoes->'VENDAS E COMPRAS'->'editar','false')<>'true'::jsonb then raise exception 'Sem permissão para fechar caixa.' using errcode='42501';end if;
 elsif p.perfil not in ('MASTER','ADMINISTRADOR','OPERADOR_PATIO','CONFERENCIA','CAIXA','VENDAS','VENDEDOR_INTERNO')
  and coalesce(p.permissoes->'patio',p.permissoes->'PATIO',p.permissoes->'PÁTIO / ESTOQUE'->'editar','false')<>'true'::jsonb then
   raise exception 'Sem permissão para conferir pátio.' using errcode='42501';
 end if;
 return p;
end;$function$;
CREATE OR REPLACE FUNCTION private.can_access_financeiro(p_empresa_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select private.access_app_allowed('financeiro') and exists (
  select 1 from public.fc_perfis p
  left join public.fc_emergency_state e on e.empresa_id=p.empresa_id
  where p.user_id=(select auth.uid()) and p.ativo
   and p.status_aprovacao='APROVADO' and p.empresa_id=p_empresa_id
   and (p.perfil='MASTER' or not coalesce(e.bloqueado,false))
   and (p.perfil in ('MASTER','ADMINISTRADOR','FINANCEIRO')
    or p.permissoes->'financeiro'='true'::jsonb
    or p.permissoes->'FINANCEIRO'='true'::jsonb)
 );
$function$;

revoke all on function private.access_is_admin(uuid) from public,anon,authenticated;
grant execute on function private.access_is_admin(uuid) to service_role;
revoke all on function public.access_register_profile(uuid,text,text,text,text,date,text) from public,anon,authenticated;
grant execute on function public.access_register_profile(uuid,text,text,text,text,date,text) to service_role;
revoke all on function public.access_review(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.access_review(uuid,uuid,text,uuid,text) to service_role;

create or replace function public.fc_eh_admin() returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.fc_perfis where user_id=(select auth.uid()) and ativo and status_aprovacao='APROVADO' and not trocar_senha and perfil in ('MASTER','ADMINISTRADOR'));$$;
create or replace function public.fc_eh_master() returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.fc_perfis where user_id=(select auth.uid()) and ativo and status_aprovacao='APROVADO' and not trocar_senha and perfil='MASTER');$$;
create or replace function public.fc_eh_aprovador_cadastro() returns boolean language sql stable set search_path='' as $$select public.fc_eh_admin();$$;
create policy access_standard_scope on public."pre_conferencia_boletos" as restrictive for all to authenticated using(private.access_app_allowed('financeiro') or private.access_app_allowed('vendas')) with check(private.access_app_allowed('financeiro') or private.access_app_allowed('vendas'));
create policy access_standard_scope on public."pagamentos_itau_lotes" as restrictive for all to authenticated using(private.access_app_allowed('financeiro') or private.access_app_allowed('vendas')) with check(private.access_app_allowed('financeiro') or private.access_app_allowed('vendas'));
create policy access_standard_scope on public."pagamentos_itau_itens" as restrictive for all to authenticated using(private.access_app_allowed('financeiro') or private.access_app_allowed('vendas')) with check(private.access_app_allowed('financeiro') or private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_funcionario_onboarding" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."central_sistemas" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_emergency_state" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_emergency_audit" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_funcionarios_cadastros" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_contas_receber" as restrictive for all to authenticated using(private.access_app_allowed('financeiro') or private.access_app_allowed('vendas')) with check(private.access_app_allowed('financeiro') or private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_caixa_fechamentos" as restrictive for all to authenticated using(private.access_app_allowed('financeiro') or private.access_app_allowed('vendas')) with check(private.access_app_allowed('financeiro') or private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_clientes" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_cliente_obras" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_motoristas" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_veiculos" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_motorista_veiculos" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_fornecedores" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_produtos" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_fornecedor_custos" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_vendas" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_venda_itens" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_orcamentos" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_orcamento_itens" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_cargas" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_carga_itens" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_carga_vendas" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_notas_fiscais" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_nota_itens" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_documentos" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_documentos_inbox" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_gmail_contas" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_gmail_imports" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_sefaz_nsu" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_sefaz_eventos" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_estoque_movimentos" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_estoque_reservas" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_pallet_movimentos" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_pagamentos" as restrictive for all to authenticated using(private.access_app_allowed('financeiro') or private.access_app_allowed('vendas')) with check(private.access_app_allowed('financeiro') or private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_recebimentos" as restrictive for all to authenticated using(private.access_app_allowed('financeiro') or private.access_app_allowed('vendas')) with check(private.access_app_allowed('financeiro') or private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_caixas" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_caixa_movimentos" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_auditoria" as restrictive for all to authenticated using(private.access_app_allowed('vendas')) with check(private.access_app_allowed('vendas'));
create policy access_standard_scope on public."fc_contas_pagar" as restrictive for all to authenticated using(private.access_app_allowed('financeiro') or private.access_app_allowed('vendas')) with check(private.access_app_allowed('financeiro') or private.access_app_allowed('vendas'));

grant usage on schema private to authenticated,service_role;
create table if not exists public.access_audit(id bigint generated always as identity primary key,app text not null,event text not null,user_id uuid references auth.users(id) on delete set null,created_at timestamptz not null default now());
alter table public.access_audit enable row level security;
revoke all on public.access_audit from anon,authenticated;
grant all on public.access_audit to service_role;
grant usage,select on sequence public.access_audit_id_seq to service_role;
create index if not exists access_audit_user_idx on public.access_audit(user_id,created_at);

