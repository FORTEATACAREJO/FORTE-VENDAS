-- Additive intake only. No stock, fiscal posting, accounts payable or payment writes.
create table public.gmail_hub_supplier_rules (
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null,
 name text not null, cnpj text not null check(cnpj ~ '^\d{14}$'),
 senders text[] not null default '{}', domains text[] not null default '{}',
 kinds text[] not null default array['XML_NFE','DANFE','BOLETO'], active boolean not null default false,
 unique(empresa_id,cnpj), unique(empresa_id,id)
);
create table public.gmail_hub_recipient_rules (
 empresa_id uuid not null, cnpj text not null check(cnpj ~ '^\d{14}$'),
 label text not null, primary key(empresa_id,cnpj)
);
create table public.gmail_hub_dossiers (
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null,
 nfe_key text not null check(nfe_key ~ '^\d{44}$'), metadata jsonb not null default '{}',
 status text not null default 'CONFERENCIA_PENDENTE', order_id text, carga_id text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(empresa_id,nfe_key), unique(empresa_id,id)
);
create table public.gmail_hub_files (
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null,
 hash text not null check(hash ~ '^[a-f0-9]{64}$'), storage_path text not null,
 mime_type text, size_bytes integer not null check(size_bytes between 0 and 20971520),
 created_at timestamptz not null default now(), unique(empresa_id,hash), unique(empresa_id,id)
);
create table public.gmail_hub_sources (
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null, file_id uuid not null,
 email text not null, message_id text not null, part_id text not null, thread_id text,
 filename text not null, sender text not null, subject text not null, gmail_date timestamptz,
 kind text not null, metadata jsonb not null default '{}', issues text[] not null default '{}',
 allowed boolean not null default false, supplier_id uuid, dossier_id uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(empresa_id,email,message_id,part_id),
 foreign key(empresa_id,supplier_id) references public.gmail_hub_supplier_rules(empresa_id,id),
 foreign key(empresa_id,file_id) references public.gmail_hub_files(empresa_id,id),
 foreign key(empresa_id,dossier_id) references public.gmail_hub_dossiers(empresa_id,id)
);
create index gmail_hub_sources_dossier on public.gmail_hub_sources(empresa_id,dossier_id);
create index gmail_hub_sources_pending on public.gmail_hub_sources(empresa_id,allowed,created_at desc);
create index gmail_hub_sources_file on public.gmail_hub_sources(empresa_id,file_id);
create index gmail_hub_supplier_company on public.gmail_hub_supplier_rules(empresa_id);
create view public.gmail_hub_legacy_pending with (security_invoker=true) as
select d.* from public.gmail_hub_documents d where not exists
 (select 1 from public.gmail_hub_sources s where s.empresa_id=d.empresa_id and s.email=d.email and s.message_id=d.message_id and s.part_id=d.part_id);
