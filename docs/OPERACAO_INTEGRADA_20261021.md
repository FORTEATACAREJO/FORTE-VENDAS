# Preparação operacional — cinco sistemas Forte — 21/10/2026

## Alterações desta candidata

Vendas incorpora as correções das PRs 46 e 47, sem duplicá-las: confirmação do caixa/venda no servidor, adicionar item, atalhos, encaminhamento das notas à carga e complemento somente dos campos cadastrais vazios. Estende a confirmação do servidor à pré-conferência, cancelamento de orçamento, conversão e venda parcial por valor e cancelamento. Cancelamento preserva a venda completa; documentos/títulos/entregas/pallets vinculados exigem procedimento no módulo competente. Comprovantes do balcão passam a guardar o arquivo na nuvem e abri-lo por link temporário; registros legados sem arquivo pedem nova anexação.

Rascunhos de itens do balcão são separados por empresa, usuário e unidade. A chave antiga compartilhada não é importada para outro usuário. Não apaga o legado.

Central WhatsApp: menu com contador, pesquisa, filtros por situação/papel e desconhecidos; texto e metadados de mídia, resposta em janela de atendimento, notas internas, assumir atendimento e vínculos escolhidos em registros existentes. O webhook HMAC existente captura mensagens universais e estados fora de ordem sem duplicar. Respostas reservam identificador antes de contatar a Meta; resultado incerto bloqueia reenvio automático. Histórico fica em tabela isolada da versão de vendas, com RLS e sem acesso direto dos clientes; a Edge confere sessão, aprovação Vendas, perfil e empresa. Anexos de até 8 MB são baixados pela Edge autenticada; não há arquivamento automático das mídias. Transferência entre atendentes e modelos de resposta gerais fora da janela ainda precisam ser completados.

## Implantação

1. Conferir CI e testes de interface desta branch.
2. Aplicar a migração protect_whatsapp_inbox_state (cria tabela isolada, sem alterar registros comerciais).
3. Publicar order-communications com suas dependências e autenticação existente. Conferir versão do webhook publicado antes de substituir.
4. Verificar encaminhamento Vendas no serviço forte-whatsapp-api (branch própria); habilitar somente o encaminhamento necessário sem substituir segredos.
5. Publicar interface, testar recebimento real e leitura com operador autorizado, recarregar para verificar persistência.
6. Reversão: voltar a Edge e a interface às revisões anteriores, mantendo a tabela com mensagens. Não apagar histórico nem restaurar estado comercial antigo sobre dados novos.

## Verificação já executada

- Compilação dos cinco sistemas passou (Fiscal, Vendas, Frete, Financeiro e Vendas Externas).
- Vendas: 254 testes principais e 105 simulações financeiras passaram antes do ajuste final de isolamento da Central; testes adicionais de armazenamento isolado, concorrência e ACL são executados nesta candidata. Regressões numéricas e de capacidade passaram.
- Frete: 14 testes selecionados de cadastro/despacho passaram. Isso não comprova um novo aceite real enviado ao Vendas.
- Fiscal: PR específica no repositório FORTEFISCAL; console 55/65 em homologação, diário cifrado e testes próprios. Os 18 cenários tributários reais continuam pendentes.
- Navegador local: download Chromium indisponível; testes de interface são executados no GitHub Actions. Testes com fixtures não substituem sessão real de funcionário nem aparelho Android físico.

## Bloqueios de liberação integral

- Confirmar persistência e efeitos com funcionário aprovado por perfil. Matriz completa de botões do pacote não foi executada integralmente em sessão real.
- Venda do balcão com frete por não Master ainda depende do caminho financeiro autorizado; não houve ampliação de RLS ou concessão de Master.
- Fiscal: 18 cenários reais PENDING; 5 perfis de produto, 5 regras operacionais, 4 federais e 4 da reforma aguardam aprovação. Confirmar CSC/credenciamento por UF, séries e numeração do emissor antigo, XML/DANFE, eventos, recepção retroativa e MDF-e elegível.
- Itaú: validação de 14/10 é histórica. Nova validação, próximo nosso número, PDF de boleto registrado e conciliação precisam de execução e evidência; registro e pagamento reais não foram acionados.
- WhatsApp: comprovar webhook e mensagem real, anexos e resposta autorizada na conta atual. Nenhuma mensagem foi enviada a terceiros nesta preparação.
- Gmail e fluxo Frete→Cargas: testes reais e evidências ainda necessários. Preservar um único Painel de Cargas.
- Advisors Supabase revisados: existem bloqueios intencionais por RLS e alertas de funções privilegiadas/proteção de senhas. Não remover restrições em lote. Alertas remanescentes exigem revisão individual.

Não declarar os cinco sistemas homologados a partir de build, testes com fixtures ou status LIVE. Esta candidata não constitui autorização contábil, fiscal ou bancária.
