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
