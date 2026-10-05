import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sources=[
 ['vendas','apps/web/src/access-standard.js'],
 ['patio','apps/patio/access-standard.js'],
 ['fiscal','../FORTEFISCAL/src/access-standard.js'],
 ['frete','../FORTE-FRETE/access-standard.js'],
 ['financeiro','../FORTE-FINANCEIRO/src/access-standard.js'],
 ['venda-externa','../FORTE-VENDA-EXTERNA/src/access-standard.js'],
 ['carga-direta','../FORTE-CARGA-DIRETA/src/access-standard.js'],
 ['site','../SITE-FORTE-ATACAREJO/access-standard.js']
];
for(const [app,path] of sources)test(app+': aprovação exige perfil e transmite a escolha',async()=>{
 const source=fs.readFileSync(fs.existsSync(path)?path:'apps/web/src/access-standard.js','utf8');
 const fn=source.slice(source.indexOf('async function refreshQueue('),source.indexOf('function adminUI('));
 const calls=[],approve={dataset:{decision:'APROVADO'}},reject={dataset:{decision:'RECUSADO'}},role={value:''},output={textContent:''},unit={value:'unit1'};
 const article={dataset:{id:'request1'},querySelectorAll(s){return s==='button'?[approve,reject]:s==='.fa-unit:checked'?[unit]:[]},querySelector(s){return s==='.fa-role'?role:s==='.fa-reason'?{value:'Cadastro recusado'}:s.startsWith('.fa-unit')?unit:null}};
 approve.closest=reject.closest=()=>article;
 const panel={innerHTML:'',querySelector(s){return s==='[role="status"]'?output:{}},querySelectorAll(){return [approve,reject]}};
 const adminBox={querySelector(s){return s==='.fa-admin-panel'?panel:{setAttribute(){}}}};
 const context={adminBox,app,queueOpen:true,lastPendingCount:null,names:{[app]:app},esc:v=>String(v??'').replace(/[<"]/g,c=>c==='<'?'&lt;':'&quot;'),call:async(action,body)=>{calls.push({action,body});return action==='QUEUE'?{pending:[{id:'request1',nome:'Teste',app,cpf:'52998224725',created_at:'2026-10-05'}],roles:[{value:'MASTER',label:'Master'},{value:'OPERADOR_GERAL',label:'Operador geral'}],units:[{establishment_id:'unit1',establishments:{code:'MATRIZ_MG'}}],message:'Fila'}:{message:'Aprovado'}}};
 vm.createContext(context);vm.runInContext(fn+';globalThis.refresh=refreshQueue;',context);
 await context.refresh(true);
 assert.match(panel.innerHTML,/Perfil do usuário \(obrigatório\)/);
 assert.match(panel.innerHTML,/class="fa-role" required/);
 assert.match(panel.innerHTML,/<option value="">Selecione o perfil/);
 await approve.onclick();
 assert.equal(calls.some(x=>x.action==='REVIEW'),false);
 assert.match(output.textContent,/Selecione o perfil/);
 role.value='MASTER';await approve.onclick();
 assert.equal(calls.find(x=>x.action==='REVIEW').body.role,'MASTER');
 role.value='';await reject.onclick();
 assert.equal(calls.at(-2).body.decision,'RECUSADO');
});
