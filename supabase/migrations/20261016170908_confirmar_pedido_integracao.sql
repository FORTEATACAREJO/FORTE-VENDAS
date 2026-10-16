begin;
grant usage on schema private to service_role;
-- Service-only persistence for the authenticated, action-validated order workflow.
-- The actor is supplied by the Edge Function after auth.getUser(), never taken from the request body.
create function private.fc_gravar_workflow(p_empresa uuid,p_actor uuid,p_versao bigint,p_estado jsonb) returns bigint language plpgsql security definer set search_path='' as $$
declare a public.fc_app_state;p public.fc_perfis;old_claim text;
begin
 select * into p from public.fc_perfis where user_id=p_actor and empresa_id=p_empresa and ativo and status_aprovacao='APROVADO' and not trocar_senha;
 if not found or p.perfil not in ('MASTER','ADMINISTRADOR','OPERADOR_GERAL','VENDEDOR_INTERNO') then raise exception 'Ator não autorizado.' using errcode='42501';end if;
 if p.perfil not in ('MASTER','ADMINISTRADOR') and not(coalesce(p.permissoes->'vendas'='true',false) or coalesce(p.permissoes->'carga-direta'='true',false) or coalesce(p.permissoes->'VENDAS E COMPRAS'->>'editar'='true',false)) then raise exception 'Sem permissão comercial.' using errcode='42501';end if;
 select * into a from public.fc_app_state where empresa_id=p_empresa for update;
 if not found or a.versao<>p_versao then raise exception 'Conflito de versão.' using errcode='40001';end if;
 if p_estado->'motoristas' is distinct from a.estado->'motoristas' then raise exception 'Motoristas são administrados pelo Forte Frete.' using errcode='42501';end if;
 perform private.fc_validar_alteracao_financeira(a.estado,p_estado,p.perfil='MASTER');
 old_claim:=current_setting('request.jwt.claim.sub',true);
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 update public.fc_app_state set estado=p_estado,versao=p_versao+1,updated_by=p_actor where empresa_id=p_empresa;
 perform set_config('request.jwt.claim.sub',coalesce(old_claim,''),true);
 return p_versao+1;
end $$;
create function public.fc_gravar_workflow(p_empresa uuid,p_actor uuid,p_versao bigint,p_estado jsonb) returns bigint language sql security invoker set search_path='' as $$select private.fc_gravar_workflow(p_empresa,p_actor,p_versao,p_estado)$$;
revoke all on function private.fc_gravar_workflow(uuid,uuid,bigint,jsonb),public.fc_gravar_workflow(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function private.fc_gravar_workflow(uuid,uuid,bigint,jsonb),public.fc_gravar_workflow(uuid,uuid,bigint,jsonb) to service_role;
commit;
