# Testes automáticos e monitoramento

## Instalado

- Playwright já existente, com novos comandos de testes dos pedidos, relatório Itaú e transporte do Sentry.
- Workflow Qualidade Forte Vendas a cada push para main e pull request: Node 24, instalação reproduzível, testes essenciais, regras de caixa/números, build, Chromium e sessão desktop/Android. Evidências guardadas por 14 dias nos artefatos do GitHub.
- npm run build agora executa testes essenciais e regras antes de compilar. Como o Render usa esse comando, uma falha dessas verificações impede a nova publicação e mantém a versão anterior. Os testes de navegador rodam no GitHub; o modo After CI Checks Pass do Render não foi alterado por esta instalação.
- SDK @sentry/react no bootstrap, captura de erros de tela, erros globais e promessas rejeitadas. Release identificada pelo commit no Render/GitHub.
- Sem DSN, não inicia cliente nem envia dados externos. O formulário/login continua funcionando normalmente.

## Ativação Sentry pendente

Criar ou selecionar um projeto React no Sentry e fornecer seu DSN HTTPS. Definir VITE_SENTRY_DSN no serviço static site forte-vendas e reconstruir. O DSN é endereço público de ingestão; não é senha nem token de administração. Nenhuma conta ou contratação externa foi criada nesta instalação. Para mapas de código privados e alertas avançados, será necessária configuração adicional do projeto Sentry.

Eventos enviados são limitados a identificação técnica, versão e stack trace. Removidos: identidade do usuário, contexto da aplicação, formulários, cookies, requisições e breadcrumbs. Mensagens sanitizam CPF, e-mail, senhas, bearer tokens e números longos. Não há gravação de sessão, performance ou logs habilitados.

## Validação

73 testes essenciais, 99 verificações de contas/caixa/estoque, regressões de capacidade/cadastros e carga direta, build, testes Chromium de pedidos e relatório em 390/1440 pixels, SDK real com endpoint simulado e sessão SDK em Chrome desktop/Android. Todos passaram localmente. Corrigida uma referência obsoleta no teste numérico: primeiro cadastro delega ao access-standard e sua validação agora é consultada diretamente. Nenhum usuário real foi cadastrado ou nenhuma cobrança emitida.
