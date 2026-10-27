import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
test('mirror tables deny direct browser access; deduplication and append-only role',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);');
 await db.exec(await fs.readFile(new URL('../common/schema.sql',import.meta.url),'utf8'));
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(()=>db.query('select * from public.connect_mirror_records'),/permission denied/);await assert.rejects(()=>db.query('select token_hash from public.connect_mirror_devices'),/permission denied/);await db.exec('reset role');}
 await db.exec("insert into auth.users values ('00000000-0000-4000-8000-000000000001');");
 await db.exec("insert into connect_mirror_devices(id,tenant_id,owner_id,mode,name,token_hash) values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','VENDAS','TESTE',repeat('a',64));");
 // Production service_role bypasses RLS; mirror service grants still prohibit mutations.
 await db.exec('alter role service_role bypassrls;set role service_role;');
 const insert="insert into connect_mirror_records(tenant_id,device_id,mode,source_id,entity_id,kind,occurred_at,content_hash,payload) values ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','VENDAS','SALE:1','SALE:1','VENDA',now(),repeat('b',64),'{}');";
 await db.exec(insert);await assert.rejects(()=>db.exec(insert),/duplicate key/);
 await assert.rejects(()=>db.exec("update connect_mirror_records set payload='{}'"),/permission denied/);
 await assert.rejects(()=>db.exec('delete from connect_mirror_records'),/permission denied/);
 assert.equal((await db.query('select count(*)::int as n from connect_mirror_records')).rows[0].n,1);
 }finally{await db.close();}
});
