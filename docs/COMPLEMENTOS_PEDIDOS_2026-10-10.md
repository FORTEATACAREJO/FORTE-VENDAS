# Complementos dos pedidos ao fornecedor

Adaptado do pacote de integração recebido em 10/10/2026, mantendo o estado por empresa, a numeração no servidor, a gravação por versão e o dossiê único criado com o pedido. Não cria outra tabela de pedidos nem executa o SQL proposto sobre o banco atual.

- Compra padrão, CSN Direto e CSN Fibra usam campos independentes de preço negociado no cadastro do produto; preço ausente impede gravação.
- Motorista e fornecedor têm cópias dos dados da época do pedido. A sincronização de motoristas aprovados do Forte Frete inclui CPF, CNH, RNTRC, proprietário, conjunto e capacidade. Pix não é copiado para o estado compartilhado: é consultado na ponte autenticada somente por MASTER/ADMINISTRADOR ou permissão verDadosPagamentoMotorista.
- Pallets sugeridos pelo cadastro podem ser ajustados com justificativa. Pedido que solicita pallets pode ser salvo; ordem, publicação no Frete e fechamento exigem evidência da autorização do fornecedor, registrada por usuário autorizado. Ajustar a compra invalida a liberação anterior.
- Busca combina texto normalizado (incluindo CPF/placas), status e intervalo. Edição antes do envio preserva ID, número e dossiê, registra motivo e invalida a conferência/envios pendentes. Cancelamento é lógico, mantém o histórico e devolve vendas vinculadas para roteamento; notas, fechamento ou ordem já enviada exigem revisão.
- PDF do fornecedor inclui valores da compra e identidade do motorista, sem Pix nem frete contratado. PDF do motorista inclui frete/Pix somente quando autorizado.
- Ajustes de quantidade preservam preço e peso unitário originais. O pedido do cliente é substituído sem saldo pendente, com mensagem sem valores.

## Publicação

Atualizar orders-workflow e order-communications no projeto Vendas e vendas-frete-bridge no projeto Frete. O código da ponte está versionado em integrations/forte-frete/vendas-frete-bridge/index.ts. O backend preserva a autenticação por sessão válida e perfil ativo/aprovado, apesar de verify_jwt=false.

As credenciais de envio e modelos aprovados precisam estar configurados no Vendas. Os testes não enviam mensagens reais.
