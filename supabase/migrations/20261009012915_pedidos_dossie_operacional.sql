-- Private dossier files, restricted to active, approved commercial staff in the same company.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('forte-vendas-dossies','forte-vendas-dossies',false,10485760,array['application/pdf','application/xml','text/xml','image/png','image/jpeg','image/webp','application/octet-stream'])
on conflict(id) do nothing;
create policy pedidos_dossie_select on storage.objects for select to authenticated
using(bucket_id='forte-vendas-dossies' and (storage.foldername(name))[1]=public.fc_current_empresa_id()::text and public.fc_pode_operar_base(public.fc_current_empresa_id()));
create policy pedidos_dossie_insert on storage.objects for insert to authenticated
with check(bucket_id='forte-vendas-dossies' and (storage.foldername(name))[1]=public.fc_current_empresa_id()::text and public.fc_pode_operar_base(public.fc_current_empresa_id()));
create policy pedidos_dossie_delete on storage.objects for delete to authenticated
using(bucket_id='forte-vendas-dossies' and (storage.foldername(name))[1]=public.fc_current_empresa_id()::text and public.fc_pode_operar_base(public.fc_current_empresa_id()) and owner_id=auth.uid()::text);
