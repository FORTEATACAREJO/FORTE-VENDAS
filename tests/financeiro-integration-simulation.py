"""Financial RPC scenarios: execute on PostgreSQL inside BEGIN/ROLLBACK only."""
import json
from pathlib import Path
def lit(s): return "'"+s.replace("'","''")+"'"
uid='347967ec-c67b-40ac-9b89-6a86482b0ada'
out=["begin;",f"select set_config('request.jwt.claim.sub','{uid}',true);",
 "create temporary table simulation_results(name text,ok boolean,detail text);",
 "grant all on simulation_results to authenticated,anon;",
 """create function pg_temp.reject(p_name text) returns void language plpgsql as $$
 begin
  begin perform * from public.fc_financeiro_titulos(); raise exception 'ACEITO INDEVIDAMENTE' using errcode='PT001';
  exception when sqlstate 'PT001' then insert into simulation_results values(p_name,false,'ACEITO INDEVIDAMENTE');
   when others then insert into simulation_results values(p_name,sqlerrm ~* 'permiss|inválid|inconsistente|duplicado',sqlerrm);end;
 end;$$;"""]
def snapshot(data):
 out.extend(["reset role;","update public.fc_app_state set versao=versao+1, estado="+lit(json.dumps(data,ensure_ascii=False))+"::jsonb where empresa_id=public.fc_current_empresa_id();","set local role authenticated;"])
def expected(name,pay,receive,count=None):
 check=f"coalesce(sum(saldo) filter(where tipo='PAGAR'),0)={pay} and coalesce(sum(saldo) filter(where tipo='RECEBER'),0)={receive}"
 if count is not None:check+=f" and count(*)={count}"
 out.append("insert into simulation_results select "+lit(name)+","+check+",'pagar='||coalesce(sum(saldo) filter(where tipo='PAGAR'),0)||', receber='||coalesce(sum(saldo) filter(where tipo='RECEBER'),0) from public.fc_financeiro_titulos();")
snapshot({'contasPagar':[{'id':'P','valor':800,'valorPago':300,'status':'PARCIALMENTE PAGO'}],'contasReceber':[{'id':'R','valor':1000,'valorRecebido':400,'status':'PARCIALMENTE PAGO'}]})
expected('Parciais: pagar 500 e receber 600',500,600,2)
for status in ['PAGO','LIQUIDADO','RECEBIDO','CANCELADO','PAGO/LIQUIDADO — COMPROVANTE']:
 snapshot({'contasPagar':[{'id':'P','valor':800,'status':status}],'contasReceber':[{'id':'R','valor':1000,'status':status}]})
 expected('Encerrado: '+status,0,0,2)
snapshot({'contasReceber':[{'id':'R','valor':1000,'valorRecebido':400,'saldoAberto':600,'status':'ABERTO'}]})
expected('Saldo explícito coerente usado como no Vendas',0,600,1)
for s in ['RECEBIDO','EM ANÁLISE','REJEITADO/CANCELADO','INCORPORADO AO CONTAS A PAGAR']:
 snapshot({'contasPagar':[{'id':'P','valor':700,'valorPago':200,'preConferenciaId':'PRE'}],'preConferenciaBoletos':[{'id':'PRE','status':s}]})
 expected('Pré-conferência: '+s,500 if s=='INCORPORADO AO CONTAS A PAGAR' else 0,0)
snapshot({'contasReceber':[{'id':'R1','valor':0.1},{'id':'R2','valor':0.2}]})
expected('Centavos somam exatamente 0,30',0,0.3,2)
for v in ['NaN','Infinity','-Infinity','texto',-1]:
 snapshot({'contasReceber':[{'id':'R','valor':v}]})
 out.append("select pg_temp.reject("+lit('Bloqueia valor '+str(v))+");")
