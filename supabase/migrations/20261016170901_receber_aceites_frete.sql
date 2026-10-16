begin;
grant usage on schema private to service_role;
create table public.fc_frete_solicitacoes(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null,frete_evento_id uuid not null,
 frete_carga_id uuid not null,frete_viagem_id uuid not null,motorista_id uuid not null,veiculo_id uuid not null,
 payload jsonb not null,status text not null default 'AGUARDANDO_PEDIDO' check(status in ('AGUARDANDO_PEDIDO','PEDIDO_VINCULADO')),
 carga_vendas_id text,numero_pedido_fornecedor text,criado_por uuid not null,created_at timestamptz not null default now(),vinculado_por uuid,vinculado_em timestamptz,
 unique(empresa_id,frete_evento_id),unique(empresa_id,frete_carga_id)
);
alter table public.fc_frete_solicitacoes enable row level security;
grant select on public.fc_frete_solicitacoes to authenticated;
create function private.fc_pode_integrar_frete(p_empresa uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.access_app_allowed('vendas') and public.fc_pode_operar_base(p_empresa) and exists(select 1 from public.fc_perfis p where p.user_id=auth.uid() and p.empresa_id=p_empresa and p.ativo and p.status_aprovacao='APROVADO' and not p.trocar_senha and (p.perfil in ('MASTER','ADMINISTRADOR') or (p.perfil in ('OPERADOR_GERAL','VENDEDOR_INTERNO') and (p.permissoes->'vendas'='true' or p.permissoes->'carga-direta'='true' or p.permissoes->'VENDAS E COMPRAS'->>'editar'='true'))))
$$;
create policy frete_solicitacoes_operacionais on public.fc_frete_solicitacoes for select to authenticated using(private.fc_pode_integrar_frete(empresa_id));
-- Only the bridge service delivers events. Browser users cannot forge accepted loads.
create function private.fc_receber_aceite_frete(p_empresa uuid,p_actor uuid,p_evento uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.fc_frete_solicitacoes;weight numeric;quantity numeric;unit numeric;cap numeric;rate numeric;
begin
 if not exists(select 1 from public.fc_perfis where user_id=p_actor and empresa_id=p_empresa and ativo and status_aprovacao='APROVADO' and not trocar_senha and perfil in ('MASTER','ADMINISTRADOR','OPERADOR_GERAL','VENDEDOR_INTERNO')) then raise exception 'Ator não autorizado.' using errcode='42501';end if;
 if jsonb_typeof(p_payload)<>'object' or p_evento is null or nullif(p_payload->>'carga_id','') is null or nullif(p_payload->>'viagem_id','') is null or nullif(p_payload->'motorista'->>'id','') is null or nullif(p_payload->'veiculo'->>'id','') is null then raise exception 'Evento de aceite incompleto.';end if;
 weight:=(p_payload->>'peso_t')::numeric;quantity:=(p_payload->>'quantidade')::numeric;unit:=(p_payload->>'peso_unitario_kg')::numeric;cap:=(p_payload->'veiculo'->>'capacidade_efetiva_t')::numeric;rate:=(p_payload->>'frete_por_t')::numeric;
 if cap is null or cap<=0 or cap::text in ('NaN','Infinity','-Infinity') or rate is null or rate<0 or rate::text in ('NaN','Infinity','-Infinity') or nullif(btrim(p_payload->>'origem'),'') is null or nullif(btrim(p_payload->>'destino'),'') is null or nullif(btrim(p_payload->>'produto'),'') is null or weight is null or quantity is null or unit is null or weight<=0 or quantity<=0 or quantity<>trunc(quantity) or unit<=0 or weight::text in ('NaN','Infinity','-Infinity') or unit::text in ('NaN','Infinity','-Infinity') or quantity::text in ('NaN','Infinity','-Infinity') or quantity*unit/1000<>weight or weight>cap then raise exception 'Peso/quantidade/capacidade incoerentes.';end if;
 insert into public.fc_frete_solicitacoes(empresa_id,frete_evento_id,frete_carga_id,frete_viagem_id,motorista_id,veiculo_id,payload,criado_por)
 values(p_empresa,p_evento,(p_payload->>'carga_id')::uuid,(p_payload->>'viagem_id')::uuid,(p_payload->'motorista'->>'id')::uuid,(p_payload->'veiculo'->>'id')::uuid,p_payload,p_actor)
 on conflict(empresa_id,frete_evento_id) do nothing;
 select * into r from public.fc_frete_solicitacoes where empresa_id=p_empresa and frete_evento_id=p_evento;
 if r.payload is distinct from p_payload then raise exception 'Evento já recebido com outro conteúdo.' using errcode='23505';end if;
 return jsonb_build_object('id',r.id,'status',r.status,'carga_vendas_id',r.carga_vendas_id,'numero_pedido_fornecedor',r.numero_pedido_fornecedor);
end $$;
create function public.fc_receber_aceite_frete(p_empresa uuid,p_actor uuid,p_evento uuid,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.fc_receber_aceite_frete(p_empresa,p_actor,p_evento,p_payload)$$;
-- This bridge RPC checks the current commercial actor, accepts no arbitrary payload and validates the linked order inside the canonical Vendas state.
create function private.fc_vincular_pedido_frete(p_solicitacao uuid,p_carga_vendas text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.fc_frete_solicitacoes;s jsonb;c jsonb;m jsonb;
begin
 select * into r from public.fc_frete_solicitacoes where id=p_solicitacao for update;
 if not found or not private.fc_pode_integrar_frete(r.empresa_id) then raise exception 'Solicitação não autorizada.' using errcode='42501';end if;
 if r.status='PEDIDO_VINCULADO' then
 if r.carga_vendas_id is distinct from p_carga_vendas then raise exception 'Solicitação já vinculada a outro pedido.';end if;
 return jsonb_build_object('ok',true,'replayed',true,'numero_pedido_fornecedor',r.numero_pedido_fornecedor);
 end if;
 select estado into s from public.fc_app_state where empresa_id=r.empresa_id for share;
 select value into c from jsonb_array_elements(coalesce(s->'cargas','[]')) where value->>'id'=p_carga_vendas;
 select value into m from jsonb_array_elements(coalesce(s->'motoristas','[]')) where value->>'id'=c->>'motoristaId';
 if c is null or c->>'status'='CANCELADA' or nullif(btrim(c->>'numeroPedidoFornecedor'),'') is null or nullif(c->>'ordemRevisadaEm','') is null then raise exception 'Selecione uma ordem revisada com pedido do fornecedor.';end if;
 if m->>'freteMotoristaId' is distinct from r.motorista_id::text or m->>'freteVeiculoId' is distinct from r.veiculo_id::text then raise exception 'Motorista/conjunto do pedido não corresponde ao aceite.';end if;
 if (c->>'pesoKg')::numeric is distinct from (r.payload->>'peso_t')::numeric*1000 then raise exception 'Peso do pedido diverge do aceite. Revise a carga.';end if;
 if not exists(select 1 from jsonb_array_elements(coalesce(c->'itens','[]')) i where lower(btrim(i->>'produto'))=lower(btrim(r.payload->>'produto')) and (i->>'qtd')::numeric=(r.payload->>'quantidade')::numeric) then raise exception 'Produto/quantidade do pedido diverge do aceite.';end if;
 if lower(regexp_replace(btrim(coalesce(c->>'localCarregamento',c->>'origem','')),'\s*/\s*[A-Za-z]{2}$',''))<>lower(regexp_replace(btrim(coalesce(r.payload->>'origem','')),'\s*/\s*[A-Za-z]{2}$','')) or lower(regexp_replace(btrim(coalesce(c->>'destino','')),'\s*/\s*[A-Za-z]{2}$',''))<>lower(regexp_replace(btrim(coalesce(r.payload->>'destino','')),'\s*/\s*[A-Za-z]{2}$','')) then raise exception 'Rota do pedido diverge do aceite.';end if;
 update public.fc_frete_solicitacoes set status='PEDIDO_VINCULADO',carga_vendas_id=p_carga_vendas,numero_pedido_fornecedor=c->>'numeroPedidoFornecedor',vinculado_por=auth.uid(),vinculado_em=now() where id=r.id;
 return jsonb_build_object('ok',true,'numero_pedido_fornecedor',c->>'numeroPedidoFornecedor');
end $$;
create function public.fc_vincular_pedido_frete(p_solicitacao uuid,p_carga_vendas text) returns jsonb language sql security invoker set search_path='' as $$select private.fc_vincular_pedido_frete(p_solicitacao,p_carga_vendas)$$;
revoke all on function private.fc_pode_integrar_frete(uuid),private.fc_receber_aceite_frete(uuid,uuid,uuid,jsonb),public.fc_receber_aceite_frete(uuid,uuid,uuid,jsonb),private.fc_vincular_pedido_frete(uuid,text),public.fc_vincular_pedido_frete(uuid,text) from public,anon;
revoke all on function private.fc_receber_aceite_frete(uuid,uuid,uuid,jsonb),public.fc_receber_aceite_frete(uuid,uuid,uuid,jsonb) from authenticated;
grant execute on function private.fc_pode_integrar_frete(uuid),private.fc_vincular_pedido_frete(uuid,text),public.fc_vincular_pedido_frete(uuid,text) to authenticated;
grant execute on function private.fc_receber_aceite_frete(uuid,uuid,uuid,jsonb),public.fc_receber_aceite_frete(uuid,uuid,uuid,jsonb) to service_role;
create function private.fc_proteger_pedido_frete() returns trigger language plpgsql security definer set search_path='' as $$
declare r record;oldc jsonb;newc jsonb;
begin
 for r in select carga_vendas_id from public.fc_frete_solicitacoes where empresa_id=new.empresa_id and status='PEDIDO_VINCULADO' loop
  select value into oldc from jsonb_array_elements(coalesce(old.estado->'cargas','[]')) where value->>'id'=r.carga_vendas_id;
  select value into newc from jsonb_array_elements(coalesce(new.estado->'cargas','[]')) where value->>'id'=r.carga_vendas_id;
  if newc is null or newc->>'status'='CANCELADA' or (newc->'numeroPedidoFornecedor',newc->'motoristaId',newc->'pesoKg',newc->'itens',newc->'origem',newc->'localCarregamento',newc->'destino') is distinct from (oldc->'numeroPedidoFornecedor',oldc->'motoristaId',oldc->'pesoKg',oldc->'itens',oldc->'origem',oldc->'localCarregamento',oldc->'destino') then raise exception 'Pedido vinculado ao aceite do Frete: alteração operacional exige revisão do vínculo.' using errcode='42501';end if;
 end loop;return new;
end $$;
create trigger fc_proteger_pedido_frete before update on public.fc_app_state for each row execute function private.fc_proteger_pedido_frete();
revoke all on function private.fc_proteger_pedido_frete() from public,anon,authenticated;
commit;
