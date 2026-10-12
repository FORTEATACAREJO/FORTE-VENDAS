create or replace function private.fc_motoristas_somente_frete()
returns trigger language plpgsql security invoker set search_path='' as $fn$
begin
 if current_user='authenticated' and new.estado->'motoristas' is distinct from old.estado->'motoristas' then
  raise exception 'Cadastro de motoristas é exclusivo do Forte Frete. Atualize a consulta no Vendas.' using errcode='42501';
 end if;
 return new;
end;$fn$;
revoke all on function private.fc_motoristas_somente_frete() from public,anon,authenticated;
create trigger fc_01_motoristas_somente_frete before update on public.fc_app_state for each row execute function private.fc_motoristas_somente_frete();