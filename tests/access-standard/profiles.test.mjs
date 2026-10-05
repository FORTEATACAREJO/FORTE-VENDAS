import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PROFILE_CODES, PROFILE_OPTIONS, normalizeProfile, profileOptionsFor } from '../../apps/web/src/profiles.js';
const expected=['MASTER','ADMINISTRADOR','OPERADOR_GERAL','OPERADOR_PATIO','MOTORISTA','VENDEDOR_EXTERNO','VENDEDOR_INTERNO'];
test('sete perfis, nomes visíveis e restrição administrativa',()=>{
 assert.deepEqual(PROFILE_CODES,expected);
 assert.deepEqual(PROFILE_OPTIONS.map(x=>x.label),['Master','Administrador','Operador geral','Operador de pátio','Motorista','Vendedor externo','Vendedor interno']);
 assert.deepEqual(profileOptionsFor('MASTER').map(x=>x.value),expected);
 assert.deepEqual(profileOptionsFor('ADMINISTRADOR').map(x=>x.value),expected.slice(2));
 assert.equal(normalizeProfile(''),'');
 assert.equal(normalizeProfile('INVALIDO'),'');
 assert.equal(normalizeProfile('ADMIN'),'ADMINISTRADOR');
 assert.equal(normalizeProfile('VENDAS'),'VENDEDOR_INTERNO');
 assert.equal(normalizeProfile('CONFERÊNCIA'),'OPERADOR_PATIO');
});
test('fila de aprovação publica os mesmos sete perfis',()=>{
 for(const file of ['supabase/functions/access-standard/index.ts','../FORTEFISCAL/supabase/functions/access-standard/index.ts','../FORTE-FRETE/supabase/functions/access-standard/index.ts']){
  if(!fs.existsSync(file))continue;
  const source=fs.readFileSync(file,'utf8');
  const roles=JSON.parse(source.match(/return reply\(\{roles:(\[.*?\])\.filter/)[1]);
  assert.deepEqual(roles,PROFILE_OPTIONS);
 }
});
