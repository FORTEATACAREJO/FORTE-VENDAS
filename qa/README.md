# Testes dos sistemas Forte

Playwright 1.63.0 instalado com versões fixas e package-lock. A execução no GitHub Actions instala Chromium, Firefox e WebKit e gera um relatório HTML com capturas e traces de falhas.

## Executar

```bash
cd qa
npm ci
npx playwright install --with-deps chromium firefox webkit
npm run test:live
npm run report
```

Os perfis são Chrome e Firefox no computador, Chrome com emulação Pixel 7 e WebKit com emulação iPhone 13. A emulação não substitui testes nos celulares físicos ou nos APKs.

## Cobertura

- Oito aplicativos publicados: acesso por CPF, campos de senha, cadastro, recuperação por WhatsApp/e-mail e largura da tela de acesso.
- Central: links dos oito aplicativos e erros de JavaScript.
- Site público: catálogo, marcas e acesso ao orçamento.
- SDK de sessão atualizado: consultas simultâneas, persistência após recarregar e saída explícita, com servidor de autenticação simulado.
- Carga Direta publicada: formulário real de venda e compra, nome fantasia, vendedor, preços, contatos do cadastro, frete por tonelada, forma de pagamento e links de WhatsApp/e-mail. Todas as requisições ao Supabase deste teste são interceptadas e respondidas com dados sintéticos. Nenhum pedido é gravado no banco real e nenhuma mensagem é enviada.

A execução de regressões dos repositórios locais está em `npm run test:regressions`. Ela pressupõe os repositórios irmãos disponíveis e suas dependências instaladas. Os arquivos de log e resultados ficam em `reports/`.

## Limites

Os testes públicos não comprovam login real de todos os usuários, entrega de e-mail/WhatsApp/push, emissão SEFAZ, integração bancária nem operação nos aparelhos físicos. As regras de negócio são verificadas por simulações locais. Três suites antigas de navegador precisam de adaptação à nova tela de acesso e às notificações; suas falhas não são contadas como aprovação.

## Resultado e repetição

Abra GitHub Actions → **Testes dos sistemas Forte** → **Run workflow**. O artefato **testes-sistemas-forte** contém o relatório. Alterações na pasta `qa` disparam uma nova execução. Não há execução periódica configurada.
