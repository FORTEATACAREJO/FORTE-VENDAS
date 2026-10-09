# Relatório de cobranças Itaú

Disponível em Cobranças Itaú e nos botões de relatório da emissão de boletos. Consulta de leitura dos boletos de clientes já cadastrados; não altera cobrança ou movimentação bancária.

Inclui nome fantasia e razão social, venda e parcela, vencimento, dias de atraso, valor original, saldo aberto, nosso número, seu número, carteira e DDA. Resumos: total em aberto, vencidos, vencem hoje, a vencer, faixas de atraso e saldos por cliente. Filtros de cliente, texto/número, situação e intervalo de vencimento. PDF A4 paisagem com cabeçalho repetido, subtotais opcionais por cliente, total e páginas numeradas.

Datas de referência seguem America/Sao_Paulo. Vencimento no dia não é vencido. Saldo considera saldoAberto explícito ou valor menos valorRecebido; boletos liquidados, cancelados, baixados sem pagamento, rejeitados e de outros bancos ficam fora. Solicitações de emissão, títulos sem nosso número, valores inválidos ou vencimentos inválidos aparecem como pendências fora dos totais. Encargos não confirmados pelo banco não são estimados. A foto foi usada como referência de layout; seus valores não foram importados como dívidas.

Validação: quatro testes de valores, situações, datas, recebimentos parciais e filtros; navegação Chromium a 390/1440 pixels; geração e inspeção visual de PDF de 65 títulos com oito páginas, cabeçalhos repetidos, identificação de todos os títulos, subtotal e total; build de produção. Nenhum título bancário foi emitido, alterado ou baixado durante os testes.
