// Strict cents and statement parser; no floating-point arithmetic during parsing.
export function moneyDecimal(raw){
 let value=String(raw??'').trim();
 if(value.includes(',')){if(!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(value))throw Error('Valor inválido; use 1.234,56 ou 1234.56.');value=value.replace(/\./g,'').replace(',','.');}
 if(!/^-?\d+(?:\.\d{1,2})?$/.test(value))throw Error('Valor inválido; informe até duas casas decimais.');
 const negative=value.startsWith('-');const [whole,fraction='']=value.replace('-','').split('.');const cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 if(cents>9007199254740991n)throw Error('Valor fora da precisão monetária suportada.');
 return `${negative&&cents!==0n?'-':''}${cents/100n}.${String(cents%100n).padStart(2,'0')}`;
}
function csvRows(text){const rows=[];let cells=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
 else if(c==='"'){if(cell||closed)throw Error('Aspas inválidas no CSV.');quoted=true;}
 else if(c===';'){cells.push(cell);cell='';closed=false;}
 else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;cells.push(cell);if(cells.some(x=>x.trim()))rows.push(cells);cells=[];cell='';closed=false;}
 else{if(closed&&!/\s/.test(c))throw Error('Conteúdo após aspas no CSV.');if(!closed)cell+=c;}}
 if(quoted)throw Error('Aspas não fechadas no CSV.');if(cell||cells.length){cells.push(cell);if(cells.some(x=>x.trim()))rows.push(cells);}return rows;
}
function dateISO(raw){let value=raw.trim();if(/^\d{2}\/\d{2}\/\d{4}$/.test(value))value=value.split('/').reverse().join('-');if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw Error('Data inválida no extrato.');return value;}
export function parseBankCSV(text){
 const rows=csvRows(String(text).replace(/^\uFEFF/,''));if(!rows.length||rows[0].map(x=>x.trim().toLowerCase()).join(';')!=='data;referencia;descricao;valor')throw Error('Use o cabeçalho data;referencia;descricao;valor e ponto e vírgula. A referência deve ser o identificador bancário único.');
 const lines=rows.slice(1).map((cells,i)=>{if(cells.length!==4)throw Error(`Linha ${i+2}: são necessárias quatro colunas.`);const [date,ref,description,raw]=cells;const referencia=ref.trim(),descricao=description.trim(),valor=moneyDecimal(raw);if(!referencia||referencia.length>200||!descricao||descricao.length>500)throw Error(`Linha ${i+2}: referência ou descrição ausente/inválida.`);if(valor==='0.00')throw Error(`Linha ${i+2}: movimento com valor zero.`);return {data:dateISO(date),referencia,descricao,valor};});
 if(!lines.length||lines.length>5000)throw Error('Importe de 1 a 5.000 movimentos por arquivo.');
 const seen=new Map();for(const line of lines){const old=seen.get(line.referencia);if(old&&JSON.stringify(old)!==JSON.stringify(line))throw Error('Referência repetida com conteúdo diferente: '+line.referencia);seen.set(line.referencia,line);}return [...seen.values()];
}
export async function bankRPC(client,name,args){try{const {data,error}=await client.rpc(name,args);if(error?.code?.startsWith('22'))throw Error('Dados bancários inválidos. Confira as datas, valores e identificadores.');if(error)throw Error(error.code==='40001'?'O título mudou. Atualize os dados antes de continuar.':error.message);return data;}catch(error){if(/fetch|network|permission denied|jwt/i.test(error.message||''))throw Error('Não foi possível confirmar a operação. Confira a sessão e a conexão, depois atualize os dados.');throw error;}}
export function bankCents(value){if(typeof value==='number'&&!Number.isSafeInteger(value))throw Error('Centavos fora da precisão segura.');if(!/^-?\d+$/.test(String(value)))throw Error('Saldo em centavos inválido.');return BigInt(value);}
export function formatBankCents(value){if(value==null)return '—';const cents=bankCents(value),absolute=cents<0n?-cents:cents;return `${cents<0n?'-':''}R$ ${(absolute/100n).toLocaleString('pt-BR')},${String(absolute%100n).padStart(2,'0')}`;}
export function totalBankCents(accounts){return accounts.reduce((sum,c)=>sum+bankCents(c.saldo_centavos),0n);}
