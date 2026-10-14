import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createItauTestPDF} from '../apps/web/src/itau-test-pdf.js';

// Synthetic bank fixture: never sent to Itaú or exposed as a live bank result.
let bar='34190100000000010001090000000100000000000000';
let sum=0,w=2;
for(let i=43;i>=0;i--){if(i===4)continue;sum+=Number(bar[i])*w;w=w===9?2:w+1;}
let dv=11-sum%11;if(dv>=10||dv===0)dv=1;bar=bar.slice(0,4)+dv+bar.slice(5);
const mod10=s=>{let n=0,w=2;for(let i=s.length-1;i>=0;i--){let p=Number(s[i])*w;n+=Math.floor(p/10)+p%10;w=w===2?1:2;}return (10-n%10)%10;};
const a=bar.slice(0,4)+bar.slice(19,24),b=bar.slice(24,34),c=bar.slice(34,44);
const line=a+mod10(a)+b+mod10(b)+c+mod10(c)+bar[4]+bar.slice(5,19);
const result={ok:true,test:true,registered:false,receipt:{etapa:'validacao',carteira:'109',valor:10,
  linhaDigitavel:line,codigoBarras:bar,vencimento:'2026-10-14',nossoNumero:'00000001',
  confirmadoEm:'2026-10-14T16:00:00Z',correlationId:'FIXTURE-LOCAL'}};

test('PDF exige resultado bancário coerente e rejeita registro real, valor e código divergentes',()=>{
  assert.equal(createItauTestPDF(result).getNumberOfPages(),1);
  for(const x of [{...result,ok:false},{...result,registered:true},{...result,test:false},
    {...result,receipt:{...result.receipt,valor:20}},
    {...result,receipt:{...result.receipt,codigoBarras:'0'.repeat(44)}}]) assert.throws(()=>createItauTestPDF(x));
  const pdf=createItauTestPDF(result).output();
  assert(!pdf.includes(line),'nonregistered test must not print payable line');
  assert(!pdf.includes(bar),'nonregistered test must not print barcode');
});

if(process.env.ITAU_PDF_QA_PATH){
  const pdf=createItauTestPDF(result);
  pdf.setTextColor(140,35,20);pdf.setFontSize(8);pdf.text('QA INTERNO - RETORNO SIMULADO LOCAL',15,65);
  writeFileSync(process.env.ITAU_PDF_QA_PATH,Buffer.from(pdf.output('arraybuffer')));
}
