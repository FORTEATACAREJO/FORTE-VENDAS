const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('pallet invoice queue, full allocation, stock and ledgers commit atomically',async t=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema private;
 create table fc_empresas(id uuid primary key);create table fc_perfis(user_id uuid primary key,empresa_id uuid,ativo boolean,status_aprovacao text,trocar_senha boolean,perfil text,permissoes jsonb);
 create table fc_app_state(empresa_id uuid primary key,estado jsonb);
 create function access_module_context(uuid,text) returns jsonb language sql as $$select jsonb_build_object('allowed',ativo and status_aprovacao='APROVADO' and not trocar_senha,'role',perfil) from public.fc_perfis where user_id=$1$$;
 create table gmail_hub_supplier_rules(id uuid primary key,empresa_id uuid,active boolean);
 create table gmail_hub_sources(id uuid primary key,empresa_id uuid,file_id uuid,supplier_id uuid,filename text,subject text,metadata jsonb,allowed boolean,issues text[] default '{}',updated_at timestamptz default now());
 create table fc_pallet_movimentos(id uuid primary key default gen_random_uuid(),empresa_id uuid not null,tipo text not null,origem text,destino text,quantidade numeric not null check(quantidade>0),documento_referencia text,observacao text,criado_por uuid,created_at timestamptz default now());
 alter table fc_pallet_movimentos enable row level security;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261020234354_pallet_invoice_queue_allocation.sql','utf8'));
 await db.query('insert into fc_empresas values($1)',[id(1)]);await db.query("insert into fc_perfis values($1,$2,true,'APROVADO',false,'MASTER','{}')",[id(99),id(1)]);
 await db.query("insert into fc_perfis values($1,$2,true,'APROVADO',false,'CONSULTA','{}')",[id(98),id(1)]);
 const state={fornecedores:[{id:'supplier',nome:'Fornecedor fictício',cnpj:'12345678000199'}],clientes:[{id:'A',nome:'Cliente A'},{id:'B',nome:'Cliente B'},{id:'C',nome:'Cliente C'}],vendas:[{id:'saleA',clienteId:'A'},{id:'saleB',clienteId:'B'},{id:'saleC',clienteId:'C'}],cargas:[{id:'load',vendaIds:['saleA','saleB','saleC']}]};
 await db.query('insert into fc_app_state values($1,$2)',[id(1),state]);
 const source=async(n,key='1'.repeat(44),quantity=30,allowed=true)=>db.query("insert into gmail_hub_sources(id,empresa_id,file_id,supplier_id,filename,subject,metadata,allowed) values($1,$2,$3,'00000000-0000-4000-8000-000000000077','NF pallets.xml','NF pallets',$4,$5)",[id(n),id(1),id(n+100),{key,issuer_cnpj:'12345678000199',number:String(n===11?10:n),series:'1',pallet:{candidate:true,quantity}},allowed]);
 await db.query('insert into gmail_hub_supplier_rules values($1,$2,true)',[id(77),id(1)]);await source(10);let note=(await db.query('select * from fc_pallet_notas')).rows[0];
 const allocation=(client,q=10)=>({tipo:'COMODATO',cliente_ref:client,venda_ref:'sale'+client,carga_ref:'load',entrega_ref:'entrega-'+client,quantidade:q});
 const body={quantidade:30,fornecedor_ref:'supplier',modalidade:'DEVOLVER_FORNECEDOR',conferida:true,evidencia:'Conferência humana do XML e do destinatário',alocacoes:['A','B','C'].map(c=>allocation(c))};
 const save=(patch={},revision=note.revision,actor=99)=>db.query('select fc_pallet_salvar($1,$2,$3,$4,$5) r',[id(1),id(actor),note.id,revision,{...body,...patch}]);
 const integrate=(revision=note.revision)=>db.query('select fc_pallet_integrar($1,$2,$3,$4,$5) r',[id(1),id(99),note.id,revision,id(500)]);
 await t.test('re-reading Gmail attaches source without a second invoice or any stock posting',async()=>{
  await source(11);assert.equal((await db.query('select count(*)::int n from fc_pallet_notas')).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from fc_pallet_nf_fontes')).rows[0].n,2);assert.equal((await db.query('select count(*)::int n from fc_pallet_movimentos')).rows[0].n,0);
 });
 await t.test('29/30 remains partial, 31/30 fails, foreign actor and broken links fail',async()=>{
  let r=await save({alocacoes:[allocation('A',10),allocation('B',10),allocation('C',9)]});assert.equal(r.rows[0].r.status,'PARCIAL');note.revision=r.rows[0].r.revision;
  await assert.rejects(integrate(),/100%/);await assert.rejects(save({alocacoes:[allocation('A',31)]}),/acima/);
  await assert.rejects(save({},note.revision,98),/permissão/);
  await assert.rejects(save({alocacoes:[{...allocation('A',30),venda_ref:'saleB'}]}),/não pertence/);
  await assert.rejects(save({alocacoes:[{...allocation('A',30),carga_ref:'missing'}]}),/venda e carga/);
  await assert.rejects(save({},0),/outra tela/);
 });
 await t.test('100% allocation is ready; injected downstream failure rolls back every posting',async()=>{
  const r=await save();assert.equal(r.rows[0].r.status,'PRONTA');note.revision=r.rows[0].r.revision;
  await db.exec("create function private.fail_pallet_ledger() returns trigger language plpgsql as $$begin if new.parte='CLIENTE' and new.parte_ref='B' then raise exception 'FALHA SIMULADA';end if;return new;end$$;create trigger fail_pallet_ledger before insert on fc_pallet_contas for each row execute function private.fail_pallet_ledger();");
  await assert.rejects(integrate(),/FALHA SIMULADA/);assert.equal((await db.query('select count(*)::int n from fc_pallet_movimentos')).rows[0].n,0);assert.equal((await db.query('select status from fc_pallet_notas where id=$1',[note.id])).rows[0].status,'PRONTA');await db.exec('drop trigger fail_pallet_ledger on fc_pallet_contas');
 });
 await t.test('retry integrates once: client accounts A/B/C 10 each, supplier obligation 30, transit zero',async()=>{
  assert.equal((await integrate()).rows[0].r.replayed,false);assert.equal((await integrate()).rows[0].r.replayed,true);
  assert.equal((await db.query('select count(*)::int n from fc_pallet_movimentos')).rows[0].n,4);
  const accounts=(await db.query('select parte,parte_ref,sum(quantidade)::int saldo from fc_pallet_contas group by parte,parte_ref order by parte_ref')).rows;
  assert.deepEqual(accounts,[{parte:'CLIENTE',parte_ref:'A',saldo:10},{parte:'CLIENTE',parte_ref:'B',saldo:10},{parte:'CLIENTE',parte_ref:'C',saldo:10},{parte:'FORNECEDOR',parte_ref:'supplier',saldo:30}]);
  const transit=(await db.query("select sum(case when destino='EM TRÂNSITO' then quantidade else 0 end)-sum(case when origem='EM TRÂNSITO' then quantidade else 0 end) saldo from fc_pallet_movimentos")).rows[0].saldo;assert.equal(Number(transit),0);
  await assert.rejects(save(),/encerrada/);
 });
 await t.test('PDF without certain quantity stays visible; untrusted origin cannot be confirmed',async()=>{
  await source(12,'2'.repeat(44),null,false);const n=(await db.query("select * from fc_pallet_notas where identity=$1",['NF:'+'2'.repeat(44)])).rows[0];assert.equal(n.quantidade,null);assert.equal(n.status,'CONFERENCIA_PENDENTE');
  await assert.rejects(db.query('select fc_pallet_salvar($1,$2,$3,0,$4)',[id(1),id(99),n.id,{...body,numero:'12'}]),/Origem não autorizada/);
 });
 await t.test('client return and supplier return update only their own obligation and stock once',async()=>{
  const body={tipo:'RETORNO',nota_id:note.id,cliente_ref:'A',origem:'CLIENTE / COMODATO',destino:'GALPÃO MONTE CARMELO',quantidade:2,observacao:'Devolução conferida no galpão'};
  const move=(data,request=501)=>db.query('select fc_pallet_movimentar($1,$2,$3,$4) r',[id(1),id(99),id(request),data]);
  await assert.rejects(move({...body,quantidade:11}),/maior que o saldo/);await move(body);assert.equal((await move(body)).rows[0].r.replayed,true);
  await assert.rejects(move({...body,quantidade:3}),/reutilizado/);
  assert.equal(Number((await db.query('select private.pallet_saldo($1,$2) saldo',[id(1),'GALPÃO MONTE CARMELO'])).rows[0].saldo),2);
  await move({tipo:'DEVOLUÇÃO AO FORNECEDOR',nota_id:note.id,origem:'GALPÃO MONTE CARMELO',quantidade:2,observacao:'Devolução ao fornecedor conferida'},502);
  assert.equal(Number((await db.query('select private.pallet_saldo($1,$2) saldo',[id(1),'GALPÃO MONTE CARMELO'])).rows[0].saldo),0);
  const summary=(await db.query('select fc_pallet_painel($1,$2,true,0) r',[id(1),id(99)])).rows[0].r;
  assert.equal(summary.contas.find(c=>c.parte==='CLIENTE'&&c.parte_ref==='A').saldo,8);assert.equal(summary.contas.find(c=>c.parte==='FORNECEDOR').saldo,28);
  await assert.rejects(db.query('select fc_pallet_reverter($1,$2,$3,$4,$5)',[id(1),id(99),note.id,id(503),'Reversão solicitada em teste']),/devoluções posteriores/);
 });
 await t.test('owned warehouse allocation reverses with compensating entries and preserved source history',async()=>{
  await source(13,'3'.repeat(44));const n=(await db.query('select * from fc_pallet_notas where identity=$1',['NF:'+'3'.repeat(44)])).rows[0];
  const b={...body,modalidade:'PROPRIO',numero:'13',alocacoes:[{tipo:'GALPAO',local:'GALPÃO CALDAS NOVAS',quantidade:30}]};
  const saved=(await db.query('select fc_pallet_salvar($1,$2,$3,0,$4) r',[id(1),id(99),n.id,b])).rows[0].r;
  await db.query('select fc_pallet_integrar($1,$2,$3,$4,$5)',[id(1),id(99),n.id,saved.revision,id(504)]);
  let summary=(await db.query('select fc_pallet_painel($1,$2,true,0) r',[id(1),id(99)])).rows[0].r;assert.equal(summary.patrimonio,30);assert.equal(summary.saldos.find(s=>s.local==='GALPÃO CALDAS NOVAS').saldo,30);
  await db.query('select fc_pallet_reverter($1,$2,$3,$4,$5)',[id(1),id(99),n.id,id(505),'Documento e entrada revertidos em teste']);
  summary=(await db.query('select fc_pallet_painel($1,$2,true,0) r',[id(1),id(99)])).rows[0].r;assert.equal(summary.patrimonio,0);assert.equal(summary.saldos.find(s=>s.local==='GALPÃO CALDAS NOVAS').saldo,0);
  assert.equal((await db.query('select count(*)::int n from fc_pallet_movimentos where pallet_nota_id=$1',[n.id])).rows[0].n,4);assert.equal((await db.query('select count(*)::int n from fc_pallet_nf_fontes where nota_id=$1',[n.id])).rows[0].n,1);
 });
 await t.test('unidentified PDF is explicitly joined to one existing NF without another posting',async()=>{
  await db.query("insert into gmail_hub_sources(id,empresa_id,file_id,supplier_id,filename,subject,metadata,allowed) values($1,$2,$3,$4,'pallets.pdf','NF pallets',$5,true)",[id(14),id(1),id(114),id(77),{pallet:{candidate:true,quantity:null}}]);
  const duplicate=(await db.query("select * from fc_pallet_notas where identity=$1",['FILE:'+id(114)])).rows[0];const before=(await db.query('select count(*)::int n from fc_pallet_movimentos')).rows[0].n;
  const merge=()=>db.query('select fc_pallet_juntar_documento($1,$2,$3,$4,$5,$6) r',[id(1),id(99),duplicate.id,note.id,id(509),'Documento PDF conferido pertence à mesma nota fiscal']);
  await merge();assert.equal((await merge()).rows[0].r.replayed,true);assert.equal((await db.query('select count(*)::int n from fc_pallet_movimentos')).rows[0].n,before);assert.equal((await db.query('select status from fc_pallet_notas where id=$1',[duplicate.id])).rows[0].status,'DUPLICADA');assert.equal((await db.query('select count(*)::int n from fc_pallet_nf_fontes where nota_id=$1',[note.id])).rows[0].n,3);
 });
 await t.test('revoked source rule and missing operator permissions fail closed',async()=>{
  await source(15,'4'.repeat(44));const n=(await db.query('select * from fc_pallet_notas where identity=$1',['NF:'+'4'.repeat(44)])).rows[0];
  await db.query('update gmail_hub_supplier_rules set active=false');await assert.rejects(db.query('select fc_pallet_salvar($1,$2,$3,0,$4)',[id(1),id(99),n.id,{...body,numero:'15'}]),/Origem não autorizada/);await db.query('update gmail_hub_supplier_rules set active=true');
  await db.query('update fc_perfis set permissoes=null where user_id=$1',[id(98)]);await assert.rejects(db.query('select fc_pallet_painel($1,$2,false,0)',[id(1),id(98)]),/permissão/);
 });
 await t.test('anonymous and authenticated API callers cannot mutate the queue or execute privileged RPC',async()=>{
  await db.exec('set role authenticated');try{await assert.rejects(save(),/permission denied/);await assert.rejects(db.query('select * from fc_pallet_notas'),/permission denied/);}finally{await db.exec('reset role');}
 });
 }finally{await db.close();}
});
