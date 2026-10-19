create or replace function public.employee_review_with_role(p_pending uuid,p_actor uuid,p_action text,p_role text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.fc_usuarios_pendentes;t public.fc_perfis;r public.access_requests;result jsonb;
begin
 if not private.access_can_review(p_actor,'vendas') then raise exception 'Administração autorizada no Forte Vendas é obrigatória.' using errcode='42501';end if;
 select * into strict p from public.fc_usuarios_pendentes where id=p_pending for update;
 if p.auth_user_id is null or p.status not in ('CADASTRO_PENDENTE','PREENCHIMENTO_OBRIGATORIO','AGUARDANDO_APROVACAO') then raise exception 'Cadastro não está aguardando análise.';end if;
 perform private.access_assert_same_scope(p_actor,p.auth_user_id);
 select * into strict t from public.fc_perfis where user_id=p.auth_user_id for update;
 if p_action='APPROVE' and p.status<>'AGUARDANDO_APROVACAO' then raise exception 'O funcionário deve enviar o cadastro completo.';end if;
 if p_action not in ('APPROVE','REJECT') then raise exception 'Ação inválida.';end if;
 insert into public.access_requests(user_id,app,nome,cpf,whatsapp,email,data_nascimento,managed_account) values(t.user_id,'vendas',t.nome,t.cpf,t.whatsapp,t.email,t.data_nascimento,false) on conflict(user_id,app) do nothing;
 select * into strict r from public.access_requests where user_id=t.user_id and app='vendas' for update;
 if p_action='APPROVE' then update public.access_registration_drafts set status='SUBMITTED' where user_id=t.user_id and app='vendas';end if;
 result:=public.access_review_with_role(r.id,p_actor,case p_action when 'APPROVE' then 'APROVADO' else 'RECUSADO' end,p_role,'{}',case when p_action='REJECT' then 'Cadastro recusado pela administração do Forte Vendas.' end);
 update public.fc_usuarios_pendentes set status=case p_action when 'APPROVE' then 'ATIVO' else 'BLOQUEADO' end,analisado_por=p_actor,analisado_em=now() where id=p.id;
 return result||jsonb_build_object('ok',true,'message','Decisão registrada somente no Forte Vendas.');
end;$$;
