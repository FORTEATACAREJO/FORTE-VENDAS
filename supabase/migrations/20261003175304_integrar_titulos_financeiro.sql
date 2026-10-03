-- Financeiro lê a fonte atual do Vendas e títulos normalizados na mesma empresa.
-- Não cria cópias de títulos nem expõe o restante do estado operacional.
create or replace function public.fc_pode_acessar_financeiro(p_empresa_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists (
  select 1 from public.fc_perfis p
  left join public.fc_emergency_state e on e.empresa_id=p.empresa_id
  where p.user_id=(select auth.uid()) and p.ativo
   and p.status_aprovacao='APROVADO' and p.empresa_id=p_empresa_id
   and (p.perfil='MASTER' or not coalesce(e.bloqueado,false))
   and (p.perfil in ('MASTER','ADMINISTRADOR','FINANCEIRO')
    or p.permissoes->'financeiro'='true'::jsonb
    or p.permissoes->'FINANCEIRO'='true'::jsonb)
 );
$$;
revoke all on function public.fc_pode_acessar_financeiro(uuid) from public, anon;
grant execute on function public.fc_pode_acessar_financeiro(uuid) to authenticated, service_role;

create or replace function public.fc_financeiro_titulos()
returns table(id text,tipo text,origem text,descricao text,documento text,vencimento date,valor numeric,saldo numeric,status text)
language plpgsql stable security invoker set search_path = '' as $$
declare
 v_empresa uuid:=public.fc_current_empresa_id(); v_estado jsonb; v_titulo jsonb;
 v_tipo text; v_lista jsonb; v_id text; v_valor numeric; v_pago numeric;
 v_saldo numeric; v_status text; v_vencimento date; v_seen text[];
begin
 if not public.fc_pode_acessar_financeiro(v_empresa) then
  raise exception 'Sem permissão financeira para esta empresa.' using errcode='42501';
 end if;
 select a.estado into v_estado from public.fc_app_state a where a.empresa_id=v_empresa;
 v_estado:=coalesce(v_estado,'{}'::jsonb);
 return query
 select n.id::text,'PAGAR','NORMALIZADO',n.descricao,n.documento,n.vencimento,n.valor,n.saldo,n.status
 from public.fc_contas_pagar n where n.empresa_id=v_empresa
 union all
 select n.id::text,'RECEBER','NORMALIZADO',n.descricao,n.documento,n.vencimento,n.valor,n.saldo,n.status
 from public.fc_contas_receber n where n.empresa_id=v_empresa;

 foreach v_tipo in array array['PAGAR','RECEBER'] loop
  v_lista:=coalesce(v_estado->case when v_tipo='PAGAR' then 'contasPagar' else 'contasReceber' end,'[]'::jsonb);
  if jsonb_typeof(v_lista)<>'array' then raise exception 'Lista de títulos inválida no Vendas.'; end if;
  v_seen:=array[]::text[];
  for v_titulo in select x from jsonb_array_elements(v_lista) x loop
   v_id:=nullif(btrim(v_titulo->>'id'),'');
   if v_id is null or v_id=any(v_seen) then raise exception 'Título sem identificação ou duplicado no Vendas.'; end if;
   v_seen:=array_append(v_seen,v_id);
   if (v_tipo='PAGAR' and exists(select 1 from public.fc_contas_pagar n where n.empresa_id=v_empresa and n.id::text=coalesce(v_titulo->>'normalized_id',v_id)))
    or (v_tipo='RECEBER' and exists(select 1 from public.fc_contas_receber n where n.empresa_id=v_empresa and n.id::text=coalesce(v_titulo->>'normalized_id',v_id))) then
    continue; -- Identidade explícita: o mesmo título não entra duas vezes.
   end if;
   if v_tipo='PAGAR' and nullif(v_titulo->>'preConferenciaId','') is not null
    and not exists(select 1 from jsonb_array_elements(coalesce(v_estado->'preConferenciaBoletos','[]'::jsonb)) b
     where b->>'id'=v_titulo->>'preConferenciaId' and b->>'status'='INCORPORADO AO CONTAS A PAGAR') then continue; end if;
   begin
    v_valor:=(v_titulo->>'valor')::numeric;
    v_pago:=coalesce(nullif(v_titulo->>case when v_tipo='PAGAR' then 'valorPago' else 'valorRecebido' end,'')::numeric,0);
    v_saldo:=coalesce(nullif(v_titulo->>'saldoAberto','')::numeric,v_valor-v_pago);
    v_vencimento:=nullif(v_titulo->>'vencimento','')::date;
   exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then
    raise exception 'Valor ou vencimento inválido no título % do Vendas.',v_id;
   end;
   if v_valor is null or v_valor::text in ('NaN','Infinity','-Infinity') or v_pago::text in ('NaN','Infinity','-Infinity')
    or v_saldo::text in ('NaN','Infinity','-Infinity') or v_valor<0 or v_pago<0
    or v_pago>v_valor or v_saldo<0 or v_saldo>v_valor
    or greatest(v_valor,v_pago,v_saldo)>90071992547409.91 then
    raise exception 'Valor ou saldo inconsistente no título % do Vendas.',v_id;
   end if;
   v_status:=coalesce(nullif(v_titulo->>'status',''),'ABERTO');
   if upper(btrim(v_status)) ~ '^(PAGO|PAGA|LIQUIDADO|LIQUIDADA|RECEBIDO|RECEBIDA|CONCILIADO|CONCILIADA|CREDITADO|CREDITADA|CANCELADO|CANCELADA)([[:space:]/—-]|$)' then v_saldo:=0; end if;
   return query select 'vendas:'||v_tipo||':'||v_id,v_tipo,'VENDAS',
    coalesce(nullif(v_titulo->>'descricao',''),nullif(v_titulo->>'fornecedor',''),nullif(v_titulo->>'cliente',''),'Título do Vendas'),
    coalesce(nullif(v_titulo->>'nf',''),nullif(v_titulo->>'titulo',''),nullif(v_titulo->>'documento',''),v_titulo->>'vendaId'),
    v_vencimento,round(v_valor,2),round(v_saldo,2),v_status;
  end loop;
 end loop;
end;
$$;
revoke all on function public.fc_financeiro_titulos() from public, anon;
grant execute on function public.fc_financeiro_titulos() to authenticated;
