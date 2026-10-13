create or replace function private.gmail_hub_secret_save(p_kind text,p_value text) returns void language plpgsql security definer set search_path='' as $$
 declare k uuid;begin
 if p_kind not in ('client','refresh') or length(p_value)<10 then raise exception 'Segredo inválido';end if;
 perform 1 from public.gmail_hub_config where id=true for update;
 if not found then raise exception 'Configuração não localizada';end if;
 select case when p_kind='client' then client_secret_id else refresh_secret_id end into k from public.gmail_hub_config where id=true;
 if k is null then select vault.create_secret(p_value,'gmail_hub_'||p_kind) into k;else perform vault.update_secret(k,p_value);end if;
 if p_kind='client' then update public.gmail_hub_config set client_secret_id=k where id=true;else update public.gmail_hub_config set refresh_secret_id=k where id=true;end if;
 end;$$;
 revoke all on function private.gmail_hub_secret_save(text,text) from public,anon,authenticated;
 grant execute on function private.gmail_hub_secret_save(text,text) to service_role;