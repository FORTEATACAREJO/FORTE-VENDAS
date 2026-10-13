# Gmail central dos sistemas Forte

Conta única: fiscalforteatacarejo@gmail.com. A conexão antiga é temporária no navegador; os 422 registros existentes foram preservados.

## Implantado nesta etapa

- Edge Function gmail-central com OAuth de servidor, state descartável, PKCE e refresh token no Vault.
- Caixa central compartilhada por Vendas, Fiscal e Frete; consulta administrativa autenticada. Fiscal/Frete exigem master pelo autorizador existente.
- Fila persistente de mensagens/anexos, SHA-256 para deduplicação, cursor de histórico, recuperação do histórico expirado e exclusão de processamento concorrente.
- Endpoint de notificações Pub/Sub autenticado com JWT Google, audiência e conta de serviço exatas. Evento gravado antes de confirmar recebimento.
- Renovação diária do watch, acionada pelo processamento; cron a cada 5 minutos recupera mensagens e notificações perdidas, sem ler novamente os e-mails já processados.
- Documentos privados, downloads com URL temporária e destinos sugeridos; revisão pendente. Não efetua lançamentos de estoque, obrigações fiscais, pagamentos ou conciliações automáticas.
- Pedidos ao fornecedor por Gmail com PDF e Reply-To central; registro separado de resultado, sem reenvio automático de tentativa incerta. Respostas na mesma thread têm sugestão de vínculo.

## Dependências ainda pendentes

1. No cliente OAuth existente do Google Cloud, adicionar o URI de redirecionamento:
   https://gtwecfyffjszghnvtlzr.supabase.co/functions/v1/gmail-central/callback
2. No Vendas > Integrações > Gmail Central, salvar a chave secreta Google no campo protegido e autorizar a conta central novamente, para obter acesso offline e gmail.send.
3. Criar tópico Pub/Sub no mesmo projeto Google do cliente OAuth; conceder roles/pubsub.publisher a gmail-api-push@system.gserviceaccount.com.
4. Criar assinatura push autenticada para https://gtwecfyffjszghnvtlzr.supabase.co/functions/v1/gmail-central/push, com audiência igual à URL e conta de serviço indicada no painel. Conceder ao agente de serviço Pub/Sub a capacidade de emitir o token dessa conta conforme a documentação Google.
5. Informar tópico e conta de serviço no painel, sincronizar e confirmar watch ativo. Testar um e-mail real com anexos e o envio de um pedido autorizado. Nenhuma mensagem de teste foi enviada nesta etapa.

OAuth externo em modo Testing pode produzir refresh tokens com expiração curta; verificar a publicação e os escopos do consentimento Google antes da operação contínua.

## Limites e próximos controles

A fila central não representa estoque nem lançamento fiscal. Documentos novos ficam em conferência e precisam ser vinculados/lançados pelos fluxos dos módulos. Anexos maiores que 20 MB e erros após oito tentativas ficam retidos para intervenção. Backfill inicial: últimos 30 dias. A integração ao dossiê operacional com um comando único ainda precisa de validação após a autorização real; o painel compartilhado disponibiliza os arquivos sem classificá-los como conciliados.

## Validação

Sete testes de domínio: XML prioritário, CNPJ preservado, referências conflitantes, anexos aninhados, notificações repetidas, destinos de frete e cabeçalhos MIME.
SQL real com rollback: clientes sem acesso a credenciais/documentos; segunda execução concorrente bloqueada. Advisors sem achados relacionados às tabelas Gmail após política explícita de negação.
Serviço real: solicitação sem login rejeitada (401); worker autenticado retorna autorização de servidor pendente (200), sem importar nem enviar dados.
Compilações Vendas, Fiscal e Frete passaram. Autorização e notificações reais ainda não foram testadas por falta das dependências Google.
