import {chromium} from '../qa/node_modules/playwright/index.mjs';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const source=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import WorkspaceMenu from'./apps/web/src/WorkspaceMenu.jsx';import Home from'./apps/web/src/HomeCompactV47.jsx';import{Drawer,MenuButton,useDrawer}from'./apps/web/src/ForteUI.jsx';import{workspaceNavigation}from'./apps/web/src/workspace-navigation.mjs';function Harness(){const drawer=useDrawer();const[screen,setScreen]=useState('home');const nav=workspaceNavigation(g=>!window.denied.includes(g),id=>id==='painelCargas'&&!window.denied.includes('vendas'));return <div className="forte-ui"><MenuButton drawer={drawer}/><Drawer drawer={drawer}><WorkspaceMenu navigation={nav} screen={screen} group={screen.startsWith('group:')?screen.slice(6):screen==='painelCargas'?'vendas':''} onNavigate={id=>{setScreen(id);window.destinations.push(id)}}/></Drawer><main><Home navigation={nav} canSell={!window.denied.includes('vendas')} data={{}} onSale={()=>{}} onNavigate={id=>window.destinations.push(id)}/></main></div>}createRoot(document.getElementById('root')).render(<Harness/>);`;
const bundle=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,jsx:'automatic',format:'iife',outfile:'harness.js'});
const css=readFileSync('apps/web/src/forte-ui.css','utf8')+'\n'+bundle.outputFiles.find(x=>x.path.endsWith('.css')).text;
const js=bundle.outputFiles.find(x=>x.path.endsWith('.js')).text;
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
try{for(const width of [390,1280]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://workspace.fixture/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'}));
 await page.goto('https://workspace.fixture');await page.evaluate(()=>{window.denied=[];window.destinations=[]});await page.addStyleTag({content:css});await page.addScriptTag({content:js});
 await page.getByRole('button',{name:'Abrir menu',exact:true}).click();const drawer=page.getByRole('dialog',{name:'Menu do sistema'});await drawer.waitFor({state:'visible'});assert.equal(await drawer.locator('.workspace-primary>button').count(),6);assert.equal(await drawer.locator('details').getAttribute('open'),null);
 assert.equal(await drawer.getByRole('button',{name:'Cadastros e usuários',exact:true}).isVisible(),false);
 await drawer.getByText('Mais opções',{exact:true}).click();assert(await drawer.isVisible());await drawer.getByRole('button',{name:'Cadastros e usuários',exact:true}).click();await drawer.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.destinations.at(-1)),'group:cadastros');
 await page.getByRole('button',{name:'Abrir menu',exact:true}).click();await drawer.waitFor({state:'visible'});assert(await drawer.getByRole('button',{name:'Cadastros e usuários',exact:true}).isVisible());assert.equal(await drawer.getByRole('button',{name:'Cadastros e usuários',exact:true}).getAttribute('aria-current'),'page');
 await drawer.getByRole('button',{name:'Cargas',exact:true}).click();await page.getByRole('button',{name:'Abrir menu',exact:true}).click();await drawer.waitFor({state:'visible'});assert.equal(await drawer.locator('[aria-current="page"]').count(),1);assert.equal(await drawer.locator('[aria-current="page"]').innerText(),'Cargas');
 await page.keyboard.press('Escape');assert.equal(await page.locator('main .forte-shortcuts').first().locator('button').count(),6);assert.equal(await page.locator('main details').getAttribute('open'),null);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);console.log('PASS compact workspace menu, collapsed tools, navigation and focus '+width);await page.close();
}}finally{await browser.close()}
