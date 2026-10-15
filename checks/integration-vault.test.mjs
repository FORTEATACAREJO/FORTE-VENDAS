import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isVaultMaster,validateCommand,projects} from '../supabase/functions/integration-vault/policy.mjs';

test('only current approved Master profiles administer the vault',()=>{
  assert.equal(isVaultMaster({perfil:'MASTER',ativo:true,status_aprovacao:'APROVADO'}),true);
  assert.equal(isVaultMaster({role:'ULTRA_ADMIN',active:true}),true);
  for (const p of [null,{perfil:'MASTER',ativo:false},{perfil:'ADMINISTRADOR',ativo:true},{perfil:'MASTER',ativo:true,status_aprovacao:'PENDENTE'},{role:'MASTER',active:true,must_change_password:true},{perfil:'MASTER',ativo:true,trocar_senha:true},{role:'MOTORISTA',active:true}]) assert.equal(isVaultMaster(p),false);
});
test('commands accept bounded secrets, validate versions, reject reveal and untrusted actions',()=>{
  const base={action:'SAVE',provider:'whatsapp',reference:'token_producao',label:'WhatsApp',secret:'test-only-token',version:0};
  assert.deepEqual(validateCommand({...base,unexpected:'ignore'}),{provider:'whatsapp',reference:'token_producao',label:'WhatsApp',secret:'test-only-token',version:0,expires_at:null});
  for(const patch of [{action:'REVEAL'},{provider:'__proto__'},{reference:'bad reference'},{secret:' '},{secret:'a'.repeat(32769)},{version:-1},{version:'1'},{expires_at:'not-a-date'}]) assert.throws(()=>validateCommand({...base,...patch}));
  assert.throws(()=>validateCommand({action:'ARCHIVE',id:'anything',version:1}));
  assert.deepEqual(validateCommand({action:'LIST',secret:'not-forwarded'}),{});
  assert.equal(projects.nkynfboqwfxhhxcsrawl.includes('https://forte-vendas.onrender.com'),false);
});
