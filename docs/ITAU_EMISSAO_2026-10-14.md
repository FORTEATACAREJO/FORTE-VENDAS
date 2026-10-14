# Conector de cobrança simples Itaú

Fonte: especificação autenticada Itaú API Boletos – Emissão e Instrução 2.75.150, consultada em 14/10/2026, e e-mail da implantação do banco para a Forte.
Gateway: `https://api.gateway.itau.com.br/cash_management/v2/boletos`.
Carteira contratada: 109. Beneficiário: agência 4343, conta 98861-6.

O botão anterior somente preparava títulos. O novo fluxo permite validar os títulos persistidos na nuvem com `etapa_processo_boleto=validacao`; o resultado não é classificado como registro nem pagamento. Registro efetivo permanece bloqueado por padrão no servidor e só pode ser solicitado depois da validação explícita no modal.

O servidor verifica o usuário no Supabase, perfil aprovado e permissão de cobrança. Os dados são lidos da venda e do cliente persistidos, conferindo parcelas, valor e endereço. Chave privada, certificado, Client Secret e Access Token ficam no servidor.

## Instalação pendente

1. Revisar/aplicar `supabase/migrations/20261014070403_itau_collections_ledger.sql`. O script não inclui segredos. A configuração privada precisa receber o SHA256 da chave `ITAU_SETUP_KEY` já instalada no servidor; a chave não vai para o Git ou o navegador do Vendas.
2. Conferir no banco o próximo nosso número livre e inicializar a sequência `private.fc_itau_nosso_numero`. Não habilitar registro efetivo antes de conferir a carteira anterior.
3. Publicar o código do serviço e da interface. Testar o botão VALIDAR NO ITAÚ com uma venda e cadastro completos, verificando o retorno bancário.
4. Somente depois do teste e da conferência de numeração, habilitar `ITAU_EMISSION_ENABLED=true` no serviço Itaú.

Uma reserva durável bloqueia repetição de registro após timeout, erro ou reinício do serviço. Resultado desconhecido vai para conferência. Não há reenvio automático nem cancelamento automático. A emissão registra o título e evento, sem quitar contas a receber, somar caixa ou alterar o estoque.

## Limites desta mudança

Não envia cobranças por WhatsApp/e-mail, não gera PDF de boleto, não implementa alteração ou conciliação de pagamentos. Linha digitável e código de barras retornados são conferidos e mantidos no título. O PDF para homologação deve ser implementado/conferido antes da disponibilização operacional completa.

A revisão automática bloqueou a abertura das configurações protegidas do Render. O comando da CLI Supabase também foi bloqueado por tentativa de telemetria para PostHog com conteúdo não conhecido. O script SQL foi mantido para revisão; nenhuma instalação em produção ou contorno dos bloqueios foi executado.
