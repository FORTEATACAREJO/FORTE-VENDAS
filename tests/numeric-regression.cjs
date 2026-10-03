const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module'),{edge}=require('./edge-harness.cjs');
(async()=>{
 const core=await import('../packages/core/src/index.js');
 for(const total of [NaN,Infinity,-Infinity,-1,'abc'])assert.equal(core.validateCapacity(total,38000,45000).status,'BLOQUEADO');
 for(const target of [NaN,Infinity,-1])assert.equal(core.validateCapacity(38000,target,45000).status,'BLOQUEADO');
 for(const max of [NaN,Infinity,-1])assert.equal(core.validateCapacity(38000,38000,max).status,'BLOQUEADO');
 assert.equal(core.validateCapacity(38000,38000,45000).status,'CONFERE');assert.equal(core.validateCapacity(45001,38000,45000).status,'BLOQUEADO');assert.equal(core.validateCapacity(37000,38000,45000).status,'PENDÊNCIA');
 for(const password of ['123456','001234','1234567','1'.repeat(12),'1'.repeat(64)])assert.equal((await edge('login-cpf',{cpf:'52998224725',password},{source:'supabase/functions/login-cpf/index.ts',origin:'https://forte-vendas.onrender.com'})).status,200);
 for(const password of ['12345','12345a','１２３４５６',123456,null])assert.equal((await edge('login-cpf',{cpf:'52998224725',password},{source:'supabase/functions/login-cpf/index.ts',origin:'https://forte-vendas.onrender.com'})).status,401);
 for(const origin of ['https://forte-operador-patio.onrender.com','https://site-forte-atacarejo.onrender.com'])assert.equal((await edge('login-cpf',{cpf:'52998224725',password:'1234567'},{source:'supabase/functions/login-cpf/index.ts',origin})).status,200);
 const ctx={Deno:{serve(){}},Response,console};vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/first-access/index.ts','utf8').replace(/^import[^\n]+\n/,''),{mode:'transform'})+'\nglobalThis.validPassword=passwordIsValid',ctx);for(const p of ['123456','1234567','1'.repeat(64)])assert.equal(ctx.validPassword(p),true);assert.equal(ctx.validPassword('12345a'),false);
 console.log('PASS: capacity rejects nonfinite/negative numbers; nominal capacity and maximum remain correct; login and first access accept numeric passwords of 6+ digits.');
})().catch(e=>{console.error(e);process.exit(1)});
