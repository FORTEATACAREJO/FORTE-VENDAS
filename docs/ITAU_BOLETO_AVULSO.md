# Boleto avulso — carteira 109

Em Cobranças Itaú, NOVO BOLETO AVULSO abre um formulário de cliente cadastrado, motivo obrigatório, referência opcional, valor, vencimento, juros e multa. A preparação ocorre no servidor, com aprovação Financeiro e permissão de emissão, e grava atomicamente um título em boletosClientes, um contasReceber ABERTO e um evento auditável. Não cria venda, nota, estoque, pagamento ou movimento de caixa.

A solicitação mantém o mesmo UUID na repetição. Repetir o UUID com dados divergentes falha. Validação bancária e registro são etapas separadas; o botão de registro exige validação do título atual. O bloqueio ITAU_EMISSION_ENABLED continua vigente e não é alterado pela implementação. Reservas persistentes impedem um segundo registro após resultado incerto. Avulsos têm venda_id nulo no ledger; a unicidade dos boletos das vendas existentes foi preservada.

O avulso usa espécie 99 (diversos), não presume duplicata de venda. Referência de códigos Itaú: https://download.itau.com.br/bankline/cobranca_cnab240.pdf. A aceitação da espécie pela conta na API ainda exige validação autenticada no banco; os testes locais não comprovam homologação bancária.

Implantação: aplicar a migração itau_standalone_billing antes de publicar API Itaú e frontend Vendas. Não habilitar a emissão real nem alterar a sequência neste procedimento. O PDF do boleto registrado e os envios continuam com as pendências já apontadas na auditoria Itaú; este PR não os implementa nem declara envio automático.

Validação local: npm run build — 243 testes principais aprovados, 105 simulações financeiras aprovadas, regressões de regras e build aprovados. Os testes novos incluem banco PGlite, isolamento entre empresas, permissão financeira, idempotência de preparação/reserva e formulário React real com resposta incerta e duplo clique. Nenhuma chamada bancária real foi feita.
