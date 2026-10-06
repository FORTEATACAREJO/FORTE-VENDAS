# Verificação dos sistemas Forte — 06/10/2026

**Resultado final: 52 de 52 testes de navegador aprovados**, após corrigir erros de sessão no Firefox e o layout da Central com texto ampliado. A execução terminou em 06/10/2026, às 08:15 no horário de Brasília.

[Execução aprovada no GitHub Actions](https://github.com/FORTEATACAREJO/FORTE-VENDAS/actions/runs/37454521293) · [Relatório HTML e capturas](https://github.com/FORTEATACAREJO/FORTE-VENDAS/actions/runs/37454521293/artifacts/11408922479)

Commit dos testes: `d663e97959c2a7ecef08337da72fa0c02ed0fbef`. Correção final da Central: `0d45cae530b5641ebb92ddcdf6805d440974e245`. Execução sem repetição automática de casos (retries: 0).

Playwright 1.63.0 foi instalado no projeto e o workflow **Testes dos sistemas Forte** foi publicado no GitHub Actions. Os navegadores são instalados automaticamente em cada execução. Relatórios HTML, capturas e traces ficam no artefato da execução por 14 dias.

## Cobertura dos testes de navegador

| Grupo | Casos | Ambiente |
|---|---:|---|
| Acesso, cadastro e recuperação dos oito aplicativos | 32 | Sistemas publicados; sem enviar cadastro ou recuperação |
| Central: destinos dos aplicativos | 4 | Central publicada |
| Site: catálogo, marcas e orçamento | 4 | Site publicado |
| Sessão: concorrência, persistência e saída | 4 | SDK real, autenticação simulada |
| Carga Direta: venda, compra, cadastros e contatos | 4 | Interface publicada; Supabase completamente simulado |
| Central: largura 320–1440 px e fonte 16/32 px | 4 | Central publicada |
| **Total** | **52** | Quatro perfis de navegador |

Os perfis são Chromium no computador, Firefox no computador, Chromium com emulação Android e WebKit com emulação iPhone. Não representam testes em celulares físicos ou APKs.

## Correções publicadas durante a verificação

- Atualização do SDK Supabase para 2.116.0 nos clientes antigos de Financeiro, Frete, Pátio e administração do site, e nos oito contadores de notificações. A versão anterior produzia erros de bloqueio de sessão no Firefox.
- Ajuste da Central para controles que quebram linha em telas pequenas, texto ampliado e limite de largura do atalho de acessibilidade e quebra do título com fonte ampliada.
- Correções dos testes: assinatura sintética em base64url e seleção de campos cujos rótulos incluem opções. Não foram removidas verificações de erro ou relaxados os limites de largura.

Referência técnica da atualização de autenticação: [Supabase — coordenação de sessão](https://github.com/supabase/supabase-js/blob/master/packages/core/auth-js/migrations/lockless-coordination.md).

## Regressões locais

Foram executadas 25 suites existentes: **22 aprovadas**, com **3 suites antigas de navegador pendentes de adaptação** à tela de acesso e às notificações atuais. Elas não foram contadas como aprovação. Os cenários correspondentes de acesso, navegação e administração pública também são cobertos pelos novos testes publicados.

| Suite | Resultado |
|---|---|
| Frete: autenticação | Aprovada |
| Frete: interface | Aprovada |
| Frete: frete e números | Aprovada |
| Frete: exportação | Aprovada |
| Aprovação: escopo e admin | Aprovada |
| Vendas: contas, caixa e pallets | Aprovada |
| Vendas: conflitos na nuvem | Aprovada |
| Acesso: validação no servidor | Aprovada |
| Acesso: CPF e login | Aprovada |
| Acesso: perfis | Aprovada |
| Acesso: aprovação por perfil | Aprovada |
| Carga Direta: vendas e compras | Aprovada |
| Nome fantasia | Aprovada |
| Carga Direta: cadastro e contatos | Aprovada |
| Financeiro: integração | Aprovada |
| Financeiro: baixas | Aprovada |
| Financeiro: extratos | Aprovada |
| Fiscal: valores e documentos | Aprovada |
| Fiscal: certificados | Aprovada |
| Fiscal: servidor | Aprovada |
| Sessão: oito sistemas | Pendente: teste antigo |
| Pátio: conferência | Aprovada |
| Financeiro: conciliação em navegador | Aprovada |
| Central: navegação | Pendente: teste antigo |
| Site: administração | Pendente: teste antigo |

Além das 22 suites, passaram quatro verificações adicionais: formulários de Carga Direta com preenchimento do cadastro, controles de notificações, worker de notificações e elegibilidade/segurança do backend de notificações. Financeiro foi recompilado e suas três suites de integração, contas e extratos passaram novamente após atualizar o SDK. Os quatro testes de regressão do Frete também passaram novamente.

## Limites da conclusão

Os testes não comprovam login real de cada funcionário, entrega de mensagens e push, emissão fiscal/SEFAZ, operações bancárias nem funcionamento em aparelhos físicos. Não houve criação de pedidos reais, emissão de documentos, pagamentos ou envio de mensagens durante as simulações.

Nenhum resultado autoriza afirmar que todas as funções de produção foram verificadas. A cobertura aprovada corresponde aos grupos descritos acima.
