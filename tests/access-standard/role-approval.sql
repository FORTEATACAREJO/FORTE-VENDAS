begin;

do $test$
declare actor uuid; target uuid:=gen_random_uuid(); req uuid; unit uuid; result jsonb; blocked boolean; chosen text;
begin
 select user_id into actor from public.fc_perfis where perfil='MASTER' and ativo limit 1;
 if actor is null then raise exception 'Missing test actor';end if;
 
 insert into auth.users(id,email,raw_user_meta_data) values(target,'role-test-'||target||'@example.invalid','{"full_name":"Teste de perfil"}');
 insert into public.fc_perfis(user_id,empresa_id,nome,cpf,whatsapp,perfil,ativo) select target,empresa_id,'Teste de perfil','52998224725','5534999998888','CONSULTA',false from public.fc_perfis where user_id=actor;
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
 update public.fc_perfis set perfil='MASTER' where user_id=actor;
 
 chosen:='FINANCEIRO';
 result:=public.access_review_with_role(req,actor,'APROVADO',chosen,'{}'::uuid[],null);
 if result->>'role'<>chosen or not exists(select 1 from public.fc_perfis where user_id=target and perfil::text=chosen and ativo) then raise exception 'Assigned profile not saved';end if;
 blocked:=false;begin update public.fc_perfis set perfil=null where user_id=target;exception when not_null_violation then blocked:=true;end;if not blocked then raise exception 'Null role was accepted';end if;
end;$test$;

rollback;