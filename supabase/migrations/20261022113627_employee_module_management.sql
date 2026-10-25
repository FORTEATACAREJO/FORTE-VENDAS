begin;
create or replace function private.fc_manage_employee(p_id text,p_action text,p_patch jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();actor_role text;empresa uuid;a public.fc_app_state;e jsonb;v jsonb;target public.fc_perfis;target_id uuid;target_role text;new_role text;request_row public.access_requests;new_status text;changed jsonb:='{}';k text;matches integer;
begin
 if actor is null or not private.access_can_review(actor,'vendas') then raise exception 'Administração do Forte Vendas obrigatória.' using errcode='42501';end if;
 actor_role:=private.access_role_for(actor,'vendas');
 select empresa_id into strict empresa from public.fc_perfis where user_id=actor for update;
 select * into strict a from public.fc_app_state where empresa_id=empresa for update;
 select value into e from jsonb_array_elements(coalesce(a.estado->'funcionarios','[]')) where value->>'id'=p_id;
 if e is null or coalesce((e->>'excluido')::boolean,false) then raise exception 'Funcionário não localizado.';end if;
 if p_action not in ('UPDATE','DEACTIVATE','ACTIVATE','DELETE') then raise exception 'Ação inválida.';end if;
 select count(*) into matches from public.fc_perfis p where p.empresa_id=empresa and (p.user_id::text=e->>'authUserId' or (nullif(e->>'cpf','') is not null and regexp_replace(coalesce(p.cpf,''),'\D','','g')=regexp_replace(e->>'cpf','\D','','g')));
 if matches>1 then raise exception 'Mais de um acesso corresponde ao funcionário. Confira o CPF.';end if;
 select * into target from public.fc_perfis p where p.empresa_id=empresa and (p.user_id::text=e->>'authUserId' or (nullif(e->>'cpf','') is not null and regexp_replace(coalesce(p.cpf,''),'\D','','g')=regexp_replace(e->>'cpf','\D','','g')));
 target_id:=target.user_id;target_role:=coalesce(private.access_role_for(target_id,'vendas'),e->>'perfil');
 new_role:=case when p_action='UPDATE' then coalesce(p_patch->>'perfil',e->>'perfil') else coalesce(e->>'perfil',target_role) end;
 new_role:=replace(upper(new_role),' ','_');
 if new_role not in ('MASTER','ADMINISTRADOR','OPERADOR_GERAL','OPERADOR_PATIO','MOTORISTA','VENDEDOR_EXTERNO','VENDEDOR_INTERNO') then raise exception 'Selecione um perfil válido.';end if;
 if (new_role in ('MASTER','ADMINISTRADOR') or target_role in ('MASTER','ADMINISTRADOR')) and actor_role<>'MASTER' then raise exception 'Somente Master pode alterar um acesso administrativo.';end if;
 if target_id=actor and (p_action<>'UPDATE' or new_role<>actor_role) then raise exception 'Peça a outro Master para alterar seu próprio acesso.';end if;
 if p_action='UPDATE' then
  if nullif(btrim(coalesce(p_patch->>'nome',e->>'nome')),'') is null then raise exception 'Informe o nome.';end if;
  if target_id is not null and p_patch ? 'cpf' and regexp_replace(p_patch->>'cpf','\D','','g')<>regexp_replace(coalesce(target.cpf,''),'\D','','g') then raise exception 'O CPF vinculado ao acesso não pode ser alterado nesta edição.';end if;
  for k in select unnest(array['nome','cpf','email','whatsapp','cargo','unidade','permissoes','documentoFileId','documentoPath','documentoNome','cpfConferido','documentoConferido','statusIa']) loop
   if p_patch ? k then changed:=changed||jsonb_build_object(k,p_patch->k);end if;
  end loop;
  changed:=changed||jsonb_build_object('perfil',new_role,'master',new_role='MASTER','admin',new_role in ('MASTER','ADMINISTRADOR'),'atualizadoEm',now());
 else
  changed:=jsonb_build_object('ativo',p_action='ACTIVATE','status',case p_action when 'ACTIVATE' then 'ATIVO' when 'DELETE' then 'EXCLUÍDO' else 'INATIVO' end,'excluido',p_action='DELETE','atualizadoEm',now());
 end if;
 if target_id is not null and not (target_id=actor and p_action='UPDATE') then
  select * into request_row from public.access_requests where user_id=target_id and app='vendas' for update;
  if request_row.id is null then
   if target.data_nascimento is null then raise exception 'Complete a data de nascimento no cadastro de acesso antes de alterar o perfil.';end if;
   new_status:=case when target.ativo and target.status_aprovacao='APROVADO' then 'APROVADO' else 'PENDENTE' end;
   insert into public.access_requests(user_id,app,nome,cpf,whatsapp,data_nascimento,email,managed_account,status,assigned_role,assigned_permissions,reviewed_by,reviewed_at)
   values(target_id,'vendas',target.nome,target.cpf,coalesce(target.whatsapp,''),target.data_nascimento,target.email,false,new_status,coalesce(target.perfil::text,'OPERADOR_GERAL'),coalesce(target.permissoes,'{}'),actor,now()) returning * into request_row;
  end if;
  if p_action='ACTIVATE' and request_row.status not in ('APROVADO','SUSPENSO','REVOGADO') then raise exception 'Aprovação inicial ainda pendente. Analise a solicitação antes de ativar.';end if;
  update public.access_requests set assigned_role=case when p_action='UPDATE' then new_role else assigned_role end,
   assigned_permissions=case when p_action='UPDATE' then coalesce(p_patch->'permissoes',assigned_permissions) else assigned_permissions end,
   status=case when p_action='DELETE' then 'REVOGADO' when p_action='DEACTIVATE' then 'SUSPENSO' when p_action='ACTIVATE' then 'APROVADO' else status end,
   reviewed_by=actor,reviewed_at=now(),reason='Gestão de funcionário no Forte Vendas' where id=request_row.id;
  changed:=changed||jsonb_build_object('authUserId',target_id);
 end if;
 update public.fc_usuarios_pendentes set perfil=new_role::public.fc_perfil, status=case when p_action in ('DELETE','DEACTIVATE') then 'BLOQUEADO' else status end where empresa_id=empresa and (auth_user_id=target_id or regexp_replace(coalesce(cpf,''),'\D','','g')=regexp_replace(coalesce(e->>'cpf',''),'\D','','g'));
 update public.fc_funcionarios_cadastros set nome=coalesce(changed->>'nome',nome),cargo=coalesce(changed->>'cargo',cargo),perfil=new_role::public.fc_perfil,permissoes=coalesce(changed->'permissoes',permissoes),ativo=case when p_action='UPDATE' then ativo else p_action='ACTIVATE' end,updated_at=now() where empresa_id=empresa and (auth_user_id=target_id or id::text=p_id);
 select coalesce(jsonb_agg(case when value->>'id'=p_id then value||changed else value end),'[]') into v from jsonb_array_elements(coalesce(a.estado->'funcionarios','[]'));
 a.estado:=jsonb_set(a.estado,'{funcionarios}',v);
 a.estado:=jsonb_set(a.estado,'{auditoria}',coalesce(a.estado->'auditoria','[]')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'acao','FUNCIONÁRIO '||p_action,'detalhe',e->>'nome','usuario',actor,'dataHora',now())));
 update public.fc_app_state set estado=a.estado,versao=versao+1,updated_by=actor,updated_at=now() where empresa_id=empresa;
 insert into public.access_audit(app,event,user_id) values('vendas','FUNCIONARIO_'||p_action||'_POR_'||actor::text,coalesce(target_id,actor));
 return jsonb_build_object('ok',true,'employee',e||changed,'message',case p_action when 'UPDATE' then 'Cadastro atualizado. Nenhum convite foi enviado.' when 'DELETE' then 'Funcionário excluído da lista ativa e acesso ao Vendas revogado. Histórico preservado.' else 'Situação atualizada no Forte Vendas.' end);
end $$;
revoke all on function private.fc_manage_employee(text,text,jsonb) from public,anon;
grant execute on function private.fc_manage_employee(text,text,jsonb) to authenticated;
create or replace function public.fc_manage_employee(p_id text,p_action text,p_patch jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.fc_manage_employee(p_id,p_action,p_patch) $$;
revoke all on function public.fc_manage_employee(text,text,jsonb) from public,anon;
grant execute on function public.fc_manage_employee(text,text,jsonb) to authenticated;
commit;
