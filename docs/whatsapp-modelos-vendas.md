# Modelos de WhatsApp — Forte Vendas

Status em 11/10/2026: rascunhos preparados; não enviados à Meta e não aprovados.
Estes modelos pertencem ao fluxo comercial do Vendas. O modelo de confirmação de NF do Fiscal não os substitui.

## Regras comuns

Idioma: Português (Brasil), `pt_BR`. Categoria proposta: Utilidade, sujeita à análise da Meta.
Todos têm exatamente dois parâmetros no corpo, conforme o envio atual em `order-communications/provider.mjs`.
Os modelos de cliente não incluem preço, total nem condições financeiras.
Exemplos fictícios para análise: referência `VEN-EXEMPLO-001`; itens `260 sacos de Cimento CP2`.
O sistema envia a quantidade seguida do nome cadastrado do produto. Conferir que esse nome identifica a unidade do item antes da ativação.

| Evento | Nome proposto | Configuração após aprovação |
|---|---|---|
| Pedido registrado | `forte_vendas_pedido_v1` | `WHATSAPP_TEMPLATE_PEDIDO` |
| Quantidade ajustada | `forte_vendas_ajuste_v1` | `WHATSAPP_TEMPLATE_AJUSTE` |
| Carregamento | `forte_vendas_carregamento_v1` | `WHATSAPP_TEMPLATE_CARREGAMENTO` |
| Confirmação de entrega | `forte_vendas_entrega_v1` | `WHATSAPP_TEMPLATE_ENTREGA` |
| Pedido ao fornecedor | `forte_vendas_fornecedor_v1` | `WHATSAPP_TEMPLATE_FORNECEDOR` |

## Pedido registrado

Nome: `forte_vendas_pedido_v1`. Sem cabeçalho, rodapé ou botões.

> FORTE ATACAREJO
>
> Seu pedido {{1}} foi registrado com sucesso.
> Produtos e quantidades: {{2}}.

Parâmetros: referência do pedido; descrição dos itens e quantidades.

## Quantidade ajustada

Nome: `forte_vendas_ajuste_v1`. Sem cabeçalho, rodapé ou botões.

> FORTE ATACAREJO
>
> O pedido {{1}} foi ajustado para adequação ao carregamento.
> Produtos e quantidades finais: {{2}}.

Parâmetros: referência do pedido; descrição dos itens com a quantidade final.
O envio atual fornece a quantidade final, sem parâmetro para a quantidade anterior ou motivo variável.

## Carregamento

Nome: `forte_vendas_carregamento_v1`. Sem cabeçalho, rodapé ou botões.

> FORTE ATACAREJO
>
> O pedido {{1}} está em carregamento.
> Produtos e quantidades: {{2}}.

Parâmetros: referência do pedido; descrição dos itens e quantidades.

## Confirmação de entrega

Nome: `forte_vendas_entrega_v1`. Sem cabeçalho ou rodapé.
Dois botões de resposta rápida, nesta ordem: `Sim, recebi`; `Não recebi`.

> FORTE ATACAREJO
>
> Você confirma o recebimento do pedido {{1}}?
> Produtos e quantidades: {{2}}.
> Responda usando um dos botões abaixo.

Parâmetros: referência do pedido; descrição dos itens e quantidades.
O servidor gera os payloads de resposta por pedido, terminados em `:SIM` e `:NAO`.
Não cadastrar um identificador fixo como payload de todos os pedidos.

## Pedido ao fornecedor

Nome: `forte_vendas_fornecedor_v1`. Cabeçalho: documento PDF. Sem rodapé ou botões.

> FORTE ATACAREJO
>
> Encaminhamos o pedido de compra {{1}} no PDF anexo.
> Ao responder, informe o número do pedido registrado pelo fornecedor e a referência {{2}}.

Ambos os parâmetros recebem a mesma referência interna, por exemplo `PC-EXEMPLO-001`.
O PDF contém os itens, preços de compra negociados, condições e contato da Forte.
Para a análise da Meta, anexar um PDF de exemplo com dados fictícios.
Respostas do fornecedor somente são vinculadas automaticamente quando respondem à mensagem original enviada pelo sistema e vêm do telefone correspondente.

## Sequência para concluir a ativação

1. Cadastrar no servidor Vendas o token de acesso, o segredo do aplicativo e o token de verificação vigente no Render. Não guardar valores neste arquivo, no repositório ou no chat.
2. Submeter estes cinco modelos na conta WhatsApp Business de produção da Forte; aguardar o resultado da análise.
3. Conferir na Meta o nome, idioma, estado, categoria e componentes de cada modelo. Cadastrar os nomes nas variáveis acima somente após aprovação.
4. Validar a assinatura e o recebimento no endpoint Vendas antes de ativar `WHATSAPP_VENDAS_WEBHOOK_ENABLED=true` no Render. Preservar o encaminhamento ao Fiscal.
5. Fazer teste controlado de envio e resposta com destinatário autorizado, mediante instrução específica para esse envio. Não processar a fila de clientes como teste de configuração.

## Referências de estrutura

- Código de envio: `supabase/functions/order-communications/provider.mjs`.
- Fluxo e consentimento: `docs/pedidos-cargas-whatsapp.md`.
- Exemplos publicados pela Meta: [documento](https://www.postman.com/meta/whatsapp-business-platform/request/ep5w4rc/create-template-w-document-header-text-body-a-phone-number-button-and-a-url-button) e [respostas rápidas](https://www.postman.com/meta/whatsapp-business-platform/request/uvx80vi/create-template-w-text-header-text-body-text-footer-and-2-quick-reply-buttons).
