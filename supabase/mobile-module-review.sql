create function public.access_change_module_state(p_actor uuid,p_request uuid,p_app text,p_state text,p_reason text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.access_requests;
begin
 if not private.access_can_review(p_actor,p_app) then raise exception 'Sem autorização administrativa para este módulo.' using errcode='42501';end if;
 select * into strict r from public.access_requests where id=p_request and app=p_app for update;
 perform private.access_assert_same_scope(p_actor,r.user_id);
 if p_state not in ('APROVADO','SUSPENSO','REVOGADO') or length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Informe situação e motivo válidos.';end if;
 if r.status not in ('APROVADO','SUSPENSO','REVOGADO') then raise exception 'Analise primeiro a solicitação pendente.';end if;
 if r.assigned_role in ('MASTER','ADMINISTRADOR') and private.access_role_for(p_actor,p_app)<>'MASTER' then raise exception 'Somente Master do módulo pode alterar um acesso administrativo.';end if;
 if r.user_id=p_actor then raise exception 'Peça a outro Master autorizado para alterar seu próprio acesso.';end if;
 update public.access_requests set status=p_state,reason=left(p_reason,1000),reviewed_by=p_actor,reviewed_at=now() where id=r.id;
 insert into public.access_audit(app,event,user_id) values(p_app,'ACESSO_'||r.status||'_'||p_state||'_POR_'||p_actor::text,r.user_id);
 return jsonb_build_object('message','Situação alterada somente neste módulo.','status',p_state);
end;$$;
create function public.access_request_correction(p_actor uuid,p_request uuid,p_app text,p_reason text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.access_requests;
begin
 if not private.access_can_review(p_actor,p_app) then raise exception 'Sem autorização administrativa para este módulo.' using errcode='42501';end if;
 select * into strict r from public.access_requests where id=p_request and app=p_app for update;
 perform private.access_assert_same_scope(p_actor,r.user_id);
 if r.status not in ('PENDENTE','RECUSADO') or length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Informe motivo e um cadastro pendente ou recusado.';end if;
 if not exists(select 1 from public.access_registration_drafts where user_id=r.user_id and app=p_app) then raise exception 'Este cadastro anterior deve ser revisado pelo fluxo existente.';end if;
 update public.access_registration_drafts set status='DRAFT',correction_reason=left(p_reason,1000),revision=revision+1,updated_at=now() where user_id=r.user_id and app=p_app;
 update public.access_requests set status='PENDENTE',reason=left(p_reason,1000),reviewed_by=p_actor,reviewed_at=now() where id=r.id;
 insert into public.access_audit(app,event,user_id) values(p_app,'CORRECAO_SOLICITADA_POR_'||p_actor::text,r.user_id);
 return jsonb_build_object('message','Correção solicitada. O usuário retomará o formulário ao entrar.');
end;$$;
revoke all on function public.access_change_module_state(uuid,uuid,text,text,text),public.access_request_correction(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.access_change_module_state(uuid,uuid,text,text,text),public.access_request_correction(uuid,uuid,text,text) to service_role;
