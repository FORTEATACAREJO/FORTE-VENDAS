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

Na continuação da auditoria, as **25 suites existentes foram aprovadas**. Os três testes antigos foram adaptados aos módulos de notificações, à tela atual de acesso e ao nome atual do cache. Nenhuma verificação de autorização foi removida. A execução local usou Playwright 1.63.0 com Chromium Headless Shell 134 (o download da versão atual foi incompatível com este ambiente); os 52 casos anteriores foram executados no CI com os navegadores do Playwright 1.63.0.

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
| Sessão: oito sistemas | Aprovada |
| Pátio: conferência | Aprovada |
| Financeiro: conciliação em navegador | Aprovada |
| Central: navegação | Aprovada |
| Site: administração | Aprovada |

Além das 25 suites, passaram quatro verificações adicionais: formulários de Carga Direta com preenchimento do cadastro, controles de notificações, worker de notificações e elegibilidade/segurança do backend de notificações. Financeiro foi recompilado e suas três suites de integração, contas e extratos passaram novamente após atualizar o SDK. Os quatro testes de regressão do Frete também passaram novamente.

## Continuação: testes antes pendentes

- Sessão dos oito sistemas: **9/9 casos**, incluindo CPF normalizado, erro de login, criação de senha, restauração, saída e timeout sem apagar sessão. Os módulos reais de acesso e notificações são servidos juntos; autenticação simulada.
- Central: **21/21 casos**, incluindo cartões, instalação, texto ampliado, cache, funcionamento sem internet e preservação de caches de outros aplicativos. As requisições externas são limitadas às páginas conhecidas dos contadores de notificações.
- Administração do site: **8/8 casos**, incluindo acesso MASTER, bloqueio de perfis comuns/inativos/pendentes, recuperação por contato, troca de senha preservando sessão, saída e validações do backend. Autenticação e envio de mensagens são simulados.

## Verificação de produção somente para leitura

As oito últimas implantações no Render estavam com status `live`. Nos três projetos Supabase, `access-standard` v8 e `forte-notifications` v4 estavam ativos; `mobile-carga-direta` v7 estava ativo no projeto compartilhado. As tabelas `fc_app_state`, `fc_perfis` e `access_requests` tinham RLS habilitado. Estes resultados confirmam implantação e configuração, sem comprovar entrega de mensagens ou acesso por usuário.

O banco compartilhado contém **1 estado de empresa, 68 clientes, 6 fornecedores e 43 produtos**. Dos clientes, **63 possuem nome fantasia**. Nos campos usados pelo pedido, **nenhum cliente ou fornecedor possui e-mail ou WhatsApp/telefone preenchido**; nenhum fornecedor possui nome fantasia. Os contatos precisam ser preenchidos no cadastro para aparecerem automaticamente nos pedidos. Não foram inventados ou alterados dados de clientes e fornecedores. As consultas retornaram somente totais e nomes de campos, sem divulgar contatos pessoais.

## Limites da conclusão

Os testes não comprovam login real de cada funcionário, entrega de mensagens e push, emissão fiscal/SEFAZ, operações bancárias nem funcionamento em aparelhos físicos. Não houve criação de pedidos reais, emissão de documentos, pagamentos ou envio de mensagens durante as simulações.

Nenhum resultado autoriza afirmar que todas as funções de produção foram verificadas. A cobertura aprovada corresponde aos grupos descritos acima.
