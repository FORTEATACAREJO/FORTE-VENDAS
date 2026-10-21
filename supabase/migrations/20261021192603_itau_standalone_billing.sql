begin;
-- A standalone obligation has no fictitious sale. Existing sales uniqueness is preserved.
alter table public.fc_itau_ledger alter column venda_id drop not null;
alter table public.fc_itau_ledger add constraint fc_itau_ledger_origin_check check (
 venda_id is not null or coalesce(boleto->>'origem'='AVULSO' and boleto->>'canal'='BOLETO AVULSO',false)
);

create or replace function private.fc_itau_create_standalone(
 p_request uuid,p_cliente text,p_motivo text,p_referencia text,p_valor numeric,
 p_vencimento date,p_juros numeric,p_multa numeric
) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.fc_perfis;s public.fc_app_state;c jsonb;b jsonb;existing jsonb;t jsonb;
 bid text:='avulso-'||p_request::text;
begin
 p:=private.fc_itau_profile();
 if not coalesce((public.access_current_module('financeiro')->>'allowed')::boolean,false) then raise exception 'Aprovação financeira obrigatória.';end if;
 if p_request is null or p_valor is null or p_valor<=0 or p_valor>99999999.99 or p_valor<>round(p_valor,2)
 or p_vencimento is null or p_vencimento<(now() at time zone 'America/Sao_Paulo')::date
 or p_juros is null or p_multa is null or p_juros not between 0 and 99.99 or p_multa not between 0 and 99.99
 or p_juros<>round(p_juros,2) or p_multa<>round(p_multa,2)
 or length(trim(coalesce(p_motivo,''))) not between 1 and 200 or length(coalesce(p_referencia,''))>10
 then raise exception 'Confira motivo, valor, vencimento, juros e multa.';end if;
 select * into s from public.fc_app_state where empresa_id=p.empresa_id for update;
 if not found then raise exception 'Base não localizada.';end if;
 select value into c from jsonb_array_elements(coalesce(s.estado->'clientes','[]')) where value->>'id'=p_cliente;
 if c is null or c->>'ativo'='false' then raise exception 'Cliente não localizado ou inativo.';end if;
 select value into existing from jsonb_array_elements(coalesce(s.estado->'boletosClientes','[]')) where value->>'id'=bid;
 if existing is not null then
  if existing->>'origem' is distinct from 'AVULSO' or existing->>'clienteId' is distinct from p_cliente
  or existing->>'motivo' is distinct from trim(p_motivo) or coalesce(existing->>'referencia','') is distinct from trim(coalesce(p_referencia,''))
  or (existing->>'valor')::numeric is distinct from p_valor or (existing->>'vencimento')::date is distinct from p_vencimento
  or (existing->>'jurosMes')::numeric is distinct from p_juros or (existing->>'multa')::numeric is distinct from p_multa
  then raise exception 'Solicitação já usada com outros dados. Atualize a cobrança.';end if;
  return jsonb_build_object('ok',true,'replayed',true,'boletoId',bid);
 end if;
 b:=jsonb_build_object('id',bid,'origem','AVULSO','canal','BOLETO AVULSO','banco','ITAÚ','carteira','109',
 'clienteId',p_cliente,'cliente',coalesce(nullif(c->>'razaoSocial',''),c->>'nome'),'motivo',trim(p_motivo),
 'referencia',trim(coalesce(p_referencia,'')),'valor',p_valor,'vencimento',p_vencimento,'jurosMes',p_juros,'multa',p_multa,
 'especieCodigo','99','especie','DIVERSOS','parcela',1,'totalParcelas',1,'status','AGUARDANDO EMISSÃO API',
 'negativacao',false,'protestoAutomatico',false,'criadoEm',now(),'criadoPor',auth.uid(),'contaReceberId',bid);
 t:=jsonb_build_object('id',bid,'boletoId',bid,'origem','BOLETO AVULSO','clienteId',p_cliente,'cliente',b->>'cliente',
 'titulo',trim(p_motivo),'referencia',b->>'referencia','valor',p_valor,'vencimento',p_vencimento,
 'emissao',(now() at time zone 'America/Sao_Paulo')::date,'status','ABERTO','criadoEm',now(),'criadoPor',auth.uid());
 update public.fc_app_state set estado=jsonb_set(jsonb_set(jsonb_set(s.estado,
 '{boletosClientes}',coalesce(s.estado->'boletosClientes','[]')||jsonb_build_array(b)),
 '{contasReceber}',coalesce(s.estado->'contasReceber','[]')||jsonb_build_array(t)),
 '{bankEvents}',coalesce(s.estado->'bankEvents','[]')||jsonb_build_array(jsonb_build_object('id',p_request,'provedor','ITAU',
 'tipo','COBRANÇA AVULSA PREPARADA','status','PENDENTE','boletoId',bid,'criadoEm',now(),'usuario',auth.uid()))),
 versao=s.versao+1,updated_at=now(),updated_by=auth.uid() where empresa_id=p.empresa_id;
 return jsonb_build_object('ok',true,'replayed',false,'boletoId',bid);
