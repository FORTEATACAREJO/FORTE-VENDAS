const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('standalone billing SQL: atomic preparation, isolation, durable reservation and sales regression',async t=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create schema private;create schema auth;create schema extensions;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
  create table fc_perfis(user_id uuid,empresa_id uuid,ativo boolean,status_aprovacao text,trocar_senha boolean,perfil text,permissoes jsonb);
  create table fc_app_state(empresa_id uuid primary key,estado jsonb,versao bigint default 1,updated_at timestamptz,updated_by uuid);
  create function access_current_module(p_app text) returns jsonb language sql stable as $$select jsonb_build_object('allowed',coalesce(current_setting('test.module',true),'true')='true')$$;
  grant usage on schema public,auth to authenticated;grant execute on function auth.uid(),access_current_module(text) to authenticated;`);
  for(const path of ['20261014070403_itau_collections_ledger.sql','20261014072241_itau_private_rpc_implementations.sql',fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_itau_standalone_billing.sql'))])await db.exec(fs.readFileSync('supabase/migrations/'+path,'utf8'));
  await db.query("insert into fc_perfis values($1,$2,true,'APROVADO',false,'MASTER','{}'),($3,$4,true,'APROVADO',false,'MASTER','{}')",[id(1),id(10),id(2),id(20)]);
  const original={clientes:[{id:'client',nome:'Cliente QA'}],vendas:[{id:'sale'}],estoqueMov:[{id:'stock'}],pagamentos:[{id:'cash'}],boletosClientes:[],contasReceber:[]};
  await db.query('insert into fc_app_state(empresa_id,estado) values($1,$2),($3,$4)',[id(10),original,id(20),{clientes:[],boletosClientes:[]}]);
  await db.exec("insert into private.fc_itau_server_config values(true,'test-hash');set role authenticated;");
  await db.query("select set_config('test.actor',$1,false)",[id(1)]);
  const request=id(30),create=(value=123.45,reason='Acerto')=>db.query("select fc_itau_create_standalone($1,'client',$2,'REF', $3,(now() at time zone 'America/Sao_Paulo')::date,0,0) r",[request,reason,value]);
  let bid;
  await t.test('retry creates one title and one receivable, no number, sale, stock or cash changes',async()=>{
   const a=(await create()).rows[0].r,b=(await create()).rows[0].r;bid=a.boletoId;assert.equal(a.replayed,false);assert.equal(b.replayed,true);
   await db.exec('reset role');const s=(await db.query('select estado from fc_app_state where empresa_id=$1',[id(10)])).rows[0].estado;
   assert.equal(s.boletosClientes.length,1);assert.equal(s.contasReceber.length,1);assert.equal(s.contasReceber[0].status,'ABERTO');assert.equal(s.boletosClientes[0].vendaId,undefined);
   for(const key of ['vendas','estoqueMov','pagamentos'])assert.deepEqual(s[key],original[key]);
   assert.equal((await db.query('select is_called from private.fc_itau_nosso_numero')).rows[0].is_called,false);await db.exec('set role authenticated');
  });
  await t.test('same request with changed data, invalid cents and missing reason fail',async()=>{await assert.rejects(create(99),/outros dados/);await assert.rejects(create(1.001),/Confira/);await assert.rejects(create(1,''),/Confira/);});
  await t.test('another company cannot use the customer; module approval is required',async()=>{
   await db.query("select set_config('test.actor',$1,false)",[id(2)]);await assert.rejects(create(),/Cliente/);
   await db.query("select set_config('test.actor',$1,false)",[id(1)]);await db.exec("select set_config('test.module','false',false)");await assert.rejects(create(),/financeira/);await db.exec("select set_config('test.module','true',false)");
  });
  await t.test('reservation retry keeps same number and supports separate standalone obligations',async()=>{
   const version=2;const r=(await db.query('select fc_itau_reserve($1,$2) r',[bid,version])).rows[0].r;assert.equal(r.new,true);assert.equal(r.venda_id,null);
   const retry=(await db.query('select fc_itau_reserve($1,$2) r',[bid,version+1])).rows[0].r;assert.equal(retry.new,false);assert.equal(retry.nosso_numero,r.nosso_numero);
   await db.exec('reset role');const s=(await db.query('select estado from fc_app_state where empresa_id=$1',[id(10)])).rows[0].estado;assert.equal(s.contasReceber[0].status,'ABERTO');
   s.boletosClientes.push({...s.boletosClientes[0],id:'second',nossoNumero:undefined,status:'AGUARDANDO EMISSÃO API'});
   await db.query('update fc_app_state set estado=$1 where empresa_id=$2',[s,id(10)]);await db.exec('set role authenticated');const second=(await db.query("select fc_itau_reserve('second',3) r")).rows[0].r;assert.notEqual(second.nosso_numero,r.nosso_numero);
  });
  await t.test('sales keep their duplicate reservation protection',async()=>{
   await db.exec('reset role');const s=(await db.query('select estado from fc_app_state where empresa_id=$1',[id(10)])).rows[0].estado;
   s.boletosClientes.push({id:'saleBill',vendaId:'sale',parcela:1,valor:10},{id:'saleDuplicate',vendaId:'sale',parcela:1,valor:10});await db.query('update fc_app_state set estado=$1 where empresa_id=$2',[s,id(10)]);await db.exec('set role authenticated');
   const first=(await db.query("select fc_itau_reserve('saleBill',4) r")).rows[0].r;const retry=(await db.query("select fc_itau_reserve('saleDuplicate',5) r")).rows[0].r;assert.equal(retry.new,false);assert.equal(retry.nosso_numero,first.nosso_numero);
  });
 }finally{await db.close();}
});
