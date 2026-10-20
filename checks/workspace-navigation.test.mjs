import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspaceNavigation,workspaceItemActive} from '../apps/web/src/workspace-navigation.mjs';
test('six primary entries replace duplicate stock, direct sale and collections links',()=>{
 const nav=workspaceNavigation(()=>true,()=>true);
 assert.deepEqual(nav.main.map(x=>x.id),['home','group:vendas','painelCargas','group:patio','group:conferencia','group:financeiro']);
 assert.deepEqual(nav.more.map(x=>x.id),['group:fornecedores','group:cadastros','group:relatorios','group:integracoes']);
 for(const [screen,group] of [['diretas','vendas'],['estoque','patio'],['paletes','patio'],['itau','cobrancas'],['painelCargas','vendas']])assert.equal(nav.main.filter(item=>workspaceItemActive(item,screen,group)).length,1,screen);
});
test('restricted users keep their authorized entry points without gaining finance or stock access',()=>{
 const collections=workspaceNavigation(g=>g==='cobrancas',()=>false);
 assert.deepEqual(collections.main.map(x=>x.id),['home','group:cobrancas']);
 const logistics=workspaceNavigation(g=>g==='logistica',()=>false);
 assert.deepEqual(logistics.main.map(x=>x.id),['home','group:logistica']);
 const admin=workspaceNavigation(g=>g==='cadastros',()=>false);
 assert.deepEqual(admin.main.map(x=>x.id),['home']);assert.equal(admin.more[0].id,'group:cadastros');
 const none=workspaceNavigation(()=>false,()=>false);assert.equal(none.main.length,1);assert.equal(none.more.length,0);
});
