import {jsPDF} from 'jspdf';
import {boletoCode} from '../../../supabase/functions/gmail-central/intake.mjs';

export function createItauTestPDF(result) {
  const r = result?.receipt;
  const code = boletoCode(r?.linhaDigitavel);
  if (result?.ok !== true || result?.test !== true || result?.registered !== false ||
      r?.etapa !== 'validacao' || r?.carteira !== '109' || Number(r?.valor) !== 10 ||
      !code.valid || code.bank !== '341' || code.amount_cents !== 1000 || code.barcode !== r.codigoBarras ||
      !/^\d{4}-\d{2}-\d{2}$/.test(r.vencimento)) {
    throw Error('O ITAÚ NÃO CONFIRMOU O RETORNO DO TESTE. PDF NÃO GERADO.');
  }
  const d = new jsPDF({unit:'mm',format:'a4'});
  d.setFillColor(22,42,58); d.rect(0,0,210,34,'F');
  d.setTextColor(255); d.setFont('helvetica','bold'); d.setFontSize(18);
  d.text('FORTE ATACAREJO',15,16);
  d.setFontSize(11); d.text('ITAÚ | TESTE DE BOLETO EM PDF',15,26);
  d.setFillColor(228,111,30); d.rect(0,34,210,3,'F');
  d.setTextColor(140,35,20); d.setFontSize(15);
  d.text('TESTE SEM REGISTRO - NÃO PAGAR',15,49);
  d.setFont('helvetica','normal'); d.setTextColor(22,42,58); d.setFontSize(10);
  d.text('Documento de validação bancária. Não representa cobrança registrada.',15,58);
  const row = (y,label,value) => {
    d.setDrawColor(210); d.rect(15,y,180,18);
    d.setFontSize(8); d.text(label,19,y+5);
    d.setFontSize(11); d.text(String(value),19,y+13);
  };
  row(70,'BENEFICIÁRIO','FORTE ATACAREJO LTDA');
  row(88,'BANCO / AGÊNCIA / CONTA / CARTEIRA','Itaú 341 | 4343 | 98861-6 | 109');
  row(106,'PAGADOR DO TESTE','SÉCULUS CONSTRUTORA LTDA | CNPJ 03.698.525/0001-30');
  row(124,'ENDEREÇO DO PAGADOR','RUA ARTHUR BERNARDES, 455 - CENTRO');
  row(142,'CIDADE / UF / CEP','COROMANDEL / MG / 38550-026');
  row(160,'VALOR DO TESTE / VENCIMENTO','R$ 10,00 | '+r.vencimento.split('-').reverse().join('/'));
  row(178,'NOSSO NÚMERO UTILIZADO SOMENTE NA VALIDAÇÃO',r.nossoNumero);
  row(196,'RESULTADO CONFIRMADO PELO ITAÚ','VALIDADO - SEM REGISTRO');
  d.setFontSize(9);
  d.text(['Linha digitável e código de barras não são impressos neste teste.',
    'Nenhuma venda, conta a receber ou cobrança foi criada por esta operação.',
    'A emissão definitiva exige registro bancário confirmado.'],15,230);
  d.setFontSize(8);
  d.text(d.splitTextToSize('Confirmação: '+(r.confirmadoEm || '')+' | Referência: '+(r.correlationId || 'não informada'),180),15,255);
  d.setDrawColor(210); d.line(15,276,195,276);
  d.text('Forte Vendas - Validação de integração Itaú',15,284);
  return d;
}
