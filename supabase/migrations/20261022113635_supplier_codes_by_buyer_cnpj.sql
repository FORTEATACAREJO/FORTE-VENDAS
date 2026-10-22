begin;
do $$
declare a public.fc_app_state;f jsonb;u jsonb;suppliers jsonb;code text;go_cnpj text;maps jsonb;
begin
 for a in select * from public.fc_app_state for update loop
  select regexp_replace(value->>'cnpj','\D','','g') into go_cnpj from jsonb_array_elements(coalesce(a.estado->'unidades','[]')) where value->>'uf'='GO' and value->>'ativo' is distinct from 'false' limit 1;
  suppliers:='[]';
  for f in select value from jsonb_array_elements(coalesce(a.estado->'fornecedores','[]')) loop
   if not (f ? 'codigosPorCnpj') then
    maps:='{}';code:=coalesce(nullif(f->>'codigoCliente',''),nullif(f->>'codigoForte',''));
    -- Existing codes were identified by the owner as Goiás; Liz remains unconfirmed.
    if go_cnpj is not null and code is not null and upper(coalesce(f->>'nome','')) not like '%LIZ%' and upper(coalesce(f->>'nome','')) not like '%LIS%' then maps:=jsonb_build_object(go_cnpj,code);end if;
    f:=f||jsonb_build_object('codigosPorCnpj',maps,'codigoLegadoAConfirmar',case when maps='{}'::jsonb then code else null end);
   end if;
   suppliers:=suppliers||jsonb_build_array(f);
  end loop;
  if suppliers is distinct from coalesce(a.estado->'fornecedores','[]') then update public.fc_app_state set estado=jsonb_set(a.estado,'{fornecedores}',suppliers),versao=versao+1,updated_at=now() where empresa_id=a.empresa_id;end if;
 end loop;
end $$;
commit;
