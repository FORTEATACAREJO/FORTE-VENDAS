-- FORTE VENDAS V6.8.5 — usuários MASTER definidos por CPF
-- Idempotente: pode ser executada novamente sem duplicar cadastros.
begin;

-- Promove perfis já vinculados no Supabase Auth.
update public.fc_perfis
set perfil = 'MASTER',
    permissoes = coalesce(permissoes, '{}'::jsonb) || '{"acesso":"TOTAL","master":true}'::jsonb,
    ativo = true,
    updated_at = now()
where public.fc_normalizar_documento(coalesce(cpf, documento)) in (
  '03080843657', '88346463634', '12593386657', '12593385685'
);

-- Mantém os quatro CPFs pré-autorizados até a vinculação com o usuário Auth.
insert into public.fc_usuarios_pendentes
  (empresa_id,nome,perfil,regras,cpf,cargo,status)
values
  ('49832961-0000-4000-8000-000000000001','ELAINE LEÃO SIMÕES REIS','MASTER','{"acesso":"TOTAL","master":true}'::jsonb,'03080843657','USUÁRIO MASTER','CADASTRO_PENDENTE'),
  ('49832961-0000-4000-8000-000000000001','RIVANILDO DOS REIS PINTO','MASTER','{"acesso":"TOTAL","master":true}'::jsonb,'88346463634','USUÁRIO MASTER','CADASTRO_PENDENTE'),
  ('49832961-0000-4000-8000-000000000001','PEDRO RENATO SIMÕES PINTO','MASTER','{"acesso":"TOTAL","master":true}'::jsonb,'12593386657','USUÁRIO MASTER','CADASTRO_PENDENTE'),
  ('49832961-0000-4000-8000-000000000001','HEITOR LEÃO SIMÕES REIS PINTO','MASTER','{"acesso":"TOTAL","master":true}'::jsonb,'12593385685','USUÁRIO MASTER','PREENCHIMENTO_OBRIGATORIO')
on conflict (empresa_id,nome) do update set
  perfil = 'MASTER',
  regras = excluded.regras,
  cpf = excluded.cpf,
  cargo = excluded.cargo,
  status = case
    when public.fc_usuarios_pendentes.status = 'ATIVO' then 'ATIVO'
    else excluded.status
  end,
  updated_at = now();

commit;

select nome, cpf, perfil, status
from public.fc_usuarios_pendentes
where public.fc_normalizar_documento(cpf) in (
  '03080843657', '88346463634', '12593386657', '12593385685'
)
order by nome;
