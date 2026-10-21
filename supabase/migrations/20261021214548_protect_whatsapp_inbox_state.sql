begin;
create table public.whatsapp_inbox_state (
 empresa_id uuid primary key,
 estado jsonb not null default '{}'::jsonb check(jsonb_typeof(estado)='object'),
 versao bigint not null default 0 check(versao>=0),
 updated_at timestamptz not null default now()
);
alter table public.whatsapp_inbox_state enable row level security;
revoke all on public.whatsapp_inbox_state from public,anon,authenticated;
grant select,insert,update on public.whatsapp_inbox_state to service_role;
comment on table public.whatsapp_inbox_state is 'Inbox WhatsApp isolada da versão comercial. Acesso somente pela Edge Function que confere sessão, módulo e empresa; nenhuma política pública é intencional.';
commit;
