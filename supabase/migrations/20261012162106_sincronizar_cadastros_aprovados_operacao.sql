
create or replace function private.fc_sincronizar_usuario_aprovado(p_user uuid)
returns void language plpgsql security invoker set search_path='' as $fn$
declare p public.fc_perfis; s public.fc_app_state; items jsonb; merged jsonb; item jsonb; found_item boolean; matching boolean; state jsonb; k text; rid text;
begin
 if current_user not in ('postgres','service_role','supabase_admin') then raise exception 'Sincronização interna.' using errcode='42501'; end if;
 select * into p from public.fc_perfis where user_id=p_user;
 if not found then return; end if;
 select * into s from public.fc_app_state where empresa_id=p.empresa_id for update;
 if not found then return; end if;
 state:=s.estado;
 foreach k in array array['usuarios','funcionarios'] loop
  items:=coalesce(state->k,'[]'::jsonb); merged:='[]'::jsonb; found_item:=false;
  if jsonb_typeof(items)<>'array' then raise exception 'Lista de usuários inválida.'; end if;
  for item in select value from jsonb_array_elements(items) loop
   matching:=item->>'authUserId'=p.user_id::text or item->>'id'='auth-'||p.user_id::text
    or (nullif(item->>'authUserId','') is null and nullif(p.cpf,'') is not null and regexp_replace(coalesce(item->>'cpf',''),'[^0-9]','','g')=regexp_replace(p.cpf,'[^0-9]','','g'));
   if coalesce(matching,false) then
    if found_item then raise exception 'Usuário duplicado: confira o cadastro antes de aprovar.';end if;
    found_item:=true;
    item:=item||jsonb_build_object('authUserId',p.user_id,'empresaId',p.empresa_id,'nome',p.nome,'cpf',p.cpf,'whatsapp',p.whatsapp,'email',p.email,
     'perfil',p.perfil::text,'ativo',p.ativo and p.status_aprovacao='APROVADO','status',case when p.ativo and p.status_aprovacao='APROVADO' then 'ATIVO' else p.status_aprovacao end,
     'admin',p.perfil::text in ('MASTER','ADMINISTRADOR'),'master',p.perfil::text='MASTER');
   end if;
   merged:=merged||jsonb_build_array(item);
  end loop;
  if not found_item and p.ativo and p.status_aprovacao='APROVADO' then
   rid:='auth-'||p.user_id::text;
   merged:=merged||jsonb_build_array(jsonb_build_object('id',rid,'authUserId',p.user_id,'empresaId',p.empresa_id,'nome',p.nome,'cpf',p.cpf,'whatsapp',p.whatsapp,'email',p.email,
    'perfil',p.perfil::text,'ativo',true,'status','ATIVO','admin',p.perfil::text in ('MASTER','ADMINISTRADOR'),'master',p.perfil::text='MASTER','permissoes',coalesce(p.permissoes,'{}'::jsonb)));
  end if;
  state:=jsonb_set(state,array[k],merged,true);
 end loop;
 if state is distinct from s.estado then
  update public.fc_app_state set estado=state,versao=s.versao+1 where empresa_id=p.empresa_id and versao=s.versao;
  if not found then raise exception 'Atualize a base antes de aprovar.' using errcode='40001';end if;
 end if;
end;$fn$;
revoke all on function private.fc_sincronizar_usuario_aprovado(uuid) from public,anon,authenticated;
grant execute on function private.fc_sincronizar_usuario_aprovado(uuid) to service_role;

create or replace function private.fc_perfil_sincronizar_cadastro()
returns trigger language plpgsql security invoker set search_path='' as $fn$
begin
 if current_user in ('postgres','service_role','supabase_admin') then
  perform private.fc_sincronizar_usuario_aprovado(new.user_id);
 end if;
 return new;
end;$fn$;
revoke all on function private.fc_perfil_sincronizar_cadastro() from public,anon,authenticated;
drop trigger if exists fc_perfil_sincronizar_cadastro on public.fc_perfis;
create trigger fc_perfil_sincronizar_cadastro after insert or update of ativo,status_aprovacao,perfil,nome,cpf,whatsapp,email on public.fc_perfis
for each row execute function private.fc_perfil_sincronizar_cadastro();

do $fn$ declare u record; begin
 for u in select user_id from public.fc_perfis where ativo and status_aprovacao='APROVADO' loop
  perform private.fc_sincronizar_usuario_aprovado(u.user_id);
 end loop;
end;$fn$;
