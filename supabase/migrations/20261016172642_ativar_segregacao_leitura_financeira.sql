begin;
-- Final rollout step: apply only after the filtered client RPCs and dependent Edge Functions are available.
create policy fc_state_financeiro_master_read on public.fc_app_state as restrictive for select to authenticated using(private.can_access_financeiro(empresa_id));
commit;
