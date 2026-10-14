-- Pure validation: no external lookup, privileged read or SECURITY DEFINER.
create or replace function public.fc_cliente_endereco_erro(r jsonb) returns text
language plpgsql immutable set search_path='' as $$
declare d text;z text;u text;w integer[];s integer;n integer;i integer;dv integer;
begin
 d:=regexp_replace(coalesce(nullif(r->>'documento',''),nullif(r->>'cnpj',''),r->>'cpf',''),'[^0-9]','','g');
 if length(d) not in (11,14) or d ~ '^(.)\1+$' then return 'Informe CPF/CNPJ válido do cliente.';end if;
 for n in 1..2 loop
  if length(d)=11 then
   if n=1 then w:=array[10,9,8,7,6,5,4,3,2];else w:=array[11,10,9,8,7,6,5,4,3,2];end if;
  else
   if n=1 then w:=array[5,4,3,2,9,8,7,6,5,4,3,2];else w:=array[6,5,4,3,2,9,8,7,6,5,4,3,2];end if;
  end if;
  s:=0;for i in 1..array_length(w,1) loop s:=s+substr(d,i,1)::integer*w[i];end loop;
  dv:=s%11;dv:=case when dv<2 then 0 else 11-dv end;
  if dv<>substr(d,length(d)-2+n,1)::integer then return 'Informe CPF/CNPJ válido do cliente.';end if;
 end loop;
 z:=regexp_replace(coalesce(r->>'cep',''),'[^0-9]','','g');
 if length(z)<>8 or z='00000000' then return 'CEP obrigatório: informe 8 dígitos válidos.';end if;
 u:=upper(trim(coalesce(r->>'uf','')));
 if not(u=any(array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'])) then return 'UF obrigatória: selecione um estado válido.';end if;
 return '';
end $$;
revoke all on function public.fc_cliente_endereco_erro(jsonb) from public,anon;
grant execute on function public.fc_cliente_endereco_erro(jsonb) to authenticated,service_role;
create or replace function private.fc_guardar_endereco_clientes() returns trigger
language plpgsql set search_path='' as $$
declare x jsonb;prior jsonb;e text;
begin
 for x in select value from jsonb_array_elements(coalesce(new.estado->'clientes','[]'::jsonb)) loop
  prior:=null;
  if tg_op='UPDATE' then select value into prior from jsonb_array_elements(coalesce(old.estado->'clientes','[]'::jsonb)) where value->>'id'=x->>'id';end if;
  -- Untouched legacy rows are preserved; every new or edited customer must be complete.
  if prior is null or prior is distinct from x then
   e:=public.fc_cliente_endereco_erro(x);
   if e<>'' then raise exception '% Cliente: %.',e,coalesce(x->>'nome',x->>'id','') using errcode='23514';end if;
  end if;
 end loop;
 return new;
end $$;
revoke all on function private.fc_guardar_endereco_clientes() from public,anon,authenticated;
create trigger fc_03_clientes_endereco_obrigatorio before insert or update on public.fc_app_state
for each row execute function private.fc_guardar_endereco_clientes();
create or replace function private.fc_normalizar_endereco_cliente() returns trigger
language plpgsql set search_path='' as $$
declare e text;
begin
 new.documento:=regexp_replace(coalesce(new.documento,''),'[^0-9]','','g');
 new.cep:=regexp_replace(coalesce(new.cep,''),'[^0-9]','','g');new.uf:=upper(trim(coalesce(new.uf,'')));
 e:=public.fc_cliente_endereco_erro(to_jsonb(new));
 if e<>'' then raise exception '%',e using errcode='23514';end if;
 return new;
end $$;
revoke all on function private.fc_normalizar_endereco_cliente() from public,anon,authenticated;
create trigger fc_clientes_endereco_obrigatorio before insert or update on public.fc_clientes
for each row execute function private.fc_normalizar_endereco_cliente();