revoke all on public.gmail_hub_legacy_pending from anon,authenticated;
grant select on public.gmail_hub_legacy_pending to service_role;
-- Service role only; browser access goes through the company-scoped Edge Function.
alter table public.gmail_hub_supplier_rules enable row level security;
alter table public.gmail_hub_recipient_rules enable row level security;
alter table public.gmail_hub_dossiers enable row level security;
alter table public.gmail_hub_files enable row level security;
alter table public.gmail_hub_sources enable row level security;
revoke all on public.gmail_hub_supplier_rules,public.gmail_hub_recipient_rules,public.gmail_hub_dossiers,public.gmail_hub_files,public.gmail_hub_sources from anon,authenticated;
grant all on public.gmail_hub_supplier_rules,public.gmail_hub_recipient_rules,public.gmail_hub_dossiers,public.gmail_hub_files,public.gmail_hub_sources to service_role;
create function public.gmail_hub_intake_save(p_empresa uuid,p_data jsonb,p_owner uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare f uuid; d uuid; s uuid; k text:=p_data->>'key'; old_metadata jsonb;
begin
 if not exists(select 1 from public.gmail_hub_config where id=true and empresa_id=p_empresa and lease_owner=p_owner and lease_until>now()) then raise exception 'EMPRESA_OU_PROCESSAMENTO_DIVERGENTE'; end if;
 insert into public.gmail_hub_files(empresa_id,hash,storage_path,mime_type,size_bytes)
 values(p_empresa,p_data->>'hash',p_data->>'storage_path',p_data->>'mime_type',(p_data->>'size_bytes')::integer)
 on conflict(empresa_id,hash) do update set hash=excluded.hash returning id into f;
 if k is not null and coalesce((p_data->>'allowed')::boolean,false) then
  insert into public.gmail_hub_dossiers(empresa_id,nfe_key) values(p_empresa,k)
  on conflict(empresa_id,nfe_key) do update set updated_at=now() returning id into d;
  select metadata into old_metadata from public.gmail_hub_dossiers where empresa_id=p_empresa and id=d for update;
  if p_data->>'kind'='XML_NFE' then
   -- Preserve the first XML identity; conflicting versions remain sources for review.
   if old_metadata='{}'::jsonb then
    update public.gmail_hub_dossiers set metadata=p_data->'metadata',updated_at=now() where empresa_id=p_empresa and id=d;
   elsif old_metadata is distinct from p_data->'metadata' then
    p_data=jsonb_set(p_data,'{issues}',coalesce(p_data->'issues','[]'::jsonb)||'"XML_VARIANTE_A_CONFERIR"'::jsonb);
   end if;
  end if;
 end if;
 insert into public.gmail_hub_sources(empresa_id,file_id,email,message_id,part_id,thread_id,filename,sender,subject,gmail_date,kind,metadata,issues,allowed,supplier_id,dossier_id)
 values(p_empresa,f,p_data->>'email',p_data->>'message_id',p_data->>'part_id',p_data->>'thread_id',p_data->>'filename',p_data->>'sender',p_data->>'subject',nullif(p_data->>'gmail_date','')::timestamptz,p_data->>'kind',p_data->'metadata',array(select jsonb_array_elements_text(coalesce(p_data->'issues','[]'::jsonb))),coalesce((p_data->>'allowed')::boolean,false),nullif(p_data->>'supplier_id','')::uuid,d)
 on conflict(empresa_id,email,message_id,part_id) do update set file_id=excluded.file_id,kind=excluded.kind,metadata=excluded.metadata,issues=excluded.issues,allowed=excluded.allowed,supplier_id=excluded.supplier_id,dossier_id=excluded.dossier_id,updated_at=now()
 returning id into s;
 return s;
end $$;
revoke all on function public.gmail_hub_intake_save(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.gmail_hub_intake_save(uuid,jsonb,uuid) to service_role;
-- Proven sender in the CIPLAN original; other suppliers need reviewed sender/domain registration.
insert into public.gmail_hub_supplier_rules(empresa_id,name,cnpj,senders,active)
select empresa_id,'CIPLAN Cimento Planalto S.A.','00057240000122',array['br_svc_relaysap@ciplan.com.br'],true from public.gmail_hub_config where id=true;
insert into public.gmail_hub_supplier_rules(empresa_id,name,cnpj)
select c.empresa_id,v.name,v.cnpj from public.gmail_hub_config c cross join (values
 ('CSN','60869336000389'),('Nacional/Campeão','07957149000293'),('Votorantim','01637895007498'),('LIZ','33920299000313')) v(name,cnpj) where c.id=true;
insert into public.gmail_hub_recipient_rules(empresa_id,cnpj,label)
select empresa_id,v.cnpj,v.label from public.gmail_hub_config cross join (values
 ('49832961000151','Matriz MG'),('49832961000232','Filial GO')) v(cnpj,label) where id=true;
-- Retain all v1 history. Reprocess original messages into v2 only after approved deployment.
