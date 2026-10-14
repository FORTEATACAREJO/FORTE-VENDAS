-- Reviewed installation script. Execute only after configuring the server completion-key hash
-- and reconciling the next nosso número with the existing bank portfolio.
begin;
create table if not exists private.fc_itau_server_config (
 singleton boolean primary key default true check(singleton), completion_key_sha256 text not null
);
revoke all on private.fc_itau_server_config from public,anon,authenticated;
create sequence if not exists private.fc_itau_nosso_numero minvalue 1 maxvalue 99999999 no cycle;
revoke all on sequence private.fc_itau_nosso_numero from public,anon,authenticated;
create table if not exists public.fc_itau_ledger (
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null,
 boleto_id text not null,venda_id text not null,parcela integer not null check(parcela between 1 and 36),
 nosso_numero text not null unique check(nosso_numero ~ '^\d{8}$'),
 status text not null default 'PROCESSANDO' check(status in('PROCESSANDO','REGISTRADO','CONFERIR RETORNO')),
 boleto jsonb not null,receipt jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(empresa_id,boleto_id),unique(empresa_id,venda_id,parcela)
);
alter table public.fc_itau_ledger enable row level security;
revoke all on public.fc_itau_ledger from public,anon,authenticated;
grant select on public.fc_itau_ledger to authenticated;
create policy fc_itau_ledger_read on public.fc_itau_ledger for select to authenticated using (
 exists(select 1 from public.fc_perfis p where p.user_id=auth.uid() and p.empresa_id=fc_itau_ledger.empresa_id
 and p.ativo and p.status_aprovacao='APROVADO' and not coalesce(p.trocar_senha,false)
 and (p.perfil in('MASTER','ADMINISTRADOR') or (p.perfil in('OPERADOR_GERAL','VENDEDOR_INTERNO') and p.permissoes->'COBRANÇAS ITAÚ'->>'editar'='true')))
);
create or replace function private.fc_itau_profile() returns public.fc_perfis language plpgsql security definer set search_path='' as $$
declare p public.fc_perfis;
begin
 if auth.uid() is null then raise exception 'Entre no sistema.';end if;
 select * into p from public.fc_perfis where user_id=auth.uid();
 if not found or p.ativo is not true or p.status_aprovacao is distinct from 'APROVADO' or coalesce(p.trocar_senha,false)
 or not (p.perfil in('MASTER','ADMINISTRADOR') or (p.perfil in('OPERADOR_GERAL','VENDEDOR_INTERNO') and coalesce(p.permissoes->'COBRANÇAS ITAÚ'->>'editar','false')='true')) then raise exception 'Emissão não autorizada.';end if;
 return p;
end $$;
revoke all on function private.fc_itau_profile() from public,anon,authenticated;
create or replace function public.fc_itau_reserve(p_boleto_id text,p_versao bigint) returns jsonb language plpgsql security definer set search_path='' as $$
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
revoke all on function public.fc_itau_reserve(text,bigint) from public,anon;
grant execute on function public.fc_itau_reserve(text,bigint) to authenticated;
create or replace function public.fc_itau_complete(p_id uuid,p_key text,p_receipt jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
revoke all on function public.fc_itau_complete(uuid,text,jsonb) from public,anon;
grant execute on function public.fc_itau_complete(uuid,text,jsonb) to authenticated;
commit;
