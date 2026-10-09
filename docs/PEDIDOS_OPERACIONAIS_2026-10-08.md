# Pedidos e carregamento — complemento operacional de 08/10/2026

## Acesso
Forte Vendas → Vendas e Compras → Pedidos e Carregamento. Três abas independentes. A opção de nova venda do Painel de Vendas abre a aba Pedido de Venda.

## Implementação
- Cadastros reais do estado da empresa; pesquisa de cliente, fantasia, documento, motorista, CPF e placas.
- Produtos por fornecedor e por marca; custos vigentes, preço comercial, múltiplos itens, peso, frete por tonelada, pallets e capacidade.
- Quatro opções de pallets; prazo novo exige permissão; liberações e custos/preços excepcionais conferidos no servidor.
- Rascunho do fornecedor permanece não enviado. PDF/WhatsApp/mailto não afirmam envio. Comprovante de envio cria dossiê imediatamente. Pedido externo confirmado pode iniciar ordem diretamente.
- Número oficial separado do ID interno; duplicata bloqueada; reenvio com requestId retorna o mesmo resultado.
- Venda interna nasce aprovada. Vinculação posterior à carga verifica produtos e quantidades. Boleto não é gerado automaticamente ao cadastrar.
- Dossiê por carga, anexos privados em nuvem, hash conferido, validação documental explícita. Verde apenas para documento validado; frete CIF não aplicável.
- Finalização exige documentação, envio real da ordem e comprovante de entrega. Galpão movimenta estoque único; direta não entra no galpão. Reentrada da mesma carga é bloqueada.
- Entrega depende de finalização real e de todos os boletos aplicáveis efetivamente registrados, com identificação e valor suficiente; títulos apenas preparados não satisfazem a condição.
- Integração autenticada com Forte Frete: importar somente motoristas aprovados com conjuntos ativos, enviar ordem privadamente e copiar comprovante validado. Cada motorista vê só suas ordens. Falha de sincronização informa pendência.
- Leitura de print/PDF por IA via chave do servidor, somente sugestões com fonte/evidências e revisão humana. Não vincula cadastros por semelhança.
- Gravação por RPC existente com versão (CAS), sem sobrescrever base de outra sessão. Chamadas não autorizadas não gravam.

## Validação
33 testes de domínio, autenticação, idempotência e concorrência; teste real em Chromium a 390 e 1440 px; build Vite; testes existentes de valores, nomes comerciais e estoque. Endpoints publicados recusam chamadas sem sessão (401).

## Limites atuais
- Envio ao fornecedor por WhatsApp/e-mail usa PDF e canal manual com comprovante. Não há backend de envio conectado a Gmail/WhatsApp nesta entrega.
- Gmail existente tem escopo somente leitura e vinculação deve ser comprovada; sugestão por semelhança de nome/marca foi removida.
- Tela Itaú existente prepara cobranças para emissão API. Emissão bancária real, emissão automática e retorno de boletos continuam dependentes do backend bancário; esta entrega não afirma que foram emitidos.
- Na conferência da base Forte Frete não havia motorista aprovado; pré-cadastro existente não foi aprovado automaticamente.
- Leitura por IA exige OPENAI_API_KEY no ambiente das funções. Ausência/falha apresenta mensagem e preserva preenchimento manual.
- Nenhum pedido, boleto ou frete real foi enviado durante os testes.
- Advisors indicam avisos preexistentes sobre funções de segurança e proteção de senhas; nenhuma tabela nova ficou sem RLS/política. Referência: https://supabase.com/docs/guides/database/database-linter
