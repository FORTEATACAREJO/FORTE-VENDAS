import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareWhatsappMedia} from '../apps/web/src/whatsapp-media.mjs';
const file=(bytes,mime,filename)=>prepareWhatsappMedia({base64:Buffer.from(bytes).toString('base64'),mime,filename});
test('foto do WhatsApp sem nome recebe extensão JPEG e preserva os bytes',async()=>{
 const bytes=[255,216,255,224,0,16];const out=file(bytes,'image/jpeg','anexo-wamid123');
 assert.equal(out.filename,'anexo-wamid123.jpg');assert.equal(out.blob.type,'image/jpeg');assert.equal(out.previewable,true);assert.deepEqual([...new Uint8Array(await out.blob.arrayBuffer())],bytes);
});
test('identifica PNG, WebP, GIF e PDF mesmo com MIME genérico',()=>{
 for(const [bytes,mime,ext] of [[[137,80,78,71,13,10,26,10],'image/png','png'],[Buffer.from('RIFF0000WEBP'),'image/webp','webp'],[Buffer.from('GIF89a'),'image/gif','gif'],[Buffer.from('%PDF-1.4'),'application/pdf','pdf']]){
 const out=file(bytes,'application/octet-stream','anexo');assert.equal(out.mime,mime);assert.equal(out.filename,'anexo.'+ext);assert.equal(out.previewable,true);
 }
});
test('nome correto é mantido e extensão incompatível é corrigida',()=>{
 assert.equal(file([255,216,255],'image/jpeg','CNH.jpeg').filename,'CNH.jpeg');
 assert.equal(file([255,216,255],'image/jpeg','CNH.pdf').filename,'CNH.jpg');
 assert.equal(file(Buffer.from('%PDF-1.7'),'application/pdf','pedido.pdf').filename,'pedido.pdf');
 const document=file(Buffer.from('PK'),'application/vnd.openxmlformats-officedocument.wordprocessingml.document','pedido.docx');
 assert.equal(document.filename,'pedido.docx');assert.equal(document.previewable,false);
});
test('nome inválido no Windows é saneado; arquivos ativos não são pré-visualizados',()=>{
 const out=file(Buffer.from('<svg onload="bad()"/>'),'image/svg+xml','../CON');
 assert.equal(out.mime,'application/octet-stream');assert.equal(out.previewable,false);assert.match(out.filename,/\.bin$/);assert.doesNotMatch(out.filename,/[\\/]/);
 assert.equal(file(Buffer.from('%PDF-1.4'),'application/pdf','CON.pdf').filename,'anexo-CON.pdf');
});
