create or replace function public.forte_brand_identity(value text) returns text language sql immutable set search_path='' as $$
 select case x when 'CIPLAM' then 'CIPLAN' else x end from (select regexp_replace(upper(translate(coalesce(value,''),'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','AAAAAEEEEIIIIOOOOOUUUUC')),'[^A-Z0-9]','','g') x) s;
$$;
create or replace function public.forte_product_spec(description text,brand text) returns text language plpgsql immutable set search_path='' as $$
declare n text;b text;m text[];
begin
 n:=upper(translate(coalesce(description,''),'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','AAAAAEEEEIIIIOOOOOUUUUC'));
 n:=regexp_replace(n,'CP[[:space:]./_-]*III','CP3','g');n:=regexp_replace(n,'CP[[:space:]./_-]*IV','CP4','g');n:=regexp_replace(n,'CP[[:space:]./_-]*II','CP2','g');n:=regexp_replace(n,'CP[[:space:]./_-]*V','CP5','g');n:=regexp_replace(n,'CP[[:space:]./_-]*I','CP1','g');
 n:=regexp_replace(n,'[0-9]+([.,][0-9]+)?[[:space:]]*KG',' ','g');
 n:=regexp_replace(n,'[^A-Z0-9]','','g');b:=public.forte_brand_identity(brand);
 if b<>'' then n:=replace(n,b,'');end if;
 m:=regexp_match(n,'CP([1-5])([EFZ]?)([0-9]{2})');
 if m is not null then return 'CP'||m[1]||m[2]||m[3]||case when n like '%RS%' then 'RS' else '' end;end if;
 if n like '%CP5%' and n like '%ARI%' then return 'CP5ARI'||case when n like '%RS%' then 'RS' else '' end;end if;
 return n;
end;$$;
revoke all on function public.forte_brand_identity(text),public.forte_product_spec(text,text) from public;
grant execute on function public.forte_brand_identity(text),public.forte_product_spec(text,text) to authenticated,service_role;
