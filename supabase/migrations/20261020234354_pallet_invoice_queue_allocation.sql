begin;
-- New invoice workflow uses the existing physical ledger. Legacy app-state movements remain read-only history.
create table public.fc_pallet_notas(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references public.fc_empresas(id),identity text not null,
 chave text,emitente_cnpj text,numero text,serie text,emitida_em text,fornecedor_ref text,
 quantidade bigint check(quantidade>0),quantidade_detectada bigint check(quantidade_detectada>0),
 modalidade text check(modalidade in ('PROPRIO','DEVOLVER_FORNECEDOR')),
 status text not null default 'CONFERENCIA_PENDENTE' check(status in ('CONFERENCIA_PENDENTE','PARCIAL','PRONTA','INTEGRADA','REVERTIDA','DUPLICADA')),
 conferida boolean not null default false,evidencia text,issues text[] not null default '{}',revision integer not null default 0,
 nota_canonica_id uuid references public.fc_pallet_notas(id),criada_em timestamptz not null default now(),conferida_por uuid references public.fc_perfis(user_id),integrada_por uuid references public.fc_perfis(user_id),integrada_em timestamptz,
 unique(empresa_id,identity),unique(empresa_id,id)
);
create unique index pallet_nf_identity on public.fc_pallet_notas(empresa_id,emitente_cnpj,serie,numero) where emitente_cnpj is not null and serie is not null and numero is not null and status<>'DUPLICADA';
create table public.fc_pallet_nf_fontes(
 source_id uuid primary key references public.gmail_hub_sources(id),empresa_id uuid not null,nota_id uuid not null,
 foreign key(empresa_id,nota_id) references public.fc_pallet_notas(empresa_id,id)
);
create index pallet_fontes_nota on public.fc_pallet_nf_fontes(empresa_id,nota_id);
create table public.fc_pallet_alocacoes(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null,nota_id uuid not null,cliente_ref text,venda_ref text,carga_ref text,entrega_ref text,
 local text,tipo text not null check(tipo in ('GALPAO','COMODATO','VENDA')),quantidade bigint not null check(quantidade>0),
 foreign key(empresa_id,nota_id) references public.fc_pallet_notas(empresa_id,id)
);
create index pallet_alocacoes_nota on public.fc_pallet_alocacoes(empresa_id,nota_id);
create table public.fc_pallet_contas(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null,nota_id uuid,alocacao_id uuid,
 parte text not null check(parte in ('CLIENTE','FORNECEDOR')),parte_ref text not null,quantidade bigint not null check(quantidade<>0),
 evento text not null,request_id uuid not null,criado_por uuid not null references public.fc_perfis(user_id),criado_em timestamptz not null default now(),
 foreign key(empresa_id,nota_id) references public.fc_pallet_notas(empresa_id,id)
);
create index pallet_contas_parte on public.fc_pallet_contas(empresa_id,parte,parte_ref);
create table public.fc_pallet_auditoria(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null,nota_id uuid,request_id uuid not null,evento text not null,
 responsavel uuid references public.fc_perfis(user_id),motivo text,detalhes jsonb not null default '{}',criada_em timestamptz not null default now(),
 unique(empresa_id,request_id)
);
alter table public.fc_pallet_movimentos add column pallet_nota_id uuid references public.fc_pallet_notas(id),add column pallet_alocacao_id uuid references public.fc_pallet_alocacoes(id),add column request_id uuid,add column metadata jsonb not null default '{}';
create index pallet_movimentos_nf on public.fc_pallet_movimentos(empresa_id,pallet_nota_id);
create index pallet_movimentos_request on public.fc_pallet_movimentos(empresa_id,request_id);
alter table public.fc_pallet_notas enable row level security;
alter table public.fc_pallet_nf_fontes enable row level security;
alter table public.fc_pallet_alocacoes enable row level security;
alter table public.fc_pallet_contas enable row level security;
alter table public.fc_pallet_auditoria enable row level security;
revoke all on public.fc_pallet_notas,public.fc_pallet_nf_fontes,public.fc_pallet_alocacoes,public.fc_pallet_contas,public.fc_pallet_auditoria from public,anon,authenticated;
grant all on public.fc_pallet_notas,public.fc_pallet_nf_fontes,public.fc_pallet_alocacoes,public.fc_pallet_contas,public.fc_pallet_auditoria to service_role;
-- Mutations of the canonical ledger go through the transactional API, including privileged browser users.
create policy pallet_ledger_insert_api on public.fc_pallet_movimentos as restrictive for insert to authenticated with check(false);
create policy pallet_ledger_update_api on public.fc_pallet_movimentos as restrictive for update to authenticated using(false) with check(false);
create policy pallet_ledger_delete_api on public.fc_pallet_movimentos as restrictive for delete to authenticated using(false);

create function private.pallet_authorize(p_empresa uuid,p_actor uuid,p_write boolean default true) returns void language plpgsql security invoker set search_path='' as $$
declare p public.fc_perfis;g jsonb;
begin
 select * into strict p from public.fc_perfis where user_id=p_actor;
 g:=public.access_module_context(p_actor,'vendas');
 if p.empresa_id is distinct from p_empresa or p.ativo is distinct from true or p.trocar_senha is distinct from false or p.status_aprovacao is distinct from 'APROVADO' or (g->>'allowed') is distinct from 'true' then raise exception 'Acesso não autorizado ao painel de pallets.' using errcode='42501';end if;
 if coalesce(g->>'role','') not in ('MASTER','ADMINISTRADOR') and coalesce((p.permissoes->'PÁTIO / ESTOQUE'->>case when p_write then 'editar' else 'visualizar' end)::boolean,false) is not true and not (coalesce(jsonb_typeof(p.permissoes)='array',false) and (p.permissoes ? '*' or p.permissoes ? 'PÁTIO / ESTOQUE')) then raise exception 'Sem permissão para esta operação de pallets.' using errcode='42501';end if;
