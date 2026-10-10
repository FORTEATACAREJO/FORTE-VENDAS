# Pedidos, cargas e comunicação

A compra abre um dossiê imediatamente. O espelho conferido pelo usuário precede o envio: WhatsApp, e-mail ou ambos geram registros independentes do mesmo pedido. Abrir `wa.me` ou `mailto` continua disponível como envio manual, com comprovante, e nunca confirma envio automático.

O painel de pedidos de venda fica separado do painel de cargas. Um ajuste de quantidade reduz o pedido, recalcula preço total e frete, registra antes/depois e prepara um aviso sem valores. Não cria saldo pendente. Notas fiscais e cobranças já emitidas bloqueiam o ajuste. A compra também pode ser reduzida antes de enviada/confirmada, após ajustar as vendas vinculadas. Compras já enviadas exigem revisão com o fornecedor.

## Mensagens

`orders-workflow` grava as intenções na fila e solicita processamento em segundo plano. `order-communications` valida sessão, perfil aprovado, permissão e empresa antes de enviar. A intenção é marcada em processamento por comparação de versão antes do contato com o provedor. Tempo esgotado ou resultado desconhecido exige conferência; não há repetição automática de um envio incerto.

As etapas são pedido registrado, ajuste, ordem de carregamento gravada e solicitação de confirmação de entrega. Mensagens comerciais ao cliente não contêm preços, totais ou condições financeiras. Consentimento precisa de referência registrada; cadastros existentes não são considerados autorizados automaticamente.

O recebimento do Sim/Não exige telefone, identificador da mensagem original e payload do botão corretos. A primeira resposta é preservada, com quantidade, pedido, carga, identificador do provedor e horário. O PDF é um registro comercial da resposta; não afirma equivalência automática ao canhoto fiscal. A carga direta aguarda confirmação positiva de todos os pedidos ou comprovante de entrega validado para finalizar. Resposta negativa permanece visível para revisão.

## Ativação externa pendente

Configurar somente nos segredos do servidor do projeto Vendas, sem inserir no código ou enviar no chat:

| Nome | Finalidade |
|---|---|
| `WHATSAPP_TENANT_ID` | Empresa autorizada a usar a conexão |
| `WHATSAPP_ACCESS_TOKEN` | Token Meta com acesso ao número |
| `WHATSAPP_PHONE_ID` | Identificador do número |
| `WHATSAPP_APP_SECRET` | Validação HMAC dos retornos |
| `WHATSAPP_VERIFY_TOKEN` | Verificação inicial do webhook |
| `WHATSAPP_GRAPH_VERSION` | Versão Graph suportada e conferida na ativação |
| `WHATSAPP_TEMPLATE_PEDIDO` | Modelo aprovado: referência e descrição dos itens |
| `WHATSAPP_TEMPLATE_AJUSTE` | Modelo aprovado: referência e quantidade final, texto explícito sobre ajuste |
| `WHATSAPP_TEMPLATE_CARREGAMENTO` | Modelo aprovado: referência e itens |
| `WHATSAPP_TEMPLATE_ENTREGA` | Modelo aprovado: referência, itens e botões Sim/Não |
| `WHATSAPP_TEMPLATE_FORNECEDOR` | Modelo aprovado: cabeçalho documento PDF e referência no corpo |
| `RESEND_API_KEY` | Provedor de e-mail |
| `ORDERS_EMAIL_FROM` | Remetente verificado no provedor de e-mail |

Cada modelo deve ter exatamente dois parâmetros de corpo. O modelo de fornecedor usa a referência em ambos os parâmetros e o PDF contém todos os itens, preços negociados e condições. O modelo de ajuste apresenta a quantidade final e o motivo fixo de adequação ao carregamento. Validar modelos reais antes de ativar a conexão. Não houve disparo real durante os testes.

O callback Vendas é `/functions/v1/order-communications/webhook`. O servidor Render mantém `/webhook` e `/webhooks/whatsapp`, preservando a verificação anterior e encaminhando o corpo original assinado ao Fiscal. A inclusão do Vendas nesse callback compartilhado depende de `WHATSAPP_VENDAS_WEBHOOK_ENABLED=true` no servidor Render **depois** de configurar e validar os segredos do Vendas. Não substituir o callback Meta por um endpoint que atendesse apenas um dos sistemas.

Credenciais salvas no Fiscal não são copiadas automaticamente para o Vendas. O envio da NF própria continua no fluxo Fiscal existente. A integração Gmail existente permanece; documentos ou retornos sem vínculo inequívoco exigem conferência. Esta mudança não ativa busca agendada no Gmail nem anexa notas por semelhança de produto.

## Relatórios

Espelho do fornecedor, ordem de carregamento, pedidos de venda, dossiê da carga e registro de entrega usam cabeçalho azul, faixa laranja, blocos de identificação, totais aplicáveis e paginação. Relatórios de distribuição ao cliente e confirmação de entrega não mostram valores. O relatório interno de vendas e o espelho do fornecedor mostram valores para conferência.

## Validação

`npm run build` executa regras, domínio, autenticação e compilação. `checks/order-communications.test.mjs` verifica ajuste 300→260, bloqueio fiscal/bancário, espelho obrigatório, envio pelos dois canais, vínculo inequívoco, resposta imutável, assinatura e ausência de valores nas mensagens. `checks/orders-workspace.browser.mjs` verifica os fluxos em 390 e 1440 px.
