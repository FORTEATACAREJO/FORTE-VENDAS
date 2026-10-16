# Implantação coordenada — Forte Frete e Financeiro interno

Autorização de continuidade recebida em 16/10/2026. Os candidatos permanecem isolados enquanto são validados. Não tratar testes com dados fictícios como comprovação de operação bancária, emissão fiscal ou entrega de WhatsApp.

## Candidato atual

- Forte Frete: visual aprovado aplicado à aplicação, cabeçalho compacto, painel acionável, filtro de cargas, detalhe da oferta, perfil mínimo e consulta do comprovante.
- Aceite: transação, fila idempotente, oferta privada e recusa sem publicação automática.
- Vendas: solicitações recebidas do Frete, vínculo a ordem revisada e retorno conferido do pedido. São verificados motorista, conjunto, produto, quantidade, peso e rota.
- Comprovante: validação financeira exclusivamente Master no Vendas; a ponte encaminha o documento autorizado ao motorista correto, com o bucket correto. O Frete não registra pagamentos pelo navegador.
- Financeiro: RPC de leitura filtrada, preservação de campos financeiros nas gravações operacionais, histórico de caixa imutável e proteção do cache compartilhado do navegador.

## Ordem de liberação

1. Conferir backup restaurável e lista de migrações já aplicadas. Não reaplicar migrações existentes.
2. Homologar as migrações dos dois projetos em base separada com perfis e dados fictícios. Confirmar os nomes de cidade/UF das rotas e a padronização dos produtos antes de vincular pedidos reais.
3. Disponibilizar as RPCs e as novas funções `sync-frete-acceptances`, `orders-workflow` e `vendas-frete-bridge`. Nunca instalar chaves de serviço no frontend. As duas pontas reutilizam as identidades já aprovadas; não há nova senha de integração compartilhada.
4. Publicar os clientes coordenadamente em janela controlada. As mudanças do Frete incluem políticas de projeção: cliente antigo deve atualizar antes de continuar.
5. No Vendas, ativar por último `20261016172642_ativar_segregacao_leitura_financeira.sql`. A nova gravação usa `fc_salvar_estado_projetado`; o endpoint legado não foi substituído durante a preparação. Depois da ativação, consultas brutas de perfis sem Master ficam bloqueadas.
6. Conferir Master/Admin/motorista A/motorista B, usuário bloqueado, pedido com inconsistência e repetição de sincronização. Não executar emissão fiscal, boleto ou pagamento real como teste.
7. Liberar os redirecionamentos legados e a Central de cinco aplicativos depois da conferência dos acessos no Vendas.

## Retomada de falhas

A fila mantém os eventos, registra tentativas e usa espera de 30 segundos para retomar sem monopolizar os mesmos registros. O recebimento no Vendas é único por evento e carga. Se o retorno falhar, o vínculo oficial permanece no Vendas e a sincronização pode ser repetida. Outro número de pedido não sobrescreve o já confirmado.

Não desfazer a proteção de leitura para contornar um erro de cliente antigo. Atualizar o cliente/RPC e preservar a linha canônica; em caso de divergência de versão, recarregar e conferir antes de gravar. Nenhuma migração candidata remove saldos, cadastros ou registros financeiros.

## Homologações separadas

Ainda exigem evidência no ambiente conectado: uso autenticado com as contas reais autorizadas, entrega externa WhatsApp/e-mail, importação Fiscal e A1, qualificação Itaú e publicação nas lojas. Certificados, token bancário e chave de assinatura Android não foram substituídos. Não anunciar essas etapas como concluídas com base nos testes de contrato.
