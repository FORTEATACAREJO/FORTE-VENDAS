-- A interface recebe os saldos em centavos inteiros, sem perda em conversão decimal.
create or replace function private.fc_banco_painel() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.fc_perfis;contas jsonb;movs jsonb;hist jsonb;
begin
 p:=private.fc_identidade_banco();
 if exists(select 1 from private.fc_banco_contas c where c.empresa_id=p.empresa_id and abs(c.saldo_inicial::numeric+coalesce((select sum(m.centavos) from private.fc_banco_movimentos m where m.conta_id=c.id),0))>9007199254740991) then raise exception 'Saldo agregado fora da precisão monetária suportada.';end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.nome),'[]') into contas from(select c.*,c.saldo_inicial::numeric/100 saldo_abertura,
 (c.saldo_inicial::numeric+coalesce((select sum(m.centavos) from private.fc_banco_movimentos m where m.conta_id=c.id),0))/100 saldo,
 (c.saldo_inicial::numeric+coalesce((select sum(m.centavos) from private.fc_banco_movimentos m where m.conta_id=c.id),0)) saldo_centavos,
 (select count(*) from private.fc_banco_movimentos m where m.conta_id=c.id) movimentos from private.fc_banco_contas c where c.empresa_id=p.empresa_id)q;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.data desc,q.criado_em desc),'[]') into movs from(select m.*,m.centavos::numeric/100 valor,private.fc_banco_livre(m.id)::numeric/100 disponivel,private.fc_banco_livre(m.id) disponivel_centavos from private.fc_banco_movimentos m where m.empresa_id=p.empresa_id order by m.data desc,m.criado_em desc limit 1000)q;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.criado_em desc),'[]') into hist from(select c.*,c.centavos::numeric/100 valor,
 exists(select 1 from private.fc_banco_conciliacoes e where e.estorna_id=c.id) estornado,
 (select x.nome from public.fc_perfis x where x.user_id=c.criado_por) responsavel from private.fc_banco_conciliacoes c where c.empresa_id=p.empresa_id order by c.criado_em desc limit 500)q;
 return jsonb_build_object('contas',contas,'movimentos',movs,'historico',hist,'limiteMovimentos',1000,'limiteHistorico',500);
end;$$;
