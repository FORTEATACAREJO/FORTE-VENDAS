import {test} from 'node:test';
import assert from 'node:assert/strict';
import {driverTemplateCompatibility,driverInvitationPayload,chooseInvitationTemplate} from '../supabase/functions/invitation-dispatch/driver-template.mjs';
const code='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const base='https://forte-frete.onrender.com/?cadastro=convite&convite=1&codigo=';
const template=()=>({name:'forte_convite_motorista',language:'pt_BR',status:'APPROVED',parameter_format:'POSITIONAL',components:[{type:'BODY',text:'Olá, {{1}}! A Forte Atacarejo convida você a realizar seu cadastro de motorista no sistema Forte Frete.'},{type:'BUTTONS',buttons:[{type:'URL',text:'Fazer cadastro',url:base+'{{1}}'}]}]});
test('approved driver model can carry one name and the individual invitation token in its URL button',()=>{
 const t=template();assert.equal(driverTemplateCompatibility(t).compatible,true);
 const payload=driverInvitationPayload(t,{name:'Convidado de teste',to:'5511999999999',link:base+code});
 assert.equal(payload.template.name,'forte_convite_motorista');
 assert.deepEqual(payload.template.components,[{type:'body',parameters:[{type:'text',text:'Convidado de teste'}]},{type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:code}]}]);
});
test('static buttons, other destinations, unsupported parameters and media headers fail closed',()=>{
 const variants=[];
 for(const url of ['https://forte-frete.onrender.com/',base+code,'https://invalid.example/?cadastro=convite&convite=1&codigo={{1}}','https://forte-frete.onrender.com/?cadastro=convite&codigo={{1}}',base+'{{1}}&extra=redirect']){const t=template();t.components[1].buttons[0].url=url;variants.push(t);}
 const body=template();body.components[0].text+=' {{2}}';variants.push(body);
 const header=template();header.components.unshift({type:'HEADER',format:'IMAGE'});variants.push(header);
 const named=template();named.parameter_format='NAMED';variants.push(named);
 for(const t of variants){assert.equal(driverTemplateCompatibility(t).compatible,false);assert.throws(()=>driverInvitationPayload(t,{name:'Teste',to:'1',link:base+code}));}
});
test('driver choice is restricted to Frete and approved compatible templates',()=>{
 const generic={name:'forte_acesso_convite',status:'PENDING'},t=template();
 assert.equal(chooseInvitationTemplate('nkynfboqwfxhhxcsrawl',generic,t),t);
 for(const source of ['gtwecfyffjszghnvtlzr','xmfpvvmvdkepmnvtdoio'])assert.equal(chooseInvitationTemplate(source,generic,t),generic);
 t.status='PENDING';assert.equal(chooseInvitationTemplate('nkynfboqwfxhhxcsrawl',generic,t),generic);
 assert.throws(()=>driverInvitationPayload(t,{name:'Teste',to:'1',link:base+code}));
});
test('invalid registration links cannot be placed in the approved button',()=>{
 for(const link of ['https://invalid.example/?codigo='+code,base+'not-a-code','https://forte-frete.onrender.com/?cadastro=convite&codigo='+code])assert.throws(()=>driverInvitationPayload(template(),{name:'Teste',to:'1',link}));
});
