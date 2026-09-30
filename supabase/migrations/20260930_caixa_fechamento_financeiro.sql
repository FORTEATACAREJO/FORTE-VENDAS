-- Aplicada em produção no Supabase FORTE VENDAS em 30/09/2026
create table if not exists public.fc_caixa_fechamentos (
  id text primary key,
  empresa_id uuid not null references public.fc_empresas(id) on delete cascade,
  data date not null,
  unidade text,
  operador text,
  aberto_em timestamptz,
  fechado_em timestamptz not null,
  status text not null default 'FECHADO',
  total_vendas numeric not null default 0,
  saldo_inicial numeric not null default 0,
  saldo_esperado numeric not null default 0,
  saldo_contado numeric not null default 0,
  diferenca numeric not null default 0,
  snapshot jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists fc_caixa_fechamentos_empresa_data_idx on public.fc_caixa_fechamentos(empresa_id,data desc);
alter table public.fc_caixa_fechamentos enable row level security;
drop policy if exists fc_caixa_fechamentos_select on public.fc_caixa_fechamentos;
create policy fc_caixa_fechamentos_select on public.fc_caixa_fechamentos for select to authenticated
using (empresa_id = (select empresa_id from public.fc_perfis where user_id = auth.uid() limit 1));
drop policy if exists fc_caixa_fechamentos_insert on public.fc_caixa_fechamentos;
create policy fc_caixa_fechamentos_insert on public.fc_caixa_fechamentos for insert to authenticated
with check (empresa_id = (select empresa_id from public.fc_perfis where user_id = auth.uid() limit 1));
drop policy if exists fc_caixa_fechamentos_update on public.fc_caixa_fechamentos;
create policy fc_caixa_fechamentos_update on public.fc_caixa_fechamentos for update to authenticated
using (empresa_id = (select empresa_id from public.fc_perfis where user_id = auth.uid() limit 1))
with check (empresa_id = (select empresa_id from public.fc_perfis where user_id = auth.uid() limit 1));
