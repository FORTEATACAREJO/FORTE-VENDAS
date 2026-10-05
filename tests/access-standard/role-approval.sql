begin;

do $test$
declare actor uuid; target uuid:=gen_random_uuid(); req uuid; unit uuid; result jsonb; blocked boolean; chosen text; pending uuid;
begin
 select user_id into actor from public.fc_perfis where perfil='MASTER' and ativo limit 1;
 if actor is null then raise exception 'Missing test actor';end if;
 
 insert into auth.users(id,email,raw_user_meta_data) values(target,'role-test-'||target||'@example.invalid','{"full_name":"Teste de perfil"}');
 insert into public.fc_perfis(user_id,empresa_id,nome,cpf,whatsapp,perfil,ativo) select target,empresa_id,'Teste de perfil','52998224725','5534999998888','OPERADOR_GERAL',false from public.fc_perfis where user_id=actor;
 insert into public.access_requests(user_id,app,nome,cpf,whatsapp,data_nascimento) values(target,'vendas','Teste de perfil','52998224725','5534999998888','1990-01-01') returning id into req;
 blocked:=false;
 begin perform public.access_review_with_role(req,actor,'APROVADO',null,array[unit],null);exception when others then if sqlerrm like '%Selecione o perfil%' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'Missing role was accepted';end if;
 blocked:=false;
 begin perform public.access_review_with_role(req,actor,'APROVADO','INVALIDO',array[unit],null);exception when others then if sqlerrm like '%Perfil inválido%' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'Invalid role was accepted';end if;
 update public.fc_perfis set perfil='ADMINISTRADOR' where user_id=actor;
 blocked:=false;
 begin perform public.access_review_with_role(req,actor,'APROVADO','MASTER',array[unit],null);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Admin granted MASTER';end if;
 blocked:=false;
 begin perform public.access_review_with_role(req,actor,'APROVADO','ADMINISTRADOR',array[unit],null);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Admin granted ADMINISTRADOR';end if;
 update public.fc_perfis set perfil='MASTER' where user_id=actor;
 
 foreach chosen in array array['MASTER','ADMINISTRADOR','OPERADOR_GERAL','OPERADOR_PATIO','MOTORISTA','VENDEDOR_EXTERNO','VENDEDOR_INTERNO'] loop
 update public.access_requests set status='PENDENTE',reviewed_by=null,reviewed_at=null where id=req;
 result:=public.access_review_with_role(req,actor,'APROVADO',chosen,array[unit],null);
 if result->>'role'<>chosen or not exists(select 1 from public.fc_perfis where user_id=target and perfil::text=chosen and ativo) then raise exception 'Assigned profile not saved';end if;
 end loop;
 blocked:=false;begin update public.fc_perfis set perfil=null where user_id=target;exception when not_null_violation then blocked:=true;end;if not blocked then raise exception 'Null role was accepted';end if;
 blocked:=false;begin update public.fc_perfis set perfil='CONSULTA' where user_id=target;exception when check_violation then blocked:=true;end;if not blocked then raise exception 'Legacy role was accepted';end if;

 insert into public.fc_usuarios_pendentes(empresa_id,nome,perfil,status,auth_user_id)
 select empresa_id,'Teste de funcionário','OPERADOR_GERAL','AGUARDANDO_APROVACAO',target from public.fc_perfis where user_id=actor returning id into pending;
 blocked:=false;begin perform public.employee_review_with_role(pending,actor,'APPROVE',null);exception when others then if sqlerrm like '%perfil válido%' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'Employee approved without role';end if;
 foreach chosen in array array['MASTER','ADMINISTRADOR','OPERADOR_GERAL','OPERADOR_PATIO','MOTORISTA','VENDEDOR_EXTERNO','VENDEDOR_INTERNO'] loop
 update public.fc_usuarios_pendentes set status='AGUARDANDO_APROVACAO' where id=pending;
 perform public.employee_review_with_role(pending,actor,'APPROVE',chosen);
 if not exists(select 1 from public.fc_usuarios_pendentes where id=pending and perfil::text=chosen and status='ATIVO') then raise exception 'Employee role not saved';end if;
 end loop;
end;$test$;

rollback;
