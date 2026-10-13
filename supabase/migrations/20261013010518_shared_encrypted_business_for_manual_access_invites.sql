create table private.shared_invite_business(singleton boolean primary key default true check(singleton),secret_id uuid not null,phone_id text not null,waba_id text not null,template_name text not null,updated_actor text not null,updated_at timestamptz not null default now());
alter table private.shared_invite_business enable row level security;
revoke all on private.shared_invite_business from public,anon,authenticated;
create policy shared_invite_business_no_client on private.shared_invite_business for all to anon,authenticated using(false) with check(false);
create or replace function private.shared_invite_business_read() returns jsonb language sql security definer set search_path='' as $$ select jsonb_build_object('token',s.decrypted_secret,'phone_id',c.phone_id,'waba_id',c.waba_id,'template_name',c.template_name) from private.shared_invite_business c join vault.decrypted_secrets s on s.id=c.secret_id where c.singleton; $$;
create or replace function public.shared_invite_business_read() returns jsonb language sql set search_path='' as $$ select private.shared_invite_business_read(); $$;
create or replace function private.shared_invite_business_save(p_actor text,p_token text,p_phone text,p_waba text,p_template text) returns void language plpgsql security definer set search_path='' as $$
declare k uuid;
begin
 select secret_id into k from private.shared_invite_business where singleton for update;
 if k is null then select vault.create_secret(p_token,'forte_shared_access_invite_whatsapp_token','Token compartilhado do envio manual de convites Forte') into k;else perform vault.update_secret(k,p_token);end if;
 insert into private.shared_invite_business(singleton,secret_id,phone_id,waba_id,template_name,updated_actor) values(true,k,p_phone,p_waba,p_template,p_actor) on conflict(singleton) do update set secret_id=k,phone_id=p_phone,waba_id=p_waba,template_name=p_template,updated_actor=p_actor,updated_at=now();
end;$$;
create or replace function public.shared_invite_business_save(p_actor text,p_token text,p_phone text,p_waba text,p_template text) returns void language sql set search_path='' as $$select private.shared_invite_business_save(p_actor,p_token,p_phone,p_waba,p_template);$$;
revoke all on function private.shared_invite_business_read(),public.shared_invite_business_read(),private.shared_invite_business_save(text,text,text,text,text),public.shared_invite_business_save(text,text,text,text,text) from public,anon,authenticated;
grant execute on function private.shared_invite_business_read(),public.shared_invite_business_read(),private.shared_invite_business_save(text,text,text,text,text),public.shared_invite_business_save(text,text,text,text,text) to service_role;
grant usage on schema private to service_role;
