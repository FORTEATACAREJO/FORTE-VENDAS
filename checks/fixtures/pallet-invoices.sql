create role anon;create role authenticated;create role service_role bypassrls;create schema private;
 create table fc_empresas(id uuid primary key);create table fc_perfis(user_id uuid primary key,empresa_id uuid,ativo boolean,status_aprovacao text,trocar_senha boolean,perfil text,permissoes jsonb);
 create table fc_app_state(empresa_id uuid primary key,estado jsonb);
 create function access_module_context(uuid,text) returns jsonb language sql as $$select jsonb_build_object('allowed',ativo and status_aprovacao='APROVADO' and not trocar_senha,'role',perfil) from public.fc_perfis where user_id=$1$$;
 create table gmail_hub_supplier_rules(id uuid primary key,empresa_id uuid,active boolean);
 create table gmail_hub_sources(id uuid primary key,empresa_id uuid,file_id uuid,supplier_id uuid,filename text,subject text,metadata jsonb,allowed boolean,issues text[] default '{}',updated_at timestamptz default now());
 create table fc_pallet_movimentos(id uuid primary key default gen_random_uuid(),empresa_id uuid not null,tipo text not null,origem text,destino text,quantidade numeric not null check(quantidade>0),documento_referencia text,observacao text,criado_por uuid,created_at timestamptz default now());
 alter table fc_pallet_movimentos enable row level security;
