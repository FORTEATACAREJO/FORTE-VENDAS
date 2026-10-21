import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createForteHistory} from '../apps/web/src/forte-history.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,25));
for(const app of ['vendas','frete','fiscal','financeiro','venda-externa'])test(app+': internal back, forward, deep links, dirty forms and revoked route retain session',async()=>{
 const dom=new JSDOM('<main><form><input name="name"></form></main>',{url:'https://fixture.invalid/?forte_view=lista'}),win=dom.window;win.scrollTo=()=>{};win.confirm=()=>true;win.localStorage.setItem('session-fixture','preserved');let screen='';
 const nav=createForteHistory({app,root:'inicio',onChange:v=>screen=v,win});
 assert.equal(nav.screen,'lista');nav.navigate('detalhe');assert.equal(screen,'detalhe');nav.back();await tick();assert.equal(screen,'lista');nav.back();await tick();assert.equal(screen,'inicio');win.history.forward();await tick();assert.equal(screen,'lista');
 const input=win.document.querySelector('input');input.value='Dados não salvos';input.dispatchEvent(new win.Event('input',{bubbles:true}));win.confirm=()=>false;assert.equal(nav.navigate('outra'),false);nav.back();await tick();await tick();assert.equal(nav.screen,'lista');assert.equal(input.value,'Dados não salvos');
 win.confirm=()=>true;assert.equal(nav.navigate('outra'),true);let allowed=true;nav.setGuard(route=>allowed||route==='inicio');allowed=false;nav.back();await tick();assert.equal(nav.screen,'inicio');assert.equal(win.localStorage.getItem('session-fixture'),'preserved');nav.dispose();dom.window.close();
});