end $$;
revoke all on function private.fc_itau_create_standalone(uuid,text,text,text,numeric,date,numeric,numeric) from public,anon;
grant execute on function private.fc_itau_create_standalone(uuid,text,text,text,numeric,date,numeric,numeric) to authenticated;
create or replace function public.fc_itau_create_standalone(p_request uuid,p_cliente text,p_motivo text,p_referencia text,p_valor numeric,p_vencimento date,p_juros numeric,p_multa numeric)
 returns jsonb language sql security invoker set search_path='' as $$
 select private.fc_itau_create_standalone(p_request,p_cliente,p_motivo,p_referencia,p_valor,p_vencimento,p_juros,p_multa);
$$;
revoke all on function public.fc_itau_create_standalone(uuid,text,text,text,numeric,date,numeric,numeric) from public,anon;
grant execute on function public.fc_itau_create_standalone(uuid,text,text,text,numeric,date,numeric,numeric) to authenticated;

create or replace function private.fc_itau_reserve(p_boleto_id text,p_versao bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.fc_perfis;b jsonb;r public.fc_itau_ledger;s public.fc_app_state;n text;
begin
 p:=private.fc_itau_profile();
 if not exists(select 1 from private.fc_itau_server_config) then raise exception 'Instalação protegida ainda pendente.';end if;
 select * into s from public.fc_app_state where empresa_id=p.empresa_id for update;
 if s.versao is distinct from p_versao then raise exception 'Base alterada. Atualize antes de emitir.';end if;
 select value into b from jsonb_array_elements(coalesce(s.estado->'boletosClientes','[]'::jsonb)) where value->>'id'=p_boleto_id;
 if b is null or b->>'status'='CANCELADO' then raise exception 'Título não localizado.';end if;
 if (b->>'parcela')::integer not between 1 and 36 or (b->>'valor')::numeric<=0 then raise exception 'Título inválido.';end if;
 if b->>'origem'='AVULSO' then
  if not coalesce((public.access_current_module('financeiro')->>'allowed')::boolean,false) then raise exception 'Aprovação financeira obrigatória.';end if;
  if coalesce(b->>'vendaId','')<>'' or coalesce(jsonb_array_length(b->'vendaIds'),0)<>0 or b->>'canal' is distinct from 'BOLETO AVULSO' or b->>'especieCodigo' is distinct from '99' or length(trim(coalesce(b->>'motivo','')))=0 or (b->>'parcela')::integer<>1 then raise exception 'Boleto avulso inválido.';end if;
 elsif nullif(b->>'vendaId','') is null then raise exception 'Venda obrigatória.';
 end if;
 select * into r from public.fc_itau_ledger where empresa_id=p.empresa_id and (boleto_id=p_boleto_id or (venda_id=b->>'vendaId' and parcela=(b->>'parcela')::integer));
 if found then return to_jsonb(r)||jsonb_build_object('new',false);end if;
 n:=lpad(nextval('private.fc_itau_nosso_numero')::text,8,'0');
 insert into public.fc_itau_ledger(empresa_id,boleto_id,venda_id,parcela,nosso_numero,boleto) values(p.empresa_id,p_boleto_id,b->>'vendaId',(b->>'parcela')::integer,n,b) returning * into r;
 update public.fc_app_state set estado=jsonb_set(s.estado,'{boletosClientes}',(select jsonb_agg(case when value->>'id'=p_boleto_id then value||jsonb_build_object('status','EMISSÃO EM PROCESSAMENTO','nossoNumero',n) else value end) from jsonb_array_elements(s.estado->'boletosClientes'))),versao=s.versao+1 where empresa_id=p.empresa_id;
 return to_jsonb(r)||jsonb_build_object('new',true);
end $$;
revoke all on function private.fc_itau_reserve(text,bigint) from public,anon;
grant execute on function private.fc_itau_reserve(text,bigint) to authenticated;

commit;
