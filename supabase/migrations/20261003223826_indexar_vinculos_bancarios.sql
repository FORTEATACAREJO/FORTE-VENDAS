-- Índices com todas as colunas dos vínculos, sem duplicar os índices existentes.
drop index private.fc_banco_conciliacoes_movimento;
drop index private.fc_banco_conciliacoes_movimento2;
create index fc_banco_conciliacoes_movimento on private.fc_banco_conciliacoes(movimento_id,empresa_id);
create index fc_banco_conciliacoes_movimento2 on private.fc_banco_conciliacoes(movimento2_id,empresa_id);
create index fc_banco_movimentos_conta_empresa on private.fc_banco_movimentos(conta_id,empresa_id);