snapshot({'contasReceber':[{'id':'R','valor':1000,'valorRecebido':400,'saldoAberto':550}]})
out.append("select pg_temp.reject('Bloqueia saldo divergente das baixas');")
for saldo in [0,599.99]:
 snapshot({'contasReceber':[{'id':'R','valor':1000,'valorRecebido':400,'saldoAberto':saldo,'status':'ABERTO'}]})
 out.append("select pg_temp.reject('Bloqueia saldo aberto divergente: "+str(saldo)+"');")
snapshot({'contasReceber':[{'id':'R','valor':10,'valorRecebido':11}]})
out.append("select pg_temp.reject('Bloqueia recebimento superior ao título');")
snapshot({'contasReceber':[{'id':'R','valor':10},{'id':'R','valor':20}]})
out.append("select pg_temp.reject('Bloqueia identidade duplicada');")
snapshot({'contasReceber':[{'valor':10}]})
out.append("select pg_temp.reject('Bloqueia título sem identificação');")
snapshot({'contasReceber':{'valor':10}})
out.append("select pg_temp.reject('Bloqueia lista inválida');")
snapshot({'contasReceber':[{'id':'R','valor':10,'vencimento':'2026-02-31'}]})
out.append("select pg_temp.reject('Bloqueia vencimento impossível');")
snapshot({})
out.extend(["reset role;","create temporary table native_fixture as with inserted as (insert into public.fc_contas_pagar(empresa_id,unidade_id,descricao,vencimento,valor,saldo) select p.empresa_id,u.id,'SIMULACAO','2026-10-04',80,30 from public.fc_perfis p join public.fc_unidades u on u.empresa_id=p.empresa_id where p.user_id=auth.uid() limit 1 returning id) select id from inserted;",
 "update public.fc_app_state set versao=versao+1, estado=jsonb_build_object('contasPagar',jsonb_build_array(jsonb_build_object('id',(select id::text from native_fixture),'valor',80))) where empresa_id=public.fc_current_empresa_id();","set local role authenticated;"])
expected('Título normalizado prevalece sem duplicação',30,0,1)
out.extend(["reset role;","update public.fc_app_state set versao=versao+1, estado=jsonb_build_object('contasPagar',jsonb_build_array(jsonb_build_object('id','LEGADO','normalized_id',(select id::text from native_fixture),'valor',80))) where empresa_id=public.fc_current_empresa_id();","set local role authenticated;"])
expected('Vínculo explícito do legado sem duplicação',30,0,1)
for field,value,name in [('ativo','false','Usuário inativo'),('status_aprovacao',"'PENDENTE'",'Usuário pendente'),('perfil',"'VENDAS'",'Usuário sem permissão financeira')]:
 out.extend(["reset role;",f"update public.fc_perfis set {field}={value} where user_id=auth.uid();","set local role authenticated;",f"select pg_temp.reject('{name}');","reset role;",f"update public.fc_perfis set {field}="+({'ativo':'true','status_aprovacao':"'APROVADO'",'perfil':"'MASTER'"}[field])+" where user_id=auth.uid();"])
out.extend(["update public.fc_perfis set perfil='FINANCEIRO' where user_id=auth.uid();","set local role authenticated;"])
expected('Perfil FINANCEIRO autorizado',30,0,1)
out.extend(["reset role;","update public.fc_perfis set perfil='VENDAS',permissoes=jsonb_build_object('financeiro',true) where user_id=auth.uid();","set local role authenticated;"])
expected('Permissão financeira explícita autorizada',30,0,1)
out.extend(["reset role;","update public.fc_perfis set perfil='MASTER' where user_id=auth.uid();","select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',true);","set local role authenticated;","select pg_temp.reject('Usuário sem perfil não recebe dados');","reset role;","set local role anon;","select pg_temp.reject('Anônimo não executa RPC');","reset role;",
 "select jsonb_agg(jsonb_build_object('name',name,'ok',ok,'detail',detail)) as results from simulation_results;","rollback;"])
Path(__file__).with_suffix('.sql').write_text('\n'.join(out)+'\n')
