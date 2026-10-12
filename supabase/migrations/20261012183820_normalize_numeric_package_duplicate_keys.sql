create or replace function private.fc_guardar_cadastros_sem_duplicidade() returns trigger language plpgsql set search_path='' as $$
declare collection text;x jsonb;oldx jsonb;seen text[];ids text[];key text;doc text;br text;spec text;kg numeric;barcode text;
begin
 foreach collection in array array['clientes','fornecedores','usuarios','funcionarios','produtos'] loop
  seen:=array[]::text[];ids:=array[]::text[];
  for x in select value from jsonb_array_elements(coalesce(new.estado->collection,'[]'::jsonb)) loop
   if nullif(x->>'id','') is null or x->>'id'=any(ids) then raise exception 'Cadastro sem identificação ou ID duplicado em %.',collection using errcode='23505';end if;
   ids:=array_append(ids,x->>'id');oldx:=null;
   if tg_op='UPDATE' then select value into oldx from jsonb_array_elements(coalesce(old.estado->collection,'[]'::jsonb)) where value->>'id'=x->>'id';end if;
   if collection='produtos' then
    br:=public.forte_brand_identity(coalesce(nullif(x->>'marca',''),x->>'brand'));
    if oldx is null and br='' then raise exception 'Informe a MARCA do produto antes de cadastrar.';end if;
    begin kg:=coalesce(nullif(x->>'pesoKg','')::numeric,0);exception when others then raise exception 'Embalagem/peso do produto inválido.';end;
    spec:=public.forte_product_spec(coalesce(x->>'nomeExatoContador',x->>'nome'),br);
    key:=br||'|S|'||spec||'|'||pg_catalog.trim_scale(kg)::text;
    if key=any(seen) then raise exception 'PRODUTO DUPLICADO DA MESMA MARCA: %. Utilize o cadastro existente.',x->>'nome' using errcode='23505';end if;
    seen:=array_append(seen,key);barcode:=regexp_replace(coalesce(x->>'gtin',''),'[^0-9]','','g');
    if length(barcode) in (8,12,13,14) then key:=br||'|G|'||barcode;if key=any(seen) then raise exception 'GTIN duplicado para a mesma marca: %.',x->>'nome' using errcode='23505';end if;seen:=array_append(seen,key);end if;
   else
    doc:=regexp_replace(coalesce(nullif(x->>'documento',''),nullif(x->>'cpfCnpj',''),nullif(x->>'cnpjCpf',''),nullif(x->>'cpf',''),x->>'cnpj',''),'[^0-9]','','g');
    if oldx is null and doc='' then raise exception 'Informe CPF/CNPJ para cadastrar em %.',collection;end if;
    if doc<>'' then key:='D|'||doc;if key=any(seen) then raise exception 'CPF/CNPJ já cadastrado em %. Utilize o cadastro existente.',collection using errcode='23505';end if;seen:=array_append(seen,key);end if;
    if collection='fornecedores' then key:='N|'||public.forte_brand_identity(x->>'nome');if key=any(seen) then raise exception 'Fornecedor/marca já cadastrado. Utilize o cadastro existente.' using errcode='23505';end if;seen:=array_append(seen,key);end if;
   end if;
  end loop;
 end loop;
 return new;
end;$$;
revoke all on function private.fc_guardar_cadastros_sem_duplicidade() from public,anon,authenticated;
