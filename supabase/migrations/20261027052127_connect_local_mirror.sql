-- Independent immutable mirror: no triggers into fiscal, orders, stock or finance.
create table public.connect_mirror_devices (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,owner_id uuid not null references auth.users(id),
 mode text not null check(mode in ('FISCAL_XML','VENDAS')),name text not null check(length(name) between 1 and 100),
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default now(),expires_at timestamptz not null default(now()+interval '90 days'),revoked_at timestamptz,last_seen_at timestamptz
);
create table public.connect_mirror_records (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,device_id uuid not null references public.connect_mirror_devices(id),
 mode text not null check(mode in ('FISCAL_XML','VENDAS')),source_id text not null check(length(source_id)<=500),entity_id text not null check(length(entity_id)<=500),
 kind text not null check(kind in ('NFE','CANCELAMENTO','CCE','VENDA')),occurred_at timestamptz not null,
 content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),payload jsonb not null check(octet_length(payload::text)<=1000000),
 received_at timestamptz not null default now(),unique(tenant_id,mode,source_id,content_hash)
);
create index connect_records_tenant_received on public.connect_mirror_records(tenant_id,received_at desc,id);
create index connect_records_entity on public.connect_mirror_records(tenant_id,entity_id,occurred_at desc);
create index connect_devices_owner on public.connect_mirror_devices(owner_id);
create index connect_records_device on public.connect_mirror_records(device_id);
alter table public.connect_mirror_devices enable row level security;
alter table public.connect_mirror_records enable row level security;
revoke all on public.connect_mirror_devices,public.connect_mirror_records from public,anon,authenticated,service_role;
grant select,insert,update on public.connect_mirror_devices to service_role;
grant select,insert on public.connect_mirror_records to service_role;
-- Service-only access through a function validating Master JWT or revocable device token.
