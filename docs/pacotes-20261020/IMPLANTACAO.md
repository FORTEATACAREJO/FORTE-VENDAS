# Implantação coordenada — rascunho para homologação

Não houve aplicação destas migrações nem publicação destas funções em produção.

## Ordem e dependências

1. Revisar os cinco PRs e resolver os critérios abertos em RASTREABILIDADE.md. Usar cópia isolada do banco e credenciais de homologação.
2. No Frete: aplicar `20261020231805_freight_order_quantity_and_catalog.sql`, depois `20261020232538_independent_driver_vehicle_reviews.sql`. Verificar duplicidade de placas normalizadas e viagens em andamento antes. O preflight somente leitura encontrou 2 veículos, 2 vínculos, 0 viagens ativas e 0 duplicidades; repetir imediatamente antes de implantar.
3. Publicar `vehicle-registry` no projeto Frete e `frete-catalog` no projeto Vendas. O catálogo valida JWT, perfil ativo e autorização administrativa do Frete antes da projeção mínima do cadastro comercial. Sem essas funções, os novos formulários não estarão operacionais.
4. No Vendas: aplicar `20261020234354_pallet_invoice_queue_allocation.sql`. Publicar `pallet-workflow` e atualizar `gmail-central`; preservar a conexão Gmail existente. O preflight encontrou zero lançamentos no ledger `fc_pallet_movimentos`; saldos legados do estado são mantidos separadamente e precisam de conciliação.
5. Atualizar `orders-workflow` e `vendas-frete-bridge` com suas dependências locais. O valor de frete permanece na administração; ordem e painel do motorista continuam sem esse valor.
6. Publicar as interfaces somente depois dos endpoints/migrações e da aprovação dos veículos necessários. O cache do Frete foi versionado para incluir histórico, catálogo e cadastro de veículo.
7. Fiscal e Venda Externa recebem somente navegação. Financeiro continua na entrada ativa que encaminha ao módulo financeiro do Vendas, preservando o contexto permitido.

## Conferência de liberação

- Repetir permissões revogadas, links diretos, cadastro sem veículo, placa existente, aprovação separada e vínculo explícito.
- No pedido de 800 sacos de 50kg para conjunto de 38t, confirmar alerta do pedido e embarcar no máximo 760. Manter as 800 unidades originais no registro.
- Conferir NF com distribuição 10/12/8, repetição após perda da resposta e falha depois do segundo cliente: somente uma integração completa pode existir.
- Validar retorno do botão físico Android nos cinco sistemas, sem encerrar sessão ou perder rascunho sem confirmação.
- Revisar manualmente PDFs de pedido e ordem e o encaminhamento no WhatsApp Business de homologação. Testes locais não afirmam entrega nem aprovação de templates pela Meta.

## Retorno seguro

Reverter as interfaces e funções ao commit anterior e suspender o novo caminho de escrita. Preservar tabelas, registros e auditoria; não executar DROP ou apagar movimentos financeiros/estoque. Havendo dados novos, conciliar e estornar por lançamento compensatório autorizado. A aprovação destes PRs não substitui a homologação funcional nem autoriza exclusão de cadastros.
