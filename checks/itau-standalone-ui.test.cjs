const {test}=require('node:test'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom'),{buildSync}=require('esbuild'),Module=require('node:module'),path=require('node:path');
test('modal avulso pertence ao App, com conector bancário no mesmo escopo',()=>{
 const fs=require('node:fs'),parser=require('@babel/parser'),source=fs.readFileSync('apps/web/src/App.jsx','utf8');
 const ast=parser.parse(source,{sourceType:'module',plugins:['jsx']});const owners=[];
 function visit(n,owner=''){if(!n||typeof n!=='object')return;const name=n.type==='FunctionDeclaration'?n.id?.name:owner;if(n.type==='JSXOpeningElement'&&n.name?.name==='ItauStandalone')owners.push(name);for(const [key,v]of Object.entries(n))if(key!=='loc')if(Array.isArray(v))v.forEach(x=>visit(x,name));else if(v&&typeof v==='object')visit(v,name);}
 visit(ast);assert.deepEqual(owners,['App']);
});
test('avulso form prepares without a sale, blocks double submit and reuses request after uncertain response',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid'});
 const previous={};for(const key of ['window','document','HTMLElement','Event','MouseEvent']){previous[key]=global[key];global[key]=dom.window[key];}
 global.IS_REACT_ACT_ENVIRONMENT=true;
 const React=require('react'),{createRoot}=require('react-dom/client'),{act}=React;
 const code=buildSync({entryPoints:['apps/web/src/ItauStandalone.jsx'],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom','react-dom/client']}).outputFiles[0].text;
 const m=new Module(path.resolve('checks/compiled-standalone.cjs'),module);m.filename=path.resolve('checks/compiled-standalone.cjs');m.paths=module.paths;m._compile(code,m.filename);
 const View=m.exports.default,calls=[];let finish;
 const onBankAction=input=>{calls.push(input);return new Promise((resolve,reject)=>{finish={resolve,reject};});};
 const root=createRoot(document.getElementById('root'));
 const data={clientes:[{id:'client',nome:'Cliente sintético'}],boletosClientes:[],vendas:[]};
 try{
  await act(async()=>root.render(React.createElement(View,{data,onBankAction,onClose:()=>{}})));
  const inputs=document.querySelectorAll('form input'),select=document.querySelector('form select');
  async function change(element,value){await act(async()=>{Object.getOwnPropertyDescriptor(element instanceof dom.window.HTMLSelectElement?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new dom.window.Event('change',{bubbles:true}));element.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});}
  await change(select,'client');await change(inputs[0],'Acerto');await change(inputs[2],'123,45');
  const submit=()=>document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  await act(async()=>{submit();submit();});assert.equal(calls.length,1);assert.equal(calls[0].valor,123.45);assert.equal(calls[0].vendaId,undefined);assert.equal(calls[0].action,'CREATE_STANDALONE');
  assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent==='FECHAR').disabled,true);
  await act(async()=>finish.reject(Error('Resposta não confirmada')));
  await act(async()=>submit());assert.equal(calls.length,2);assert.equal(calls[0].requestId,calls[1].requestId);
  await act(async()=>finish.resolve({ok:true,replayed:true}));assert.match(document.querySelector('[role=status]').textContent,/Nenhum boleto foi registrado/);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,value]of Object.entries(previous)){if(value===undefined)delete global[key];else global[key]=value;}delete global.IS_REACT_ACT_ENVIRONMENT;}
});
