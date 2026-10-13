create table public.access_invite_dispatches(source_project text not null,invite_id uuid not null,status text not null check(status in ('PROCESSING','FAILED','ACCEPTED_BY_META','UNCERTAIN')),meta_message_id text,updated_at timestamptz not null default now(),primary key(source_project,invite_id));
alter table public.access_invite_dispatches enable row level security;
revoke all on public.access_invite_dispatches from anon,authenticated;
create policy access_invite_dispatches_no_client on public.access_invite_dispatches for all to anon,authenticated using(false) with check(false);
