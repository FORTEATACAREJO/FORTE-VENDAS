# Conector de cobrança simples Itaú

Gateway: `https://api.gateway.itau.com.br/cash_management/v2/boletos`.
Carteira contratada: 109. Beneficiário: agência 4343, conta 98861-6.

## Validação ao vivo concluída em 14/10/2026

O botão TESTAR ITAÚ SEM REGISTRAR COBRANÇA confirmou a validação de R$ 10,00 com SÉCULUS CONSTRUTORA. O servidor conferiu o retorno bancário: etapa de validação, carteira, beneficiário, nosso número, vencimento, valor, linha digitável e código de barras. O teste não cria venda, título, reserva de numeração, envio ao cliente ou pagamento.

A verificação posterior no Supabase confirmou zero registros no ledger, zero títulos e sequência ainda não consumida. As tabelas e a configuração privada de conclusão já existem.

O teste ao vivo encontrou e corrigiu o envelope obrigatório `data`, valor do título em centavos preenchido com 17 dígitos, `desconto_expresso=false` e `codigo_tipo_autorizacao='01'`. O recibo converte o valor para reais sem alterar o valor da venda. Erros de validação mostram campos e orientações sanitizadas, sem valores sensíveis.

Os oito testes do conector passaram. A versão com as correções foi publicada na API e na interface.

## Fluxo e controle de acesso

A validação de uma venda usa os títulos e clientes persistidos. O teste isolado usa um valor e pagador fixos no servidor, sempre em `validacao`, e não grava o estado da aplicação. Ambos exigem sessão real, perfil aprovado e permissão de cobrança.

Chave privada, certificado, Client Secret e Access Token permanecem no servidor. Registro efetivo fica bloqueado por padrão por `ITAU_EMISSION_ENABLED`; o teste isolado nunca habilita registro nem valida um título comercial.

Uma reserva durável bloqueia repetição de registro após timeout, erro ou reinício. Resultado desconhecido exige conferência. A emissão registra o título e o evento sem quitar contas a receber, somar caixa ou alterar estoque.

## Pendências para emissão operacional

1. Conferir no Itaú o próximo nosso número livre da carteira 109 e reconciliar a sequência existente antes de habilitar registro efetivo.
2. Completar os cadastros comerciais: CEP, UF e demais dados necessários. As vendas atuais de carga direta consultadas têm preço zero e não são aptas para emissão.
3. Testar o fluxo completo de uma venda real e sua gravação, separadamente do teste isolado.
4. Implementar/conferir o PDF de boleto, alterações e conciliação de pagamento. O conector atual não executa envio por WhatsApp/e-mail.

A validação bancária aprovada não equivale a uma cobrança registrada ou à operação comercial completa.
