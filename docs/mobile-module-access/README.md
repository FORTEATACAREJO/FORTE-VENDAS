# Cadastro mobile e aprovação por módulo

Implementação preparada para revisão; nenhuma migração ou função deste conjunto foi aplicada em produção.

## Comportamento

Cadastro público sem convite, botão Cadastrar e formulário contínuo com rolagem. CPF, nome, WhatsApp, nascimento, e-mail opcional, senha numérica de seis ou mais dígitos e observação. O candidato não escolhe perfil. Rascunhos ficam no servidor, vinculados ao usuário e módulo, sem senha; controle de revisão impede sobrescrita de outra tela. A administração pode solicitar correção e analisar somente o cadastro completo.

Aprovar, recusar, suspender ou revogar altera o módulo correspondente. Perfis são atribuídos por módulo; aprovação comercial não concede Financeiro. Regras de empresa e, no Fiscal, de todos os estabelecimentos do usuário são verificadas no servidor. A identidade compartilhada permanece ativa quando outro módulo é revogado. Sessões antigas perdem autorização nas APIs/RLS; a interface acompanha a situação na próxima consulta. Acesso legado é preservado sem criar concessões a novos usuários.

O Financeiro continua no Forte Vendas (`?app=financeiro`), com operação somente Master autorizado no Financeiro. O endereço antigo mantém o redirecionamento. A leitura direta do JSON financeiro fica restrita ao Master financeiro; usuários comerciais continuam usando a projeção existente.

## Validação executada

- 164 testes existentes/atualizados do Vendas passaram.
- 105 cenários de regras financeiras passaram, além das verificações numéricas e de carga direta.
- 11 testes SQL novos passaram usando PostgreSQL PGlite e as migrações reais em esquema de teste. Incluem rascunho, concorrência, aprovação incompleta, isolamento de módulos e empresas, rejeição, correção, revogação, RLS financeiro, legado e estabelecimentos fiscais.
- 16 cenários de navegador passaram: Vendas, Financeiro, Venda Externa e Fiscal em 320, 360, 390 e 820 px. Incluem cadastro, recuperação, salvar/retomar, ausência de seleção de perfil, pendência, liberação e bloqueio da interface. APIs simuladas, sem contas ou mensagens reais.
- Builds dos quatro repositórios passaram. Parsing TypeScript das funções de acesso validado.
- Frete já consta na PR20, com cadastro único e revisão documental próprios; este conjunto não o substitui.

## Aplicação coordenada futura

1. Revisar as PRs e obter autorização para publicação.
2. No banco compartilhado Vendas/Financeiro/Venda Externa, aplicar somente a migração `20261018234959_mobile_module_access_drafts.sql` do Vendas.
3. No projeto Fiscal, aplicar somente `20261018235004_mobile_module_drafts_scope.sql`.
4. Os arquivos SQL `mobile-module-*.sql` e `mobile-legacy-review.sql` são fontes de referência incluídas nas migrações; não executá-los separadamente.
5. Publicar as funções alteradas dos respectivos projetos junto com as interfaces. O bridge Vendas→Frete tem fonte em `integrations/forte-frete/vendas-frete-bridge/index.ts` no Vendas e requer atualização coordenada no projeto Frete. Publicar o servidor Vendas (Itaú) e o servidor Fiscal com suas verificações de módulo.
6. Publicar as interfaces e conferir cadastro, aprovação e revogação em ambiente de homologação com contas fictícias e módulos separados. Publicar Frete conforme PR20 e sua documentação.

Não foram enviados convites, e-mails, WhatsApp, boletos nem ordens reais. A verificação local não substitui a homologação integrada com os projetos implantados. A carga fictícia e o fluxo operacional completo de notas/romaneio são uma homologação separada deste cadastro.