end;$$;
revoke all on function private.pallet_authorize(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function private.pallet_authorize(uuid,uuid,boolean) to service_role;

create function private.pallet_capture_source() returns trigger language plpgsql security invoker set search_path='' as $$
declare n uuid;identity_key text;k text;q bigint;candidate boolean;
begin
 candidate:=coalesce((new.metadata->'pallet'->>'candidate')::boolean,false) or (new.filename||' '||new.subject) ~* '\m(pallets?|paletes?)\M' or exists(select 1 from jsonb_array_elements(coalesce(new.metadata->'items','[]')) i where i->>'description' ~* '\m(pallets?|paletes?)\M');
 if not candidate then return new;end if;
 -- Old XML sources without a detection marker remain visible with a quantity to check manually.
 if coalesce(new.metadata->'pallet'->>'quantity','') ~ '^[1-9][0-9]{0,8}$' then q:=(new.metadata->'pallet'->>'quantity')::bigint;end if;
 k:=coalesce(new.metadata->>'key',new.metadata->>'nfe_key');if coalesce(k,'') !~ '^[0-9]{44}$' then k:=null;end if;
 identity_key:=case when k is not null then 'NF:'||k else 'FILE:'||new.file_id::text end;
 insert into public.fc_pallet_notas(empresa_id,identity,chave,emitente_cnpj,numero,serie,emitida_em,quantidade,quantidade_detectada)
 values(new.empresa_id,identity_key,k,nullif(new.metadata->>'issuer_cnpj',''),nullif(new.metadata->>'number',''),nullif(new.metadata->>'series',''),new.metadata->>'issued_at',q,q)
 on conflict(empresa_id,identity) do update set
 emitente_cnpj=coalesce(fc_pallet_notas.emitente_cnpj,excluded.emitente_cnpj),numero=coalesce(fc_pallet_notas.numero,excluded.numero),serie=coalesce(fc_pallet_notas.serie,excluded.serie),
 quantidade=coalesce(fc_pallet_notas.quantidade,excluded.quantidade),quantidade_detectada=coalesce(fc_pallet_notas.quantidade_detectada,excluded.quantidade_detectada),
 issues=case when excluded.quantidade is not null and fc_pallet_notas.quantidade is not null and excluded.quantidade<>fc_pallet_notas.quantidade then array['QUANTIDADE_DIVERGENTE_ENTRE_DOCUMENTOS'] else fc_pallet_notas.issues end
 returning id into n;
 insert into public.fc_pallet_nf_fontes(source_id,empresa_id,nota_id) values(new.id,new.empresa_id,n) on conflict(source_id) do nothing;
 return new;
end;$$;
create trigger pallet_capture_source after insert or update on public.gmail_hub_sources for each row execute function private.pallet_capture_source();
revoke all on function private.pallet_capture_source() from public,anon,authenticated;
-- Reuse durable Gmail sources; no new mailbox connection and no stock posting during intake.
update public.gmail_hub_sources set updated_at=updated_at where metadata->'pallet'->>'candidate'='true' or (filename||' '||subject) ~* '\m(pallets?|paletes?)\M' or exists(select 1 from jsonb_array_elements(coalesce(metadata->'items','[]')) i where i->>'description' ~* '\m(pallets?|paletes?)\M');

create function public.fc_pallet_salvar(p_empresa uuid,p_actor uuid,p_nota uuid,p_revision integer,p_data jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare n public.fc_pallet_notas;x jsonb;st jsonb;a jsonb;total bigint:=0;q bigint;f jsonb;c jsonb;v jsonb;key text;
begin
 perform private.pallet_authorize(p_empresa,p_actor);
 select * into strict n from public.fc_pallet_notas where empresa_id=p_empresa and id=p_nota for update;
 if n.status in ('INTEGRADA','REVERTIDA','DUPLICADA') then raise exception 'Nota encerrada. Consulte o histórico.';end if;
 if n.revision is distinct from p_revision then raise exception 'Nota alterada em outra tela. Atualize antes de salvar.' using errcode='40001';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>100000 or jsonb_typeof(p_data->'alocacoes') is distinct from 'array' or jsonb_array_length(p_data->'alocacoes')>500 then raise exception 'Distribuição inválida.';end if;
 select estado into strict st from public.fc_app_state where empresa_id=p_empresa for update;
 if coalesce(p_data->>'quantidade','') !~ '^[1-9][0-9]{0,8}$' then raise exception 'Confira a quantidade inteira de pallets da NF.';end if;q:=(p_data->>'quantidade')::bigint;
 if n.quantidade_detectada is not null and q<>n.quantidade_detectada and length(btrim(coalesce(p_data->>'motivo_quantidade','')))<10 then raise exception 'Quantidade divergente do XML: registre o motivo e confira o documento.';end if;
 select value into f from jsonb_array_elements(coalesce(st->'fornecedores','[]')) where value->>'id'=p_data->>'fornecedor_ref' and coalesce(value->>'ativo','true')<>'false';
 if f is null then raise exception 'Selecione um fornecedor ativo do cadastro.';end if;
 if coalesce(p_data->>'modalidade','') not in ('PROPRIO','DEVOLVER_FORNECEDOR') then raise exception 'Confira a propriedade dos pallets e a obrigação com o fornecedor.';end if;
 if (n.emitente_cnpj is not null and coalesce(nullif(p_data->>'emitente_cnpj',''),n.emitente_cnpj)<>n.emitente_cnpj) or (n.numero is not null and coalesce(nullif(p_data->>'numero',''),n.numero)<>n.numero) or (n.serie is not null and coalesce(nullif(p_data->>'serie',''),n.serie)<>n.serie) then raise exception 'A identificação deve corresponder ao documento original. Reprocesse o XML em caso de divergência.';end if;
 if coalesce(p_data->>'conferida','false')='true' then
  if length(btrim(coalesce(p_data->>'evidencia','')))<10 or coalesce(p_data->>'numero',n.numero,'')='' or coalesce(p_data->>'serie',n.serie,'')='' or coalesce(p_data->>'emitente_cnpj',n.emitente_cnpj,'') !~ '^[0-9]{14}$' then raise exception 'Confira emitente, número, série e registre a conferência fiscal do documento.';end if;
  if not exists(select 1 from public.fc_pallet_nf_fontes r join public.gmail_hub_sources s on s.id=r.source_id and s.empresa_id=r.empresa_id join public.gmail_hub_supplier_rules rule on rule.id=s.supplier_id and rule.empresa_id=s.empresa_id and rule.active where r.nota_id=n.id and r.empresa_id=p_empresa and s.allowed) then raise exception 'Origem não autorizada. Confira a regra do fornecedor no Gmail e reprocesse o documento.';end if;
 end if;
 for a in select value from jsonb_array_elements(p_data->'alocacoes') loop
  c:=null;v:=null;
  if coalesce(a->>'quantidade','') !~ '^[1-9][0-9]{0,8}$' or coalesce(a->>'tipo','') not in ('GALPAO','COMODATO','VENDA') then raise exception 'Confira tipo e quantidade de cada destinação.';end if;
  total:=total+(a->>'quantidade')::bigint;
  if a->>'tipo'='GALPAO' then
   if a->>'local' not in ('GALPÃO MONTE CARMELO','GALPÃO CALDAS NOVAS') or a->>'local' is null then raise exception 'Selecione o galpão de destino.';end if;
  else
   select value into c from jsonb_array_elements(coalesce(st->'clientes','[]')) where value->>'id'=a->>'cliente_ref' and coalesce(value->>'ativo','true')<>'false';
   if c is null then raise exception 'Selecione o cliente de cada entrega.';end if;
   if nullif(a->>'venda_ref','') is not null then
    select value into v from jsonb_array_elements(coalesce(st->'vendas','[]')) where value->>'id'=a->>'venda_ref';
    if v is null or v->>'clienteId' is distinct from a->>'cliente_ref' or v->>'status' in ('CANCELADA','EXCLUIDA') then raise exception 'Venda não pertence ao cliente ou está indisponível.';end if;
   end if;
   if nullif(a->>'carga_ref','') is not null and not exists(select 1 from jsonb_array_elements(coalesce(st->'cargas','[]')) where value->>'id'=a->>'carga_ref' and coalesce(value->>'status','') not in ('CANCELADA','EXCLUIDA') and (nullif(a->>'venda_ref','') is null or exists(select 1 from jsonb_array_elements(coalesce(value->'vendaIds','[]')) z where z#>>'{}'=a->>'venda_ref') or v->>'cargaId'=a->>'carga_ref')) then raise exception 'Confira o vínculo entre venda e carga.';end if;
   if length(btrim(coalesce(a->>'entrega_ref','')))<1 then raise exception 'Identifique cada entrega ao cliente.';end if;
   if a->>'tipo'='VENDA' and p_data->>'modalidade'<>'PROPRIO' then raise exception 'Pallets de terceiros não podem ser vendidos sem regularizar a propriedade.';end if;
  end if;
 end loop;
 if total>q then raise exception 'Distribuição acima da quantidade da NF.';end if;
 delete from public.fc_pallet_alocacoes where empresa_id=p_empresa and nota_id=n.id;
 insert into public.fc_pallet_alocacoes(empresa_id,nota_id,cliente_ref,venda_ref,carga_ref,entrega_ref,local,tipo,quantidade)
 select p_empresa,n.id,nullif(entry.value->>'cliente_ref',''),nullif(entry.value->>'venda_ref',''),nullif(entry.value->>'carga_ref',''),nullif(entry.value->>'entrega_ref',''),nullif(entry.value->>'local',''),entry.value->>'tipo',(entry.value->>'quantidade')::bigint from jsonb_array_elements(p_data->'alocacoes') entry(value);
 update public.fc_pallet_notas set quantidade=q,fornecedor_ref=p_data->>'fornecedor_ref',modalidade=p_data->>'modalidade',conferida=coalesce(p_data->>'conferida','false')='true',
 numero=coalesce(nullif(p_data->>'numero',''),numero),serie=coalesce(nullif(p_data->>'serie',''),serie),emitente_cnpj=coalesce(nullif(p_data->>'emitente_cnpj',''),emitente_cnpj),
 evidencia=p_data->>'evidencia',issues=case when p_data->>'conferir_divergencia'='true' and length(btrim(coalesce(p_data->>'motivo_quantidade','')))>9 then '{}'::text[] else issues end,conferida_por=p_actor,revision=revision+1,
 status=case when total=q and coalesce(p_data->>'conferida','false')='true' and cardinality(issues)=0 then 'PRONTA' when total>0 then 'PARCIAL' else 'CONFERENCIA_PENDENTE' end where id=n.id returning * into n;
 insert into public.fc_pallet_auditoria(empresa_id,nota_id,request_id,evento,responsavel,motivo,detalhes) values(p_empresa,n.id,gen_random_uuid(),'CONFERENCIA_E_DISTRIBUICAO',p_actor,p_data->>'motivo_quantidade',jsonb_build_object('alocada',total,'quantidade',q,'revision',n.revision));
 return jsonb_build_object('id',n.id,'status',n.status,'revision',n.revision,'alocada',total,'restante',q-total,'issues',to_jsonb(n.issues));
end;$$;

create function public.fc_pallet_integrar(p_empresa uuid,p_actor uuid,p_nota uuid,p_revision integer,p_request uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare n public.fc_pallet_notas;a public.fc_pallet_alocacoes;st jsonb;f jsonb;c jsonb;doc text;origin text;dest text;
begin
 perform private.pallet_authorize(p_empresa,p_actor);
 if p_request is null then raise exception 'Identificador da operação obrigatório.';end if;
 select * into strict n from public.fc_pallet_notas where empresa_id=p_empresa and id=p_nota for update;
 if n.status='INTEGRADA' then return jsonb_build_object('id',n.id,'status','INTEGRADA','replayed',true);end if;
 if n.status<>'PRONTA' or not n.conferida or cardinality(n.issues)>0 then raise exception 'Conclua a conferência e distribua 100%% antes de integrar.';end if;
 if n.revision is distinct from p_revision then raise exception 'Nota alterada. Atualize antes de integrar.' using errcode='40001';end if;
 if n.quantidade is null or coalesce((select sum(quantidade) from public.fc_pallet_alocacoes where empresa_id=p_empresa and nota_id=n.id),0)<>n.quantidade then raise exception 'A soma das destinações deve ser igual à quantidade da NF.';end if;
 select estado into strict st from public.fc_app_state where empresa_id=p_empresa for update;
 select value into f from jsonb_array_elements(coalesce(st->'fornecedores','[]')) where value->>'id'=n.fornecedor_ref and coalesce(value->>'ativo','true')<>'false';
 if f is null then raise exception 'Fornecedor indisponível. Reveja a distribuição.';end if;
 if regexp_replace(coalesce(f->>'cnpj',f->>'cpfCnpj',''),'[^0-9]','','g') is distinct from n.emitente_cnpj then raise exception 'CNPJ do fornecedor diverge do emitente. Confira o cadastro.';end if;
 if not exists(select 1 from public.fc_pallet_nf_fontes r join public.gmail_hub_sources s on s.id=r.source_id and s.empresa_id=r.empresa_id join public.gmail_hub_supplier_rules rule on rule.id=s.supplier_id and rule.empresa_id=s.empresa_id and rule.active where r.nota_id=n.id and r.empresa_id=p_empresa and s.allowed) then raise exception 'Origem não autorizada para integração.';end if;
 -- Serialize stock and account postings for this company; all calls acquire note then company in the same order.
 perform pg_advisory_xact_lock(hashtextextended('pallet-company:'||p_empresa::text,0));
 doc:='NF '||n.numero||' / '||n.serie;origin:='REMETENTE: '||coalesce(f->>'nome',n.emitente_cnpj);
 insert into public.fc_pallet_movimentos(empresa_id,pallet_nota_id,tipo,origem,destino,quantidade,documento_referencia,criado_por,request_id,metadata)
 values(p_empresa,n.id,case when n.modalidade='PROPRIO' then 'COMPRA' else 'RECEBIMENTO EM COMODATO' end,origin,'EM TRÂNSITO',n.quantidade,doc,p_actor,p_request,jsonb_build_object('managed',true,'fornecedor_ref',n.fornecedor_ref,'patrimonioDelta',case when n.modalidade='PROPRIO' then n.quantidade else 0 end));
 if n.modalidade='DEVOLVER_FORNECEDOR' then insert into public.fc_pallet_contas(empresa_id,nota_id,parte,parte_ref,quantidade,evento,request_id,criado_por) values(p_empresa,n.id,'FORNECEDOR',n.fornecedor_ref,n.quantidade,'RECEBIMENTO_COM_OBRIGACAO',p_request,p_actor);end if;
 for a in select * from public.fc_pallet_alocacoes where empresa_id=p_empresa and nota_id=n.id order by id loop
  c:=null;
  if a.tipo='GALPAO' then dest:=a.local;else
   select value into c from jsonb_array_elements(coalesce(st->'clientes','[]')) where value->>'id'=a.cliente_ref and coalesce(value->>'ativo','true')<>'false';
   if c is null then raise exception 'Cliente indisponível. Reveja a distribuição.';end if;
   if a.venda_ref is not null and not exists(select 1 from jsonb_array_elements(coalesce(st->'vendas','[]')) where value->>'id'=a.venda_ref and value->>'clienteId'=a.cliente_ref and coalesce(value->>'status','') not in ('CANCELADA','EXCLUIDA')) then raise exception 'Venda alterada ou excluída. Confira a destinação.';end if;
   if a.carga_ref is not null and not exists(select 1 from jsonb_array_elements(coalesce(st->'cargas','[]')) where value->>'id'=a.carga_ref and coalesce(value->>'status','') not in ('CANCELADA','EXCLUIDA')) then raise exception 'Carga alterada ou excluída. Confira a destinação.';end if;
   dest:=case when a.tipo='COMODATO' then 'CLIENTE / COMODATO' else 'BAIXA DEFINITIVA' end;
  end if;
  insert into public.fc_pallet_movimentos(empresa_id,pallet_nota_id,pallet_alocacao_id,tipo,origem,destino,quantidade,documento_referencia,criado_por,request_id,metadata)
  values(p_empresa,n.id,a.id,case when a.tipo='GALPAO' then 'ENTRADA NO GALPÃO' when a.tipo='COMODATO' then 'COMODATO A CLIENTE' else 'VENDA' end,'EM TRÂNSITO',dest,a.quantidade,doc,p_actor,p_request,jsonb_build_object('managed',true,'cliente_ref',a.cliente_ref,'cliente',c->>'nome','fornecedor_ref',n.fornecedor_ref,'venda_ref',a.venda_ref,'carga_ref',a.carga_ref,'entrega_ref',a.entrega_ref,'patrimonioDelta',case when a.tipo='VENDA' then -a.quantidade else 0 end));
  if a.tipo='COMODATO' then insert into public.fc_pallet_contas(empresa_id,nota_id,alocacao_id,parte,parte_ref,quantidade,evento,request_id,criado_por) values(p_empresa,n.id,a.id,'CLIENTE',a.cliente_ref,a.quantidade,'REMESSA_EM_COMODATO',p_request,p_actor);end if;
 end loop;
 insert into public.fc_pallet_auditoria(empresa_id,nota_id,request_id,evento,responsavel,detalhes) values(p_empresa,n.id,p_request,'INTEGRACAO_ATOMICA',p_actor,jsonb_build_object('quantidade',n.quantidade));
 update public.fc_pallet_notas set status='INTEGRADA',integrada_por=p_actor,integrada_em=now(),revision=revision+1 where id=n.id;
 return jsonb_build_object('id',n.id,'status','INTEGRADA','replayed',false);
end;$$;
revoke all on function public.fc_pallet_salvar(uuid,uuid,uuid,integer,jsonb),public.fc_pallet_integrar(uuid,uuid,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.fc_pallet_salvar(uuid,uuid,uuid,integer,jsonb),public.fc_pallet_integrar(uuid,uuid,uuid,integer,uuid) to service_role;
create function private.pallet_saldo(p_empresa uuid,p_local text) returns numeric language sql stable security invoker set search_path='' as $$
 select coalesce((select sum(case when m.destino=p_local then m.quantidade else 0 end)-sum(case when m.origem=p_local then m.quantidade else 0 end) from public.fc_pallet_movimentos m where m.empresa_id=p_empresa),0)
 +coalesce((select sum(case when x->>'destino'=p_local then (x->>'quantidade')::numeric else 0 end)-sum(case when x->>'origem'=p_local then (x->>'quantidade')::numeric else 0 end) from public.fc_app_state s,jsonb_array_elements(coalesce(s.estado->'palletMovimentosV47','[]')) x where s.empresa_id=p_empresa),0)
$$;
revoke all on function private.pallet_saldo(uuid,text) from public,anon,authenticated;
grant execute on function private.pallet_saldo(uuid,text) to service_role;

create function private.pallet_saldo_nota(p_empresa uuid,p_nota uuid,p_local text) returns numeric language sql stable security invoker set search_path='' as $$
 select coalesce(sum(case when destino=p_local then quantidade else 0 end)-sum(case when origem=p_local then quantidade else 0 end),0) from public.fc_pallet_movimentos where empresa_id=p_empresa and pallet_nota_id=p_nota
$$;
revoke all on function private.pallet_saldo_nota(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.pallet_saldo_nota(uuid,uuid,text) to service_role;

create function public.fc_pallet_movimentar(p_empresa uuid,p_actor uuid,p_request uuid,p_data jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare st jsonb;n public.fc_pallet_notas;m uuid;t text;q bigint;origin text;dest text;client jsonb;part text;part_ref text;owed bigint;note_id uuid;delta bigint:=0;
begin
 perform private.pallet_authorize(p_empresa,p_actor);
 if p_request is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Operação inválida.';end if;
 note_id:=nullif(p_data->>'nota_id','')::uuid;
 if note_id is not null then select * into strict n from public.fc_pallet_notas where empresa_id=p_empresa and id=note_id for update;if n.status<>'INTEGRADA' then raise exception 'Selecione uma NF integrada para a devolução.';end if;end if;
 select estado into strict st from public.fc_app_state where empresa_id=p_empresa for update;
 perform pg_advisory_xact_lock(hashtextextended('pallet-company:'||p_empresa::text,0));
 if exists(select 1 from public.fc_pallet_auditoria where empresa_id=p_empresa and request_id=p_request) then
  if not exists(select 1 from public.fc_pallet_auditoria where empresa_id=p_empresa and request_id=p_request and evento=p_data->>'tipo' and detalhes->'input'=p_data) then raise exception 'Identificador reutilizado com outros dados.' using errcode='40001';end if;
  return jsonb_build_object('ok',true,'replayed',true);end if;
 t:=p_data->>'tipo';
 if t not in ('TRANSFERÊNCIA','COMODATO A CLIENTE','RETORNO','DEVOLUÇÃO AO FORNECEDOR','PERDA / AVARIA','AJUSTE DE ENTRADA','AJUSTE DE SAÍDA') or t is null then raise exception 'Compra e venda de pallets devem passar pela conferência da NF.';end if;
 if coalesce(p_data->>'quantidade','') !~ '^[1-9][0-9]{0,8}$' or length(btrim(coalesce(p_data->>'observacao','')))<10 then raise exception 'Informe quantidade inteira e motivo com pelo menos 10 caracteres.';end if;q:=(p_data->>'quantidade')::bigint;
 origin:=p_data->>'origem';dest:=p_data->>'destino';
 if t in ('COMODATO A CLIENTE','RETORNO') then
  select value into client from jsonb_array_elements(coalesce(st->'clientes','[]')) where value->>'id'=p_data->>'cliente_ref' and coalesce(value->>'ativo','true')<>'false';
  if client is null then raise exception 'Selecione um cliente ativo.';end if;
  part:='CLIENTE';part_ref:=client->>'id';
  if t='COMODATO A CLIENTE' then dest:='CLIENTE / COMODATO';delta:=q;else
   origin:='CLIENTE / COMODATO';delta:=-q;
   select coalesce(sum(quantidade),0) into owed from public.fc_pallet_contas where empresa_id=p_empresa and parte='CLIENTE' and parte_ref=client->>'id' and nota_id is not distinct from note_id;
   if note_id is null then
    -- Legacy balances are only matched when the full client name identifies one existing customer.
    if (select count(*) from jsonb_array_elements(coalesce(st->'clientes','[]')) where upper(btrim(value->>'nome'))=upper(btrim(client->>'nome')))<>1 then raise exception 'Nome de cliente ambíguo no histórico. Concilie antes de devolver.';end if;
    select owed+coalesce(sum(case when upper(coalesce(x->>'movimento','')) ~ 'DEVOLU|SAÍDA|VENDA' then -(x->>'quantidade')::bigint else (x->>'quantidade')::bigint end),0) into owed from jsonb_array_elements(coalesce(st->'palletClientes','[]')) x where upper(btrim(x->>'nome'))=upper(btrim(client->>'nome'));
    select owed+coalesce(sum(case when x->>'destino'='CLIENTE / COMODATO' then (x->>'quantidade')::bigint else 0 end)-sum(case when x->>'origem'='CLIENTE / COMODATO' then (x->>'quantidade')::bigint else 0 end),0) into owed from jsonb_array_elements(coalesce(st->'palletMovimentosV47','[]')) x where upper(btrim(coalesce(x->>'cliente',x->>'nomeCliente','')))=upper(btrim(client->>'nome'));
   end if;
   if owed<q then raise exception 'Devolução maior que o saldo do cliente nesta NF ou no histórico selecionado.';end if;
  end if;
 end if;
 if t='DEVOLUÇÃO AO FORNECEDOR' then
  if note_id is null or n.modalidade<>'DEVOLVER_FORNECEDOR' then raise exception 'Selecione a NF com obrigação de devolução ao fornecedor.';end if;
  part:='FORNECEDOR';part_ref:=n.fornecedor_ref;delta:=-q;
  select coalesce(sum(quantidade),0) into owed from public.fc_pallet_contas where empresa_id=p_empresa and nota_id=note_id and parte='FORNECEDOR';
  if owed<q then raise exception 'Devolução maior que a obrigação desta NF com o fornecedor.';end if;
  dest:='DEVOLVIDO AO FORNECEDOR';
 end if;
 if t in ('PERDA / AVARIA','AJUSTE DE SAÍDA') then dest:='BAIXA DEFINITIVA';end if;
 if t='AJUSTE DE ENTRADA' then origin:='AJUSTE AUDITADO';end if;
 if (t<>'RETORNO' and t<>'AJUSTE DE ENTRADA' and coalesce(origin,'') not in ('GALPÃO MONTE CARMELO','GALPÃO CALDAS NOVAS','EM TRÂNSITO')) or (t in ('TRANSFERÊNCIA','RETORNO','AJUSTE DE ENTRADA') and coalesce(dest,'') not in ('GALPÃO MONTE CARMELO','GALPÃO CALDAS NOVAS','EM TRÂNSITO')) or origin is null or dest is null or origin=dest then raise exception 'Confira a origem e o destino físico.';end if;
 if note_id is not null and t not in ('RETORNO','AJUSTE DE ENTRADA') and private.pallet_saldo_nota(p_empresa,note_id,origin)<q then raise exception 'Saldo desta NF insuficiente na origem. Confira os lotes e as destinações.';end if;
 if t in ('PERDA / AVARIA','AJUSTE DE ENTRADA','AJUSTE DE SAÍDA') and note_id is null and coalesce(p_data->>'patrimonio','') not in ('PROPRIO','TERCEIROS') then raise exception 'Informe se o ajuste envolve patrimônio próprio ou pallets de terceiros.';end if;
 if t not in ('RETORNO','AJUSTE DE ENTRADA') and private.pallet_saldo(p_empresa,origin)<q then raise exception 'Saldo físico insuficiente na origem.';end if;
 insert into public.fc_pallet_movimentos(empresa_id,pallet_nota_id,tipo,origem,destino,quantidade,documento_referencia,observacao,criado_por,request_id,metadata)
 values(p_empresa,note_id,t,origin,dest,q,nullif(p_data->>'documento',''),p_data->>'observacao',p_actor,p_request,jsonb_build_object('managed',true,'cliente_ref',client->>'id','cliente',client->>'nome','fornecedor_ref',case when part='FORNECEDOR' then part_ref end,'patrimonioDelta',case when (note_id is not null and n.modalidade='PROPRIO') or (note_id is null and p_data->>'patrimonio'='PROPRIO') then case when t='AJUSTE DE ENTRADA' then q when t in ('PERDA / AVARIA','AJUSTE DE SAÍDA') then -q else 0 end else 0 end)) returning id into m;
 if part is not null then insert into public.fc_pallet_contas(empresa_id,nota_id,parte,parte_ref,quantidade,evento,request_id,criado_por) values(p_empresa,note_id,part,part_ref,delta,t,p_request,p_actor);end if;
 insert into public.fc_pallet_auditoria(empresa_id,nota_id,request_id,evento,responsavel,motivo,detalhes) values(p_empresa,note_id,p_request,t,p_actor,p_data->>'observacao',jsonb_build_object('input',p_data,'movimento_id',m,'origem',origin,'destino',dest,'quantidade',q));
 return jsonb_build_object('ok',true,'replayed',false,'movimento_id',m);
end;$$;

create function public.fc_pallet_reverter(p_empresa uuid,p_actor uuid,p_nota uuid,p_request uuid,p_motivo text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare n public.fc_pallet_notas;m public.fc_pallet_movimentos;c public.fc_pallet_contas;loc text;q numeric;st jsonb;
begin
 perform private.pallet_authorize(p_empresa,p_actor);
 if p_request is null or length(btrim(coalesce(p_motivo,'')))<10 then raise exception 'Registre o motivo da reversão com pelo menos 10 caracteres.';end if;
 select * into strict n from public.fc_pallet_notas where empresa_id=p_empresa and id=p_nota for update;
 if n.status='REVERTIDA' then return jsonb_build_object('status','REVERTIDA','replayed',true);end if;
 if n.status<>'INTEGRADA' then raise exception 'Somente nota integrada pode ser revertida.';end if;
 select estado into strict st from public.fc_app_state where empresa_id=p_empresa for update;
 perform pg_advisory_xact_lock(hashtextextended('pallet-company:'||p_empresa::text,0));
 if exists(select 1 from public.fc_pallet_contas where empresa_id=p_empresa and nota_id=n.id and evento not in ('RECEBIMENTO_COM_OBRIGACAO','REMESSA_EM_COMODATO')) or exists(select 1 from public.fc_pallet_movimentos where empresa_id=p_empresa and pallet_nota_id=n.id and tipo in ('RETORNO','DEVOLUÇÃO AO FORNECEDOR')) then raise exception 'Nota possui devoluções posteriores. Concilie esses movimentos antes de reverter.';end if;
 for loc,q in select destino,sum(quantidade) from public.fc_pallet_movimentos where empresa_id=p_empresa and pallet_nota_id=n.id and destino not in ('BAIXA DEFINITIVA','CLIENTE / COMODATO','EM TRÂNSITO') group by destino loop
  if private.pallet_saldo(p_empresa,loc)<q then raise exception 'Saldo físico já utilizado. Concilie a localização antes da reversão.';end if;
 end loop;
 for m in select * from public.fc_pallet_movimentos where empresa_id=p_empresa and pallet_nota_id=n.id order by id loop
  insert into public.fc_pallet_movimentos(empresa_id,pallet_nota_id,pallet_alocacao_id,tipo,origem,destino,quantidade,documento_referencia,observacao,criado_por,request_id,metadata)
  values(p_empresa,n.id,m.pallet_alocacao_id,'REVERSÃO',m.destino,m.origem,m.quantidade,m.documento_referencia,p_motivo,p_actor,p_request,m.metadata||jsonb_build_object('reversaoDe',m.id,'patrimonioDelta',-coalesce((m.metadata->>'patrimonioDelta')::bigint,0)));
 end loop;
 for c in select * from public.fc_pallet_contas where empresa_id=p_empresa and nota_id=n.id order by id loop
  insert into public.fc_pallet_contas(empresa_id,nota_id,alocacao_id,parte,parte_ref,quantidade,evento,request_id,criado_por) values(p_empresa,n.id,c.alocacao_id,c.parte,c.parte_ref,-c.quantidade,'REVERSÃO',p_request,p_actor);
 end loop;
 insert into public.fc_pallet_auditoria(empresa_id,nota_id,request_id,evento,responsavel,motivo) values(p_empresa,n.id,p_request,'REVERSAO_AUDITADA',p_actor,p_motivo);
 update public.fc_pallet_notas set status='REVERTIDA',revision=revision+1 where id=n.id;
 return jsonb_build_object('status','REVERTIDA','replayed',false);
end;$$;
revoke all on function public.fc_pallet_movimentar(uuid,uuid,uuid,jsonb),public.fc_pallet_reverter(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.fc_pallet_movimentar(uuid,uuid,uuid,jsonb),public.fc_pallet_reverter(uuid,uuid,uuid,uuid,text) to service_role;
create function public.fc_pallet_painel(p_empresa uuid,p_actor uuid,p_historico boolean default false,p_offset integer default 0) returns jsonb language plpgsql security invoker set search_path='' as $$
declare notes jsonb;stock jsonb;accounts jsonb;movements jsonb;property numeric;st jsonb;
begin
 perform private.pallet_authorize(p_empresa,p_actor,false);
 if p_offset<0 or p_offset>1000000 then raise exception 'Página inválida.';end if;
 select estado into strict st from public.fc_app_state where empresa_id=p_empresa;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into notes from (select * from public.fc_pallet_notas where empresa_id=p_empresa and case when p_historico then status in ('INTEGRADA','REVERTIDA','DUPLICADA') else status not in ('INTEGRADA','REVERTIDA','DUPLICADA') end order by criada_em desc,id limit 100 offset p_offset) x;
 select jsonb_agg(jsonb_build_object('local',loc,'saldo',private.pallet_saldo(p_empresa,loc))) into stock from (select unnest(array['GALPÃO MONTE CARMELO','GALPÃO CALDAS NOVAS','EM TRÂNSITO']) loc union select 'FORNECEDOR: '||upper(value->>'nome') from jsonb_array_elements(coalesce(st->'fornecedores','[]'))) locations;
 with legacy as (
  select x->>'nome' nome,case when upper(coalesce(x->>'movimento','')) ~ 'DEVOLU|SAÍDA|VENDA' then -(x->>'quantidade')::numeric else (x->>'quantidade')::numeric end q from jsonb_array_elements(coalesce(st->'palletClientes','[]')) x
  union all select coalesce(x->>'cliente',x->>'nomeCliente'),case when x->>'destino'='CLIENTE / COMODATO' then (x->>'quantidade')::numeric else 0 end-case when x->>'origem'='CLIENTE / COMODATO' then (x->>'quantidade')::numeric else 0 end from jsonb_array_elements(coalesce(st->'palletMovimentosV47','[]')) x where coalesce(x->>'cliente',x->>'nomeCliente','')<>''
 ),mapped as (
  select l.nome,l.q,array(select c->>'id' from jsonb_array_elements(coalesce(st->'clientes','[]')) c where upper(btrim(c->>'nome'))=upper(btrim(l.nome))) refs from legacy l
 ),entries as (
  select parte,parte_ref,quantidade::numeric q from public.fc_pallet_contas where empresa_id=p_empresa
  union all select 'CLIENTE',case when cardinality(refs)=1 then refs[1] else 'LEGADO:'||nome end,q from mapped
 ),balances as (select parte,parte_ref,sum(q) saldo from entries group by parte,parte_ref)
 select coalesce(jsonb_agg(to_jsonb(b)),'[]') into accounts from balances b;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into movements from (select * from public.fc_pallet_movimentos where empresa_id=p_empresa order by created_at desc,id limit 100) x;
 select coalesce(sum(coalesce((metadata->>'patrimonioDelta')::numeric,0)),0) into property from public.fc_pallet_movimentos where empresa_id=p_empresa;
 select property+coalesce(sum((coalesce(x->>'quantidade',x->>'qtd','0'))::numeric*case when coalesce(x->>'tipo','') like '%SAÍDA%' or coalesce(x->>'tipo','') like '%VENDA%' then -1 else 1 end),0) into property from jsonb_array_elements(coalesce(st->'palletPatrimonio','[]')) x;
 select property+coalesce(sum(case when x->>'afetaPatrimonio'='true' then coalesce((x->>'quantidade')::numeric,0)*case when x->>'tipo' in ('COMPRA','AJUSTE DE ENTRADA') then 1 else -1 end else 0 end),0) into property from jsonb_array_elements(coalesce(st->'palletMovimentosV47','[]')) x;
 return jsonb_build_object('notas',notes,'saldos',stock,'contas',accounts,'movimentos',movements,'patrimonio',property,'next_offset',case when jsonb_array_length(notes)=100 then p_offset+100 end);
end;$$;

create function public.fc_pallet_documentos(p_empresa uuid,p_actor uuid,p_nota uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform private.pallet_authorize(p_empresa,p_actor,false);
 if not exists(select 1 from public.fc_pallet_notas where empresa_id=p_empresa and id=p_nota) then raise exception 'Nota indisponível.';end if;
 return jsonb_build_object('alocacoes',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.fc_pallet_alocacoes a where empresa_id=p_empresa and nota_id=p_nota),
 'fontes',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'filename',s.filename,'allowed',s.allowed,'issues',s.issues,'metadata',s.metadata,'path',f.storage_path)),'[]') from public.fc_pallet_nf_fontes n join public.gmail_hub_sources s on s.id=n.source_id and s.empresa_id=n.empresa_id join public.gmail_hub_files f on f.id=s.file_id and f.empresa_id=s.empresa_id where n.empresa_id=p_empresa and n.nota_id=p_nota),
 'auditoria',(select coalesce(jsonb_agg(to_jsonb(a) order by criada_em desc),'[]') from public.fc_pallet_auditoria a where empresa_id=p_empresa and nota_id=p_nota));
end;$$;
revoke all on function public.fc_pallet_painel(uuid,uuid,boolean,integer),public.fc_pallet_documentos(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.fc_pallet_painel(uuid,uuid,boolean,integer),public.fc_pallet_documentos(uuid,uuid,uuid) to service_role;
create function public.fc_pallet_localizar(p_empresa uuid,p_actor uuid,p_busca text) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform private.pallet_authorize(p_empresa,p_actor,false);
 if length(btrim(coalesce(p_busca,'')))<2 or length(p_busca)>80 then raise exception 'Informe o número da NF ou CNPJ para localizar.';end if;
 return (select coalesce(jsonb_agg(to_jsonb(n)),'[]') from (select id,numero,serie,emitente_cnpj,status,quantidade from public.fc_pallet_notas where empresa_id=p_empresa and status not in ('DUPLICADA','REVERTIDA') and (numero=p_busca or emitente_cnpj=p_busca or chave=p_busca) order by criada_em desc limit 30) n);
end;$$;
create function public.fc_pallet_juntar_documento(p_empresa uuid,p_actor uuid,p_origem uuid,p_destino uuid,p_request uuid,p_motivo text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.fc_pallet_notas;b public.fc_pallet_notas;
begin
 perform private.pallet_authorize(p_empresa,p_actor);
 if p_request is null or p_origem=p_destino or length(btrim(coalesce(p_motivo,'')))<10 then raise exception 'Selecione a NF e registre o motivo da vinculação.';end if;
 perform 1 from public.fc_pallet_notas where empresa_id=p_empresa and id in (p_origem,p_destino) order by id for update;
 select * into strict a from public.fc_pallet_notas where empresa_id=p_empresa and id=p_origem;
 select * into strict b from public.fc_pallet_notas where empresa_id=p_empresa and id=p_destino;
 if a.status='DUPLICADA' and a.nota_canonica_id=b.id then return jsonb_build_object('ok',true,'replayed',true);end if;
 if a.status in ('INTEGRADA','REVERTIDA','DUPLICADA') or b.status in ('DUPLICADA','REVERTIDA') then raise exception 'Documento encerrado ou NF de destino indisponível.';end if;
 if (a.chave is not null and b.chave is not null and a.chave<>b.chave) or (a.emitente_cnpj is not null and b.emitente_cnpj is not null and a.emitente_cnpj<>b.emitente_cnpj) or (a.numero is not null and b.numero is not null and a.numero<>b.numero) or (a.serie is not null and b.serie is not null and a.serie<>b.serie) then raise exception 'Documentos possuem identidades fiscais diferentes.';end if;
 if a.quantidade_detectada is not null and b.quantidade is not null and a.quantidade_detectada<>b.quantidade then raise exception 'Documentos possuem quantidades divergentes. Confira antes de vinculá-los.';end if;
 update public.fc_pallet_nf_fontes set nota_id=b.id where empresa_id=p_empresa and nota_id=a.id;
 update public.fc_pallet_notas set status='DUPLICADA',nota_canonica_id=b.id,revision=revision+1 where id=a.id;
 insert into public.fc_pallet_auditoria(empresa_id,nota_id,request_id,evento,responsavel,motivo,detalhes) values(p_empresa,a.id,p_request,'DOCUMENTO_VINCULADO_A_NF_EXISTENTE',p_actor,p_motivo,jsonb_build_object('nota_canonica_id',b.id));
 return jsonb_build_object('ok',true,'replayed',false);
end;$$;
revoke all on function public.fc_pallet_localizar(uuid,uuid,text),public.fc_pallet_juntar_documento(uuid,uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.fc_pallet_localizar(uuid,uuid,text),public.fc_pallet_juntar_documento(uuid,uuid,uuid,uuid,uuid,text) to service_role;
commit;
