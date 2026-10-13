create table public.gmail_hub_config (
 id boolean primary key default true check(id), empresa_id uuid not null,
 email text not null default 'fiscalforteatacarejo@gmail.com' check(email='fiscalforteatacarejo@gmail.com'),
 client_id text not null, client_secret_id uuid, refresh_secret_id uuid,
 topic text, push_email text, history_id text, backfill_page text, backfill_done boolean not null default false,
 watch_expires timestamptz, last_sync timestamptz, last_push timestamptz,
 status text not null default 'AUTORIZACAO_SERVIDOR_PENDENTE', error text,
 lease_until timestamptz, lease_owner uuid, updated_at timestamptz not null default now()
);
create table public.gmail_hub_oauth (state text primary key,empresa_id uuid not null,actor uuid not null,expires_at timestamptz not null,origin text not null,verifier text not null);
create table public.gmail_hub_messages (email text not null,message_id text not null,status text not null default 'PENDENTE',attempts integer not null default 0,error text,received_at timestamptz not null default now(),primary key(email,message_id));
create table public.gmail_hub_events (email text not null,history_id text not null,received_at timestamptz not null default now(),primary key(email,history_id));
create table public.gmail_hub_documents (
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null,email text not null,message_id text not null,part_id text not null,
 thread_id text,filename text not null,mime_type text,hash text not null,storage_path text,
 kind text not null,cnpj text,nfe_key text,order_reference text,subject text,sender text,
 destinations text[] not null default '{}',status text not null default 'CONFERENCIA_PENDENTE',
 created_at timestamptz not null default now(),unique(email,message_id,part_id),unique(empresa_id,hash)
);
do $$ declare t text;begin foreach t in array array['gmail_hub_config','gmail_hub_oauth','gmail_hub_messages','gmail_hub_events','gmail_hub_documents'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end $$;
create function private.gmail_hub_secrets_read() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('client_secret',(select decrypted_secret from vault.decrypted_secrets where id=c.client_secret_id),'refresh_token',(select decrypted_secret from vault.decrypted_secrets where id=c.refresh_secret_id),'worker_token',(select decrypted_secret from vault.decrypted_secrets where name='gmail_hub_worker_token')) from public.gmail_hub_config c where id;
$$;
create function public.gmail_hub_secrets_read() returns jsonb language sql set search_path='' as $$select private.gmail_hub_secrets_read();$$;
create function private.gmail_hub_secret_save(p_kind text,p_value text) returns void language plpgsql security definer set search_path='' as $$
 declare k uuid;begin
 if p_kind not in ('client','refresh') or length(p_value)<10 then raise exception 'Segredo inválido';end if;
 perform 1 from public.gmail_hub_config where id for update;
 if not found then raise exception 'Configuração não localizada';end if;
 select case when p_kind='client' then client_secret_id else refresh_secret_id end into k from public.gmail_hub_config where id;
 if k is null then select vault.create_secret(p_value,'gmail_hub_'||p_kind) into k;else perform vault.update_secret(k,p_value);end if;
 if p_kind='client' then update public.gmail_hub_config set client_secret_id=k;else update public.gmail_hub_config set refresh_secret_id=k;end if;
 end;$$;
create function public.gmail_hub_secret_save(p_kind text,p_value text) returns void language sql set search_path='' as $$select private.gmail_hub_secret_save(p_kind,p_value);$$;
create function public.gmail_hub_claim(p_owner uuid) returns boolean language plpgsql set search_path='' as $$begin
 update public.gmail_hub_config set lease_owner=p_owner,lease_until=now()+interval '100 seconds' where id and (lease_until is null or lease_until<now());return found;end;$$;
revoke all on function private.gmail_hub_secrets_read(),public.gmail_hub_secrets_read(),private.gmail_hub_secret_save(text,text),public.gmail_hub_secret_save(text,text),public.gmail_hub_claim(uuid) from public,anon,authenticated;
grant execute on function private.gmail_hub_secrets_read(),public.gmail_hub_secrets_read(),private.gmail_hub_secret_save(text,text),public.gmail_hub_secret_save(text,text),public.gmail_hub_claim(uuid) to service_role;
grant usage on schema private to service_role;
insert into storage.buckets(id,name,public,file_size_limit) values('forte-gmail-central','forte-gmail-central',false,20971520) on conflict(id) do nothing;
select vault.create_secret(gen_random_uuid()::text||gen_random_uuid()::text,'gmail_hub_worker_token','Autenticação do processamento Gmail no servidor');
create function private.gmail_hub_tick() returns void language plpgsql security definer set search_path='' as $$declare k text;begin
 if not exists(select 1 from public.gmail_hub_config where refresh_secret_id is not null) then return;end if;
 select decrypted_secret into strict k from vault.decrypted_secrets where name='gmail_hub_worker_token';
 perform net.http_post(url:='https://gtwecfyffjszghnvtlzr.supabase.co/functions/v1/gmail-central',headers:=jsonb_build_object('Content-Type','application/json','X-Forte-Worker',k),body:='{"action":"TICK"}'::jsonb,timeout_milliseconds:=65000);
end;$$;
revoke all on function private.gmail_hub_tick() from public,anon,authenticated;
select cron.schedule('forte-gmail-central-recovery','*/5 * * * *','select private.gmail_hub_tick()');
