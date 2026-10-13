export function orderMime(job,pdfBase64){
 if(!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(job.to))throw Error('DESTINATARIO_EMAIL_INVALIDO');
 const b64=s=>btoa(String.fromCharCode(...new TextEncoder().encode(s))),boundary='forte_'+crypto.randomUUID();
 const subject=b64('Pedido '+String(job.reference||'')),file='pedido-fornecedor.pdf';
 const mime=['From: fiscalforteatacarejo@gmail.com','Reply-To: fiscalforteatacarejo@gmail.com','To: '+job.to,'Subject: =?UTF-8?B?'+subject+'?=','MIME-Version: 1.0','Content-Type: multipart/mixed; boundary="'+boundary+'"','','--'+boundary,'Content-Type: text/plain; charset=utf-8','Content-Transfer-Encoding: base64','',b64(String(job.message||'')),'--'+boundary,'Content-Type: application/pdf; name="'+file+'"','Content-Disposition: attachment; filename="'+file+'"','Content-Transfer-Encoding: base64','',pdfBase64.match(/.{1,76}/g)?.join('\r\n')||'','--'+boundary+'--',''].join('\r\n');
 return btoa(mime).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
