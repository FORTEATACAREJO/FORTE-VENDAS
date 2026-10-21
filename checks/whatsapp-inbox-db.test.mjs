import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
test('histórico da central tem armazenamento isolado, RLS e nenhuma permissão direta a usuários',async()=>{
 const db=new PGlite();try{await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table fc_app_state(id int primary key,estado jsonb);insert into fc_app_state values(1,'{"clientes":[]}');`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261021214548_protect_whatsapp_inbox_state.sql',import.meta.url),'utf8'));
 await db.exec(`set role service_role;insert into whatsapp_inbox_state(empresa_id,estado)values('00000000-0000-4000-8000-000000000001','{"whatsappInboxMessages":[{"id":"oficial"}]}');reset role;`);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(()=>db.query('select * from whatsapp_inbox_state'),/permission denied/);await assert.rejects(()=>db.exec("update whatsapp_inbox_state set estado='{}'"),/permission denied/);await db.exec('reset role');}
 const row=(await db.query("select relrowsecurity from pg_class where relname='whatsapp_inbox_state'")).rows[0];assert.equal(row.relrowsecurity,true);
 assert.deepEqual((await db.query('select estado from fc_app_state')).rows[0].estado,{clientes:[]});
 }finally{await db.close();}
});
