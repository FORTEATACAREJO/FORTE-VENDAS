alter table public.central_usuarios drop constraint if exists central_usuarios_perfil_check;
update public.fc_perfis set perfil=(case perfil::text when 'ADMIN' then 'ADMINISTRADOR' when 'ULTRA_ADMIN' then 'MASTER' when 'OPERATOR' then 'OPERADOR_GERAL' when 'FISCAL' then 'OPERADOR_GERAL' when 'ACCOUNTANT' then 'OPERADOR_GERAL' when 'AUDITOR' then 'OPERADOR_GERAL' when 'CONSULTA' then 'OPERADOR_GERAL' when 'VENDAS' then 'VENDEDOR_INTERNO' when 'CAIXA' then 'VENDEDOR_INTERNO' when 'CONFERENCIA' then 'OPERADOR_PATIO' when 'FINANCEIRO' then 'OPERADOR_GERAL' when 'AUXILIAR_N1' then 'OPERADOR_GERAL' when 'AUXILIAR_N2' then 'OPERADOR_GERAL' when 'MOTORISTA_ENTREGA' then 'MOTORISTA' else perfil::text end)::public.fc_perfil where perfil::text not in ('MASTER','ADMINISTRADOR','OPERADOR_GERAL','OPERADOR_PATIO','MOTORISTA','VENDEDOR_EXTERNO','VENDEDOR_INTERNO');
alter table public.fc_perfis alter column perfil set not null;
alter table public.fc_perfis add constraint fc_perfis_perfil_padronizado check(perfil::text in ('MASTER','ADMINISTRADOR','OPERADOR_GERAL','OPERADOR_PATIO','MOTORISTA','VENDEDOR_EXTERNO','VENDEDOR_INTERNO'));
alter table public.fc_perfis alter column perfil set default 'OPERADOR_GERAL'::public.fc_perfil;
update public.fc_usuarios_pendentes set perfil=(case perfil::text when 'ADMIN' then 'ADMINISTRADOR' when 'ULTRA_ADMIN' then 'MASTER' when 'OPERATOR' then 'OPERADOR_GERAL' when 'FISCAL' then 'OPERADOR_GERAL' when 'ACCOUNTANT' then 'OPERADOR_GERAL' when 'AUDITOR' then 'OPERADOR_GERAL' when 'CONSULTA' then 'OPERADOR_GERAL' when 'VENDAS' then 'VENDEDOR_INTERNO' when 'CAIXA' then 'VENDEDOR_INTERNO' when 'CONFERENCIA' then 'OPERADOR_PATIO' when 'FINANCEIRO' then 'OPERADOR_GERAL' when 'AUXILIAR_N1' then 'OPERADOR_GERAL' when 'AUXILIAR_N2' then 'OPERADOR_GERAL' when 'MOTORISTA_ENTREGA' then 'MOTORISTA' else perfil::text end)::public.fc_perfil where perfil::text not in ('MASTER','ADMINISTRADOR','OPERADOR_GERAL','OPERADOR_PATIO','MOTORISTA','VENDEDOR_EXTERNO','VENDEDOR_INTERNO');
alter table public.fc_usuarios_pendentes alter column perfil set not null;
alter table public.fc_usuarios_pendentes add constraint fc_usuarios_pendentes_perfil_padronizado check(perfil::text in ('MASTER','ADMINISTRADOR','OPERADOR_GERAL','OPERADOR_PATIO','MOTORISTA','VENDEDOR_EXTERNO','VENDEDOR_INTERNO'));
update public.fc_funcionarios_cadastros set perfil=(case perfil::text when 'ADMIN' then 'ADMINISTRADOR' when 'ULTRA_ADMIN' then 'MASTER' when 'OPERATOR' then 'OPERADOR_GERAL' when 'FISCAL' then 'OPERADOR_GERAL' when 'ACCOUNTANT' then 'OPERADOR_GERAL' when 'AUDITOR' then 'OPERADOR_GERAL' when 'CONSULTA' then 'OPERADOR_GERAL' when 'VENDAS' then 'VENDEDOR_INTERNO' when 'CAIXA' then 'VENDEDOR_INTERNO' when 'CONFERENCIA' then 'OPERADOR_PATIO' when 'FINANCEIRO' then 'OPERADOR_GERAL' when 'AUXILIAR_N1' then 'OPERADOR_GERAL' when 'AUXILIAR_N2' then 'OPERADOR_GERAL' when 'MOTORISTA_ENTREGA' then 'MOTORISTA' else perfil::text end)::public.fc_perfil where perfil::text not in ('MASTER','ADMINISTRADOR','OPERADOR_GERAL','OPERADOR_PATIO','MOTORISTA','VENDEDOR_EXTERNO','VENDEDOR_INTERNO');
alter table public.fc_funcionarios_cadastros alter column perfil set not null;
alter table public.fc_funcionarios_cadastros add constraint fc_funcionarios_cadastros_perfil_padronizado check(perfil::text in ('MASTER','ADMINISTRADOR','OPERADOR_GERAL','OPERADOR_PATIO','MOTORISTA','VENDEDOR_EXTERNO','VENDEDOR_INTERNO'));
alter table public.fc_funcionarios_cadastros alter column perfil set default 'OPERADOR_GERAL'::public.fc_perfil;
update public.central_usuarios set perfil=(case perfil::text when 'ADMIN' then 'ADMINISTRADOR' when 'ULTRA_ADMIN' then 'MASTER' when 'OPERATOR' then 'OPERADOR_GERAL' when 'FISCAL' then 'OPERADOR_GERAL' when 'ACCOUNTANT' then 'OPERADOR_GERAL' when 'AUDITOR' then 'OPERADOR_GERAL' when 'CONSULTA' then 'OPERADOR_GERAL' when 'VENDAS' then 'VENDEDOR_INTERNO' when 'CAIXA' then 'VENDEDOR_INTERNO' when 'CONFERENCIA' then 'OPERADOR_PATIO' when 'FINANCEIRO' then 'OPERADOR_GERAL' when 'AUXILIAR_N1' then 'OPERADOR_GERAL' when 'AUXILIAR_N2' then 'OPERADOR_GERAL' when 'MOTORISTA_ENTREGA' then 'MOTORISTA' else perfil::text end)::text where perfil::text not in ('MASTER','ADMINISTRADOR','OPERADOR_GERAL','OPERADOR_PATIO','MOTORISTA','VENDEDOR_EXTERNO','VENDEDOR_INTERNO');
alter table public.central_usuarios alter column perfil set not null;
alter table public.central_usuarios add constraint central_usuarios_perfil_padronizado check(perfil::text in ('MASTER','ADMINISTRADOR','OPERADOR_GERAL','OPERADOR_PATIO','MOTORISTA','VENDEDOR_EXTERNO','VENDEDOR_INTERNO'));
CREATE OR REPLACE FUNCTION public.access_register_profile(p_user uuid, p_app text, p_nome text, p_cpf text, p_whatsapp text, p_birth date, p_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r uuid; empresa uuid;
begin
 select id into empresa from public.fc_empresas where ativo order by created_at limit 1;
 if empresa is null then raise exception 'Empresa não configurada.';end if;
 insert into public.fc_perfis(user_id,empresa_id,nome,cpf,whatsapp,email,data_nascimento,perfil,ativo,trocar_senha,status_aprovacao)
 values(p_user,empresa,p_nome,p_cpf,p_whatsapp,p_email,p_birth,'OPERADOR_GERAL',false,false,'PENDENTE');
 insert into public.access_requests(user_id,app,nome,cpf,whatsapp,data_nascimento,email) values(p_user,p_app,p_nome,p_cpf,p_whatsapp,p_birth,p_email) returning id into r;
 return r;
end;$function$
;
CREATE OR REPLACE FUNCTION public.access_review_with_role(p_request uuid, p_actor uuid, p_decision text, p_role text, p_units uuid[], p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.access_requests; a public.fc_perfis; t public.fc_perfis; chosen text; units uuid[];
begin
 if not private.access_is_admin(p_actor) then raise exception 'Somente admin ou master aprovado pode analisar.' using errcode='42501'; end if;
 select * into a from public.fc_perfis where user_id=p_actor for share;
 select * into r from public.access_requests where id=p_request for update;
 if not found or r.status<>'PENDENTE'  then raise exception 'Cadastro não está aguardando análise.'; end if;
 select * into t from public.fc_perfis where user_id=r.user_id for update;
 if not found or t.empresa_id is distinct from a.empresa_id then raise exception 'Cadastro não permitido.'; end if;
 if t.perfil::text in ('MASTER','ADMINISTRADOR','ULTRA_ADMIN') and a.perfil::text not in ('MASTER','ULTRA_ADMIN') then raise exception 'Somente master pode analisar usuários administrativos.' using errcode='42501'; end if;
 if p_decision is null or p_decision not in ('APROVADO','RECUSADO') or (p_decision='RECUSADO' and length(trim(coalesce(p_reason,'')))<3) then raise exception 'Informe decisão e motivo válidos.'; end if;
 if p_decision='APROVADO' then
  chosen:=nullif(trim(p_role),'');
  if chosen is null then raise exception 'Selecione o perfil do usuário antes de aprovar.'; end if;
  if not chosen=any(array['MASTER','ADMINISTRADOR','OPERADOR_GERAL','OPERADOR_PATIO','MOTORISTA','VENDEDOR_EXTERNO','VENDEDOR_INTERNO']) then raise exception 'Perfil inválido para este sistema.'; end if;
  if chosen in ('MASTER','ADMINISTRADOR') and a.perfil::text not in ('MASTER','ULTRA_ADMIN') then raise exception 'Somente master pode conceder perfil master ou administrador.' using errcode='42501'; end if;
  update public.fc_perfis set ativo=true,status_aprovacao='APROVADO',aprovado_por=p_actor,aprovado_em=now(),perfil=chosen::public.fc_perfil,permissoes=permissoes||jsonb_build_object(r.app,true) where user_id=r.user_id;
  update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('role',chosen),updated_at=now() where id=r.user_id;
 end if;
 update public.access_requests set status=p_decision,reviewed_by=p_actor,reviewed_at=now(),reason=nullif(trim(p_reason),'') where id=r.id;
 insert into public.access_audit(app,event,user_id) values(r.app,'PERFIL_'||coalesce(chosen,t.perfil::text)||'_'||p_decision,r.user_id);
 return jsonb_build_object('status',p_decision,'app',r.app,'role',coalesce(chosen,t.perfil::text));
end;$function$
;
update auth.users u set raw_app_meta_data=coalesce(u.raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('role',p.perfil::text),updated_at=now() from public.fc_perfis p where p.user_id=u.id and u.raw_app_meta_data->>'role' is distinct from p.perfil::text;
notify pgrst,'reload schema';
create or replace function public.employee_review_with_role(p_pending uuid,p_actor uuid,p_action text,p_role text)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare a public.fc_perfis; t public.fc_perfis; p public.fc_usuarios_pendentes; chosen text;
begin
 if not private.access_is_admin(p_actor) then raise exception 'Somente administrador ou master aprovado pode analisar.' using errcode='42501'; end if;
 select * into a from public.fc_perfis where user_id=p_actor for share;
 select * into p from public.fc_usuarios_pendentes where id=p_pending for update;
 if not found or p.empresa_id is distinct from a.empresa_id or p.auth_user_id is null or p.status not in ('CADASTRO_PENDENTE','PREENCHIMENTO_OBRIGATORIO','AGUARDANDO_APROVACAO') then raise exception 'Cadastro não está aguardando análise.'; end if;
 select * into t from public.fc_perfis where user_id=p.auth_user_id for update;
 if not found or t.empresa_id is distinct from a.empresa_id then raise exception 'Cadastro não permitido.'; end if;
 if t.perfil::text in ('MASTER','ADMINISTRADOR') and a.perfil::text<>'MASTER' then raise exception 'Somente master pode analisar usuários administrativos.' using errcode='42501'; end if;
 if p_action='APPROVE' then
  if p.status<>'AGUARDANDO_APROVACAO' then raise exception 'O funcionário ainda não enviou o cadastro completo.'; end if;
  chosen:=nullif(trim(p_role),'');
  if chosen is null or not chosen=any(array['MASTER','ADMINISTRADOR','OPERADOR_GERAL','OPERADOR_PATIO','MOTORISTA','VENDEDOR_EXTERNO','VENDEDOR_INTERNO']) then raise exception 'Selecione um perfil válido antes de aprovar.'; end if;
  if chosen in ('MASTER','ADMINISTRADOR') and a.perfil::text<>'MASTER' then raise exception 'Somente master pode conceder perfil master ou administrador.' using errcode='42501'; end if;
  update public.fc_perfis set perfil=chosen::public.fc_perfil,ativo=true,status_aprovacao='APROVADO',aprovado_por=p_actor,aprovado_em=now() where user_id=p.auth_user_id;
  update public.fc_usuarios_pendentes set perfil=chosen::public.fc_perfil,status='ATIVO',analisado_por=p_actor,analisado_em=now() where id=p.id;
  update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('role',chosen),updated_at=now() where id=p.auth_user_id;
 elsif p_action='REJECT' then
  update public.fc_perfis set ativo=false,status_aprovacao='REPROVADO' where user_id=p.auth_user_id;
  update public.fc_usuarios_pendentes set status='BLOQUEADO',analisado_por=p_actor,analisado_em=now() where id=p.id;
 else raise exception 'Ação inválida.';
 end if;
 insert into public.access_audit(app,event,user_id) values('vendas','FUNCIONARIO_'||p_action||'_'||coalesce(chosen,t.perfil::text),p.auth_user_id);
 return jsonb_build_object('ok',true,'role',coalesce(chosen,t.perfil::text),'message',case when p_action='APPROVE' then 'FUNCIONÁRIO APROVADO COM PERFIL DEFINIDO.' else 'CADASTRO RECUSADO. ACESSO BLOQUEADO.' end);
end;$fn$;
revoke all on function public.employee_review_with_role(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.employee_review_with_role(uuid,uuid,text,text) to service_role;

notify pgrst,'reload schema';
