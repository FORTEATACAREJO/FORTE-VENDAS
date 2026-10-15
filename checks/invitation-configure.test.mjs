import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {configureInvitationBusiness,inviteTemplateDefinition} from '../supabase/functions/invitation-dispatch/configure.mjs';

const input={actor:'test:master',token:'not-a-real-token-'.repeat(4),phone:'1278417945364665',waba:'1081614524680450',version:'v26.0'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
function harness(responses){const calls=[],saved=[];return {calls,saved,options:{...input,persist:async value=>{saved.push(value);},fetcher:async(url,options)=>{calls.push({url,options});const next=responses.shift();if(next instanceof Error)throw next;assert.ok(next,'Unexpected external request');return next;}}};}
const numbers=()=>json({data:[{id:input.phone}]});
test('template has explicit positional parameters, examples and fixed text after the link',()=>{
  const t=inviteTemplateDefinition(),body=t.components[0];
  assert.equal(t.parameter_format,'POSITIONAL');assert.equal(t.language,'pt_BR');
  assert.deepEqual(body.text.match(/\{\{\d+\}\}/g),['{{1}}','{{2}}']);
  assert.doesNotMatch(body.text,/^\s*\{\{|\}\}\s*$/);assert.equal(body.example.body_text[0].length,2);
});
test('invalid token or account/phone mismatch cannot replace stored credentials',async()=>{
  for(const response of [json({error:{code:190,message:input.token}},401),json({data:[{id:'123'}]})]){
    const h=harness([response]);await assert.rejects(configureInvitationBusiness(h.options),error=>!error.message.includes(input.token));assert.equal(h.saved.length,0);assert.equal(h.calls.length,1);
  }
});
test('template rejection preserves verified credentials and exposes only numeric diagnostics',async()=>{
  const h=harness([numbers(),json({data:[]}),json({error:{code:100,error_subcode:2388040,message:input.token,error_user_msg:input.token}},400)]);
  const r=await configureInvitationBusiness(h.options);
  assert.equal(h.saved.length,1);assert.equal(h.saved[0].p_token,input.token);assert.equal(r.credentials_saved,true);assert.equal(r.template_status,'CREATION_REJECTED');
  assert.match(r.message,/100/);assert.match(r.message,/2388040/);assert.equal(JSON.stringify(r).includes(input.token),false);
  assert.equal(h.calls.some(c=>/\/messages$/.test(c.url)),false);
});
test('existing approved model is reused without creation or message delivery',async()=>{
  const h=harness([numbers(),json({data:[{name:'forte_acesso_convite',language:'pt_BR',status:'APPROVED'}]})]);
  const r=await configureInvitationBusiness(h.options);assert.equal(r.template_status,'APPROVED');assert.equal(h.calls.length,2);assert.equal(h.saved.length,1);
});
test('new model uses corrected body and awaits approval',async()=>{
  const h=harness([numbers(),json({data:[]}),json({id:'123',status:'PENDING'})]);
  const r=await configureInvitationBusiness(h.options);assert.equal(r.template_status,'PENDING');assert.match(r.message,/aguarde a aprovação/);
  assert.deepEqual(JSON.parse(h.calls[2].options.body),inviteTemplateDefinition());assert.equal(h.calls[2].options.method,'POST');
});
test('query permission errors and unknown network outcomes preserve credentials without claiming ready',async()=>{
  for(const responses of [[numbers(),json({error:{code:200,message:input.token}},403)],[numbers(),new Error('timeout')],[numbers(),json({data:[]}),new Error('timeout')]]){
    const h=harness(responses),r=await configureInvitationBusiness(h.options);assert.equal(h.saved.length,1);assert.equal(r.template_status,'UNVERIFIED');assert.equal(JSON.stringify(r).includes(input.token),false);
  }
});
test('failed persistence aborts before template creation',async()=>{
  const h=harness([numbers()]);h.options.persist=async()=>{throw Error('Vault unavailable');};await assert.rejects(configureInvitationBusiness(h.options),/Vault unavailable/);assert.equal(h.calls.length,1);
});
test('status distinguishes invalid credentials, absent model and approval',async()=>{
  const source=await readFile(new URL('../apps/web/src/user-invites.js',import.meta.url),'utf8');
  const {businessStatusText}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const base={business_credentials:true,credential_status:'VALID',template_configured:true};
  assert.match(businessStatusText({...base,template_status:'NOT_FOUND'}),/não foi encontrado/);
  assert.match(businessStatusText({...base,template_status:'UNVERIFIED'}),/permissão/);
  assert.match(businessStatusText({...base,template_status:'REJECTED'}),/reprovou/);
  assert.match(businessStatusText({...base,template_status:'PENDING'}),/não liberado/);
  assert.match(businessStatusText({...base,template_status:'APPROVED'}),/pronto/);
  assert.match(businessStatusText({...base,credential_status:'TOKEN_REJECTED'}),/190/);
});
