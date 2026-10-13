begin;
do $test$ declare k uuid;v text;def text;begin
 select pg_get_functiondef('private.gmail_hub_secret_save(text,text)'::regprocedure) into def;
 if def !~ 'set client_secret_id=k where id=true' or def !~ 'set refresh_secret_id=k where id=true' then raise exception 'Atualização sem filtro explícito';end if;
 perform public.gmail_hub_secret_save('client','fixture-only-not-a-google-secret-1');
 select client_secret_id into k from gmail_hub_config where id=true;
 if k is null then raise exception 'Secret ID não vinculado';end if;
 perform public.gmail_hub_secret_save('client','fixture-only-not-a-google-secret-2');
 if (select client_secret_id from gmail_hub_config where id=true)<>k then raise exception 'Segredo duplicado na substituição';end if;
 select decrypted_secret into v from vault.decrypted_secrets where id=k;
 if v<>'fixture-only-not-a-google-secret-2' then raise exception 'Substituição não confirmada';end if;
 perform public.gmail_hub_secret_save('refresh','fixture-only-not-a-refresh-token');
 if (select refresh_secret_id is null from gmail_hub_config where id=true) then raise exception 'Token de renovação não vinculado';end if;
 if has_function_privilege('authenticated','public.gmail_hub_secret_save(text,text)','EXECUTE') or has_function_privilege('anon','public.gmail_hub_secrets_read()','EXECUTE') then raise exception 'Credenciais acessíveis ao cliente';end if;
end;$test$;
rollback;
select client_secret_id is not null as real_secret_saved,refresh_secret_id is not null as real_server_authorized from gmail_hub_config where id=true;