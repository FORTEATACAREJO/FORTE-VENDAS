import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configureInvitationBusiness} from '../supabase/functions/invitation-dispatch/configure.mjs';
import {PHONE_ID,WABA_ID,fixedSender,accessToken} from '../supabase/functions/_shared/whatsapp-business.mjs';
import {readBusiness} from '../supabase/functions/order-communications/business.mjs';

const token='simulated-access-token-'.repeat(3);
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
test('only a token is needed, sender comes from backend and approved model is preserved',async()=>{
 const calls=[],saved=[];
 const result=await configureInvitationBusiness({actor:'master',token,version:'v26.0',templateName:'existing_model',persist:async v=>saved.push(v),fetcher:async(url,options)=>{
  calls.push({url,options});
  return response(url.includes('/phone_numbers')?{data:[{id:PHONE_ID}]}:{data:[{name:'existing_model',language:'pt_BR',status:'APPROVED'}]});
 }});
 assert.equal(result.template_status,'APPROVED');assert.equal(saved[0].p_phone,PHONE_ID);assert.equal(saved[0].p_waba,WABA_ID);assert.equal(saved[0].p_template,'existing_model');
 assert(calls.every(x=>!x.options.method||x.options.method==='GET'));assert(!JSON.stringify(result).includes(token));
});
test('tampered IDs, missing tokens and whitespace fail before a provider request',async()=>{
 for(const options of [{phone:'999'},{waba:'999'},{token:''},{token:'x'.repeat(5000)},{token:token+' internal space'}]){
  let called=false;await assert.rejects(configureInvitationBusiness({actor:'master',token,version:'v26.0',...options,persist:async()=>{called=true},fetcher:async()=>{called=true}}));assert(!called);
 }
 assert.deepEqual(fixedSender(),{phone:PHONE_ID,waba:WABA_ID});assert.equal(accessToken(' '+token+' '),token);
});
test('expired token, invalid JSON, timeout and mismatched account never replace stored token',async()=>{
 for(const result of [response({error:{code:190,message:token}},401),response({data:[{id:'wrong'}]}),new Response('invalid'),new Error(token)]){
  let saved=false;await assert.rejects(configureInvitationBusiness({actor:'master',token,version:'v26.0',persist:async()=>{saved=true},fetcher:async()=>{if(result instanceof Error)throw result;return result}}),e=>!e.message.includes(token));assert(!saved);
 }
});
test('missing model is reported without creating Meta resources or sending a message',async()=>{
 const methods=[];const r=await configureInvitationBusiness({actor:'master',token,version:'v26.0',persist:async()=>{},fetcher:async(url,o)=>{methods.push(o.method||'GET');return response(url.includes('/phone_numbers')?{data:[{id:PHONE_ID}]}:{data:[]})}});
 assert.equal(r.template_status,'NOT_FOUND');assert.deepEqual(methods,['GET','GET']);
});
test('orders reject a stored sender that differs from the authorized account',async()=>{
 await assert.rejects(readBusiness({rpc:async()=>({data:{phone_id:'999',token}})},()=>''),/diverge/);
 const c=await readBusiness({rpc:async()=>({data:{token}})},()=> '');assert.equal(c.phone,PHONE_ID);assert.equal(c.waba,WABA_ID);
});
