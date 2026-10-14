begin;
create or replace function private.fc_itau_reserve(p_boleto_id text,p_versao bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.fc_perfis;b jsonb;r public.fc_itau_ledger;s public.fc_app_state;n text;
begin
 p:=private.fc_itau_profile();
 if not exists(select 1 from private.fc_itau_server_config) then raise exception 'Instalação protegida ainda pendente.';end if;
 select * into s from public.fc_app_state where empresa_id=p.empresa_id for update;
 if s.versao is distinct from p_versao then raise exception 'Base alterada. Atualize antes de emitir.';end if;
 select value into b from jsonb_array_elements(coalesce(s.estado->'boletosClientes','[]'::jsonb)) where value->>'id'=p_boleto_id;
 if b is null or b->>'status'='CANCELADO' then raise exception 'Título não localizado.';end if;
 if b->>'vendaId' is null or (b->>'parcela')::integer not between 1 and 36 or (b->>'valor')::numeric<=0 then raise exception 'Título inválido.';end if;
 select * into r from public.fc_itau_ledger where empresa_id=p.empresa_id and (boleto_id=p_boleto_id or (venda_id=b->>'vendaId' and parcela=(b->>'parcela')::integer));
 if found then return to_jsonb(r)||jsonb_build_object('new',false);end if;
 n:=lpad(nextval('private.fc_itau_nosso_numero')::text,8,'0');
 insert into public.fc_itau_ledger(empresa_id,boleto_id,venda_id,parcela,nosso_numero,boleto) values(p.empresa_id,p_boleto_id,b->>'vendaId',(b->>'parcela')::integer,n,b) returning * into r;
 update public.fc_app_state set estado=jsonb_set(s.estado,'{boletosClientes}',(select jsonb_agg(case when value->>'id'=p_boleto_id then value||jsonb_build_object('status','EMISSÃO EM PROCESSAMENTO','nossoNumero',n) else value end) from jsonb_array_elements(s.estado->'boletosClientes'))),versao=s.versao+1 where empresa_id=p.empresa_id;
 return to_jsonb(r)||jsonb_build_object('new',true);
end $$;
revoke all on function private.fc_itau_reserve(text,bigint) from public,anon;
grant execute on function private.fc_itau_reserve(text,bigint) to authenticated;
create or replace function private.fc_itau_complete(p_id uuid,p_key text,p_receipt jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.fc_perfis;r public.fc_itau_ledger;s public.fc_app_state;bs jsonb;es jsonb;
begin
 p:=private.fc_itau_profile();
 if p_key is null or not exists(select 1 from private.fc_itau_server_config where completion_key_sha256=encode(extensions.digest(p_key,'sha256'),'hex')) then raise exception 'Servidor não autorizado.';end if;
 select * into s from public.fc_app_state where empresa_id=p.empresa_id for update;
 select * into r from public.fc_itau_ledger where id=p_id and empresa_id=p.empresa_id for update;
 if not found then raise exception 'Reserva não localizada.';end if;
 if r.status='REGISTRADO' then return r.receipt;end if;
 if p_receipt is null then update public.fc_itau_ledger set status='CONFERIR RETORNO',updated_at=now() where id=r.id;return jsonb_build_object('pending',true);end if;
 if p_receipt->>'etapa' is distinct from 'efetivacao' or p_receipt->>'status' is distinct from 'REGISTRADO' or coalesce(p_receipt->>'idCobranca','')=''
 or p_receipt->>'nossoNumero' is distinct from r.nosso_numero or (p_receipt->>'valor')::numeric is distinct from (r.boleto->>'valor')::numeric then raise exception 'Retorno bancário divergente.';end if;
 -- Persist the bank receipt before updating the app snapshot. Never mark a receivable paid here.
 update public.fc_itau_ledger set status='REGISTRADO',receipt=p_receipt,updated_at=now() where id=r.id;
 select * into s from public.fc_app_state where empresa_id=p.empresa_id for update;
 select jsonb_agg(case when value->>'id'=r.boleto_id then value||p_receipt else value end) into bs from jsonb_array_elements(coalesce(s.estado->'boletosClientes','[]'::jsonb));
 es:=coalesce(s.estado->'bankEvents','[]'::jsonb)||jsonb_build_array(jsonb_build_object('id',r.id,'provedor','ITAU','tipo','EMISSÃO CONFIRMADA','status','REGISTRADO','boletoId',r.boleto_id,'numeroVenda',r.boleto->>'numeroVenda','nossoNumero',r.nosso_numero,'valor',r.boleto->'valor','criadoEm',now()));
 update public.fc_app_state set estado=jsonb_set(jsonb_set(s.estado,'{boletosClientes}',coalesce(bs,'[]'::jsonb)),'{bankEvents}',es),versao=s.versao+1 where empresa_id=p.empresa_id;
 return p_receipt;
end $$;
revoke all on function private.fc_itau_complete(uuid,text,jsonb) from public,anon;
grant execute on function private.fc_itau_complete(uuid,text,jsonb) to authenticated;
-- Exposed RPC wrappers run as the caller; privileged implementations stay private.
grant usage on schema private to authenticated;
create or replace function public.fc_itau_reserve(p_boleto_id text,p_versao bigint) returns jsonb language sql security invoker set search_path='' as $$
 select private.fc_itau_reserve(p_boleto_id,p_versao);
$$;
revoke all on function public.fc_itau_reserve(text,bigint) from public,anon;
grant execute on function public.fc_itau_reserve(text,bigint) to authenticated;
create or replace function public.fc_itau_complete(p_id uuid,p_key text,p_receipt jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select private.fc_itau_complete(p_id,p_key,p_receipt);
$$;
revoke all on function public.fc_itau_complete(uuid,text,jsonb) from public,anon;
grant execute on function public.fc_itau_complete(uuid,text,jsonb) to authenticated;
commit;
