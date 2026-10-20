# Envio dos documentos de carregamento

Os botões **Enviar pedido** e **Enviar ordem** conferem o destinatário cadastrado e enviam o PDF pelo WhatsApp Business. A geração usa o mesmo modelo do download opcional, sem exigir salvar arquivos no celular.

A configuração é a mesma dos convites: `shared_invite_business_read`. O acesso continua condicionado ao módulo Vendas aprovado e à empresa da configuração central. A chave nunca é retornada ao navegador. Convites não foram alterados.

Em 20/10/2026 foram submetidos à Meta, na conta já configurada, os modelos utilitários pt_BR com cabeçalho DOCUMENT e dois parâmetros posicionais:

- `forte_pedido_fornecedor_pdf`, ID `1154828846870639`.
- `forte_ordem_carregamento_pdf`, ID `1674878287542504`.

A resposta de criação dos dois foi `PENDING`. Cada envio consulta aprovação e compatibilidade antes de anexar/enviar. Credenciais válidas e convite aprovado não substituem a aprovação de modelos de documento. As variáveis opcionais `WHATSAPP_TEMPLATE_FORNECEDOR` e `WHATSAPP_TEMPLATE_ORDEM_MOTORISTA` permitem escolher outros modelos compatíveis já aprovados.

O pedido mantém código de cliente por fornecedor, placas e pallets. Ciplan e Votorantim continuam contratadas no portal: o WhatsApp encaminha a cópia. A ordem destaca o pedido oficial devolvido pelo fornecedor e utiliza uma projeção que exclui valores, preços, Pix e código de cliente.

Cada operação prepara um envio por documento/destinatário e processa apenas o envio escolhido. Aceito pela Meta, entregue e lido são situações distintas. Timeout ou resultado incerto não é reenviado automaticamente. A carga só recebe o registro de envio Business após a resposta com ID de mensagem; PDF gerado e abertura de tela não significam envio.

Os testes usam destinatários fictícios e rede simulada. A implantação não envia mensagens reais. Os comprovantes de frete continuam na etapa financeira separada e no fluxo de distribuição autorizado.
