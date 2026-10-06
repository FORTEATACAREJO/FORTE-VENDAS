import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const qa=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const built=await build({stdin:{contents:`import {createClient} from '@supabase/supabase-js';window.qaClient=createClient('https://auth.fixture.invalid','public-fixture',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});`,resolveDir:qa},bundle:true,write:false,platform:'browser',format:'iife',target:'es2022'});
const code=built.outputFiles[0].text;
const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-10-01T00:00:00Z'};
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const token=()=>`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:user.id,aud:'authenticated',role:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})}.Zml4dHVyZS1zaWduYXR1cmU`;
test('Sessão: concorrência, persistência e saída explícita com SDK atualizado',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://auth.fixture.invalid/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/logout'))return route.fulfill({status:204,body:''});
  if(url.pathname.endsWith('/user'))return route.fulfill({json:user});
  return route.fulfill({status:500,json:{error:'Endpoint não previsto no teste'}});
 });
 await page.route('https://session.fixture.invalid/**',route=>new URL(route.request().url()).pathname==='/sdk.js'?route.fulfill({contentType:'text/javascript',body:code}):route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="pt-BR"><body><script src="/sdk.js"></script></body></html>'}));
 await page.goto('https://session.fixture.invalid/');await page.waitForFunction(()=>!!window.qaClient);
 const empty=await page.evaluate(async()=>Promise.all(Array.from({length:8},()=>qaClient.auth.getSession().then(r=>r.data.session))));expect(empty).toEqual(Array(8).fill(null));
 const result=await page.evaluate(async access_token=>{const r=await qaClient.auth.setSession({access_token,refresh_token:'fixture-refresh'});return {error:r.error?.message,id:r.data.user?.id}},token());expect(result.error).toBeUndefined();expect(result.id).toBe(user.id);
 await page.reload();await page.waitForFunction(()=>!!window.qaClient);
 expect(await page.evaluate(async()=>(await qaClient.auth.getSession()).data.session?.user?.id)).toBe(user.id);
 expect(await page.evaluate(async()=>(await qaClient.auth.signOut()).error?.message||null)).toBeNull();
 await page.reload();await page.waitForFunction(()=>!!window.qaClient);
 expect(await page.evaluate(async()=>(await qaClient.auth.getSession()).data.session)).toBeNull();expect(errors).toEqual([]);
});
