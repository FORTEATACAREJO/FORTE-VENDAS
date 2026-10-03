-- Operação gerencial única. Não altera o banco ou o estoque do FORTE FISCAL.
create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated;

create table private.fc_patio_contagens (
 id bigint generated always as identity primary key,
 empresa_id uuid not null references public.fc_empresas(id),
 caixa_id text not null,produto_id text not null,produto text not null,
 total numeric not null,bloqueado numeric not null,disponivel numeric not null,
 contagem numeric not null check(contagem>=0 and contagem<=1000000000000 and contagem=round(contagem,6)),
 base text not null,conferente_id uuid not null,conferente text not null,
 gravado_em timestamptz not null default clock_timestamp()
);
create index fc_patio_contagens_consulta on private.fc_patio_contagens(empresa_id,caixa_id,produto_id,id desc);
alter table private.fc_patio_contagens enable row level security;
create policy fc_patio_contagens_backend on private.fc_patio_contagens to service_role using(true) with check(true);
revoke all on private.fc_patio_contagens from public,anon,authenticated;

create function public.fc_pode_operar_base(p_empresa uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select public.fc_usuario_ativo() and exists(select 1 from public.fc_perfis p
 where p.user_id=auth.uid() and p.empresa_id=p_empresa and p.ativo
 and p.status_aprovacao='APROVADO' and not p.trocar_senha
 and p.perfil not in ('OPERADOR_PATIO','CONFERENCIA','CONSULTA','MOTORISTA','MOTORISTA_ENTREGA'));
$$;
revoke all on function public.fc_pode_operar_base(uuid) from public,anon;
grant execute on function public.fc_pode_operar_base(uuid) to authenticated;
drop policy fc_select_empresa on public.fc_app_state;
drop policy fc_insert_empresa on public.fc_app_state;
drop policy fc_update_empresa on public.fc_app_state;
create policy fc_select_empresa on public.fc_app_state for select to authenticated
 using(public.fc_pode_operar_base(empresa_id));
create policy fc_insert_empresa on public.fc_app_state for insert to authenticated
 with check(public.fc_pode_operar_base(empresa_id));
create policy fc_update_empresa on public.fc_app_state for update to authenticated
 using(public.fc_pode_operar_base(empresa_id)) with check(public.fc_pode_operar_base(empresa_id));
revoke all on public.fc_app_state from anon,authenticated;
grant select,insert,update on public.fc_app_state to authenticated;

create function private.fc_quantidade(p_value text,p_negativo boolean default false)
returns numeric language plpgsql immutable security invoker set search_path='' as $$
declare q numeric;
begin
 if p_value is null or p_value !~ '^-?[0-9]+([.][0-9]{1,6})?$' then raise exception 'Quantidade inválida na base de estoque.';end if;
 q:=p_value::numeric;
 if abs(q)>1000000000000 or (not p_negativo and q<0) then raise exception 'Quantidade fora dos limites de estoque.';end if;
 return q;
end;$$;

create function private.fc_itens_patio(p_estado jsonb)
returns table(produto_id text,produto text,marca text,unidade text,total numeric,bloqueado numeric,disponivel numeric,base text)
language plpgsql stable security invoker set search_path='' as $$
declare p jsonb;m jsonb;o jsonb;it jsonb;items jsonb;movs jsonb;reservas jsonb;pid text;tipo text;cat text;q numeric;saldo numeric;res numeric;seen text[]:=array[]::text[];
begin
 if jsonb_typeof(p_estado->'produtos') is distinct from 'array'
 or jsonb_typeof(coalesce(p_estado->'estoqueMov','[]'))<>'array'
 or jsonb_typeof(coalesce(p_estado->'vendasBalcao','[]'))<>'array' then raise exception 'Base de produtos ou estoque inválida.';end if;
 for p in select x from jsonb_array_elements(p_estado->'produtos') x loop
  pid:=nullif(btrim(p->>'id'),'');
  if pid is null or pid=any(seen) then raise exception 'Produto sem identificação ou duplicado.';end if;
  seen:=array_append(seen,pid);
  cat:=translate(upper(coalesce(p->>'finalidade',p->>'tipoProduto',p->>'categoria',p->>'classificacao','REVENDA')),'ÁÃÂÉÊÍÓÔÕÚÇ','AAAEEIOOOUC');
  if p->'ativo'='false'::jsonb or cat ~ 'USO.*CONSUMO|IMOBILIZADO' then continue;end if;
  saldo:=0;res:=0;movs:='[]';reservas:='[]';
  for m in select x from jsonb_array_elements(coalesce(p_estado->'estoqueMov','[]')) x where x->>'produtoId'=pid loop
   tipo:=upper(coalesce(m->>'tipo',''));
   if tipo like 'ENTRADA%' then q:=private.fc_quantidade(m->>'quantidade');saldo:=saldo+q;
   elsif tipo like 'SAÍDA%' or tipo like 'SAIDA%' then q:=private.fc_quantidade(m->>'quantidade');saldo:=saldo-q;
   elsif tipo like 'AJUSTE%' then q:=private.fc_quantidade(coalesce(m->>'ajuste',m->>'quantidade'),true);saldo:=saldo+q;
   else raise exception 'Movimento de estoque sem tipo reconhecido para %.',pid;end if;
   movs:=movs||jsonb_build_array(m);
  end loop;
  for o in select x from jsonb_array_elements(coalesce(p_estado->'vendasBalcao','[]')) x where x->>'status' in ('ORÇAMENTO','PARCIALMENTE ATENDIDO') loop
   items:=case when o->>'status'='PARCIALMENTE ATENDIDO' then o->'itensSaldo' else o->'itens' end;
   if jsonb_typeof(items) is distinct from 'array' then raise exception 'Saldo de itens do orçamento ausente ou inválido.';end if;
   for it in select x from jsonb_array_elements(items) x where x->>'produtoId'=pid loop
    res:=res+private.fc_quantidade(coalesce(it->>'qtd',it->>'quantidade'));
    reservas:=reservas||jsonb_build_array(jsonb_build_object('orcamento',o->>'id','status',o->>'status','item',it));
   end loop;
  end loop;
  produto_id:=pid;produto:=coalesce(p->>'nome',pid);marca:=coalesce(p->>'marca','');unidade:=coalesce(p->>'unidade','UN');
  total:=saldo;bloqueado:=res;disponivel:=saldo-res;
  base:=md5(jsonb_build_object('produto',jsonb_build_object('id',pid,'nome',produto,'marca',marca,'unidade',unidade,'categoria',cat),'movimentos',movs,'reservas',reservas)::text);
  return next;
 end loop;
end;$$;

create function private.fc_identidade_patio(p_fechamento boolean default false)
returns public.fc_perfis language plpgsql stable security definer set search_path='' as $$
declare p public.fc_perfis;
begin
 select * into p from public.fc_perfis where user_id=auth.uid();
 if auth.uid() is null or not found or not p.ativo or p.status_aprovacao<>'APROVADO' or p.trocar_senha
 or not public.fc_usuario_ativo() then raise exception 'Acesso ativo e aprovado obrigatório.' using errcode='42501';end if;
 if p_fechamento then
  if p.perfil not in ('MASTER','ADMINISTRADOR','CAIXA','VENDAS','VENDEDOR_INTERNO')
   and coalesce(p.permissoes->'VENDAS E COMPRAS'->'editar','false')<>'true'::jsonb then raise exception 'Sem permissão para fechar caixa.' using errcode='42501';end if;
 elsif p.perfil not in ('MASTER','ADMINISTRADOR','OPERADOR_PATIO','CONFERENCIA','CAIXA','VENDAS','VENDEDOR_INTERNO')
  and coalesce(p.permissoes->'patio',p.permissoes->'PATIO',p.permissoes->'PÁTIO / ESTOQUE'->'editar','false')<>'true'::jsonb then
   raise exception 'Sem permissão para conferir pátio.' using errcode='42501';
 end if;
 return p;
end;$$;

create function private.fc_status_patio(p_empresa uuid,p_caixa text,p_estado jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare itens jsonb;n integer;pend integer;div integer;obs integer;
begin
 select coalesce(jsonb_agg(jsonb_build_object('produtoId',i.produto_id,'produto',i.produto,'marca',i.marca,'unidade',i.unidade,
 'total',i.total,'bloqueado',i.bloqueado,'disponivel',i.disponivel,'inconsistente',i.total<0 or i.bloqueado>i.total,'base',i.base,'contagem',c.contagem,
 'diferenca',case when c.id is not null then i.disponivel-c.contagem end,'atual',coalesce(c.base=i.base,false),
 'conferente',c.conferente,'conferenteId',c.conferente_id,'gravadoEm',c.gravado_em) order by i.marca,i.produto,i.produto_id),'[]'),
 count(*),count(*) filter(where c.id is null),count(*) filter(where c.id is not null and c.contagem<>i.disponivel),
 count(*) filter(where c.id is not null and c.base<>i.base)
 into itens,n,pend,div,obs from private.fc_itens_patio(p_estado) i
 left join lateral(select x.* from private.fc_patio_contagens x where x.empresa_id=p_empresa and x.caixa_id=p_caixa and x.produto_id=i.produto_id order by x.id desc limit 1)c on true;
 return jsonb_build_object('caixaId',p_caixa,'itens',itens,'totalProdutos',n,'pendentes',pend,'divergencias',div,'desatualizados',obs,'liberado',n>0 and pend=0 and div=0 and obs=0);
end;$$;

create function private.fc_consultar_patio(p_caixa text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.fc_perfis;e jsonb;caixas jsonb;cx jsonb;
begin
 p:=private.fc_identidade_patio();select estado into e from public.fc_app_state where empresa_id=p.empresa_id;
 if e is null then raise exception 'Base operacional ainda não disponível.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x->>'id','data',x->>'data','unidade',x->>'unidade','operador',x->>'operador') order by x->>'data' desc),'[]') into caixas
 from jsonb_array_elements(coalesce(e->'caixasBalcao','[]')) x where x->>'status'='ABERTO';
 if p_caixa is null then return jsonb_build_object('caixas',caixas);end if;
 select x into cx from jsonb_array_elements(coalesce(e->'caixasBalcao','[]')) x where x->>'id'=p_caixa and x->>'status'='ABERTO';
 if cx is null then raise exception 'Caixa não encontrado ou já fechado.';end if;
 return private.fc_status_patio(p.empresa_id,p_caixa,e)||jsonb_build_object('caixas',caixas,'data',cx->>'data','unidade',cx->>'unidade');
end;$$;

create function private.fc_gravar_contagem(p_caixa text,p_produto text,p_contagem numeric,p_base text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.fc_perfis;e jsonb;i record;cx jsonb;
begin
 p:=private.fc_identidade_patio();
 if p.perfil in ('CAIXA','VENDAS','VENDEDOR_INTERNO') and coalesce(p.permissoes->'patio',p.permissoes->'PATIO',p.permissoes->'PÁTIO / ESTOQUE'->'editar','false')<>'true'::jsonb then raise exception 'Conferência reservada ao operador de pátio autorizado.' using errcode='42501';end if;
 if p_contagem is null or p_contagem::text in ('NaN','Infinity','-Infinity') or p_contagem<0 or p_contagem>1000000000000 or p_contagem<>round(p_contagem,6) then raise exception 'Contagem inválida. Informe quantidade não negativa com até seis casas decimais.';end if;
 select estado into e from public.fc_app_state where empresa_id=p.empresa_id for update;
 select x into cx from jsonb_array_elements(coalesce(e->'caixasBalcao','[]')) x where x->>'id'=p_caixa and x->>'status'='ABERTO';
 if cx is null then raise exception 'Caixa não encontrado ou já fechado.';end if;
 select * into i from private.fc_itens_patio(e) where produto_id=p_produto;
 if not found then raise exception 'Produto ativo de revenda não encontrado.';end if;
 if p_base is distinct from i.base then raise exception 'Estoque ou orçamento mudou. Atualize e conte o produto novamente.' using errcode='40001';end if;
 insert into private.fc_patio_contagens(empresa_id,caixa_id,produto_id,produto,total,bloqueado,disponivel,contagem,base,conferente_id,conferente)
 values(p.empresa_id,p_caixa,p_produto,i.produto,i.total,i.bloqueado,i.disponivel,p_contagem,i.base,p.user_id,p.nome);
 return private.fc_status_patio(p.empresa_id,p_caixa,e);
end;$$;

create function public.fc_patio_status(p_caixa text default null) returns jsonb
language sql security invoker set search_path='' as $$select private.fc_consultar_patio(p_caixa);$$;
create function public.fc_patio_contar(p_caixa text,p_produto text,p_contagem numeric,p_base text) returns jsonb
language sql security invoker set search_path='' as $$select private.fc_gravar_contagem(p_caixa,p_produto,p_contagem,p_base);$$;

create function private.fc_dinheiro(p_value text) returns numeric
language plpgsql immutable security invoker set search_path='' as $$
declare v numeric;
begin
 if p_value is null or p_value !~ '^-?[0-9]+([.][0-9]+)?$' then raise exception 'Valor monetário inválido.';end if;
 v:=p_value::numeric;if abs(v)>90071992547409.91 then raise exception 'Valor monetário fora dos limites.';end if;
 return round(v,2);
end;$$;
revoke all on function private.fc_dinheiro(text) from public,anon,authenticated;

create function private.fc_guardar_estado() returns trigger
language plpgsql security definer set search_path='' as $$
declare oldcx jsonb;cx jsonb;prior jsonb;status jsonb;patio jsonb;caixas jsonb:='[]';p public.fc_perfis;seen text[]:=array[]::text[];est record;it jsonb;n integer;f text;v numeric;sale jsonb;payments jsonb;pay jsonb;formas jsonb:='{}';cash numeric;revenue numeric;ids jsonb;initial numeric;method text;
begin
 if tg_op='DELETE' then raise exception 'A base operacional não pode ser excluída por este fluxo.';end if;
 if jsonb_typeof(new.estado)<>'object' then raise exception 'Base operacional inválida.';end if;
 if tg_op='UPDATE' then
  if new.versao is distinct from old.versao+1 then raise exception 'A base foi atualizada por outro usuário. Atualize os dados antes de gravar.' using errcode='40001';end if;
  for oldcx in select x from jsonb_array_elements(coalesce(old.estado->'caixasBalcao','[]')) x where x->>'status'='FECHADO' loop
   select x into cx from jsonb_array_elements(coalesce(new.estado->'caixasBalcao','[]')) x where x->>'id'=oldcx->>'id';
   if cx is distinct from oldcx then raise exception 'Caixa fechado é imutável e não pode ser removido ou reaberto.';end if;
  end loop;
 end if;
 for cx in select x from jsonb_array_elements(coalesce(new.estado->'caixasBalcao','[]')) x loop
  if nullif(cx->>'id','') is null or cx->>'id'=any(seen) then raise exception 'Caixa sem identificação ou duplicado.';end if;
  seen:=array_append(seen,cx->>'id');prior:=null;
  if tg_op='UPDATE' then select x into prior from jsonb_array_elements(coalesce(old.estado->'caixasBalcao','[]')) x where x->>'id'=cx->>'id';end if;
  if cx->>'status'='FECHADO' and coalesce(prior->>'status','')<>'FECHADO' then
   if prior is null or prior->>'status'<>'ABERTO' then raise exception 'Fechamento exige caixa aberto previamente registrado.';end if;
   if (new.estado-'caixasBalcao') is distinct from (old.estado-'caixasBalcao') then raise exception 'Salve e atualize a base antes de fechar o caixa.' using errcode='40001';end if;
   foreach f in array array['data','unidade','operador','abertoEm','saldoInicial'] loop
    if cx->f is distinct from prior->f then raise exception 'Dados de abertura do caixa não podem ser alterados no fechamento.';end if;
   end loop;
   formas:='{}';cash:=0;revenue:=0;ids:='[]';
   initial:=private.fc_dinheiro(prior->>'saldoInicial');
   for sale in select x from jsonb_array_elements(coalesce(new.estado->'vendasBalcao','[]')) x
    where x->>'caixaId'=cx->>'id' and x->>'status'='CONCLUÍDA' and coalesce(x->'regraPagamento'->'entraCaixa','true')<>'false'::jsonb loop
    revenue:=revenue+private.fc_dinheiro(sale->>'total');ids:=ids||jsonb_build_array(sale->>'id');
    if sale->>'origemVendaParcial'='VALOR RECEBIDO' then payments:=jsonb_build_array(jsonb_build_object('forma',sale->>'pagamento','valor',sale->'valorRecebido'));
    elsif jsonb_typeof(sale->'pagamentos')='array' and jsonb_array_length(sale->'pagamentos')>0 then payments:=sale->'pagamentos';
    else payments:=jsonb_build_array(jsonb_build_object('forma',coalesce(sale->>'pagamento','NÃO INFORMADO'),'valor',sale->'total'));end if;
    for pay in select x from jsonb_array_elements(payments) x loop
     v:=private.fc_dinheiro(pay->>'valor');if v<0 then raise exception 'Pagamento de venda negativo.';end if;
     method:=coalesce(nullif(pay->>'forma',''),'NÃO INFORMADO');
     formas:=jsonb_set(formas,array[method],to_jsonb(coalesce((formas->>method)::numeric,0)+v),true);
     if upper(btrim(method)) in ('DINHEIRO','A VISTA','À VISTA') then cash:=cash+v;end if;
    end loop;
   end loop;
   if private.fc_dinheiro(cx->>'totalVendas')<>revenue or private.fc_dinheiro(cx->>'saldoEsperado')<>initial+cash or cx->'vendaIds' is distinct from ids then raise exception 'Vendas ou numerário do fechamento não conferem com a base.';end if;
   if jsonb_typeof(cx->'porForma') is distinct from 'object' then raise exception 'Conferência das formas de pagamento ausente.';end if;
   for f in select key from jsonb_each(formas||coalesce(cx->'porForma','{}')) loop
    if private.fc_dinheiro(coalesce(cx->'porForma'->>f,'0'))<>coalesce((formas->>f)::numeric,0) then raise exception 'Forma de pagamento não confere com as vendas: %.',f;end if;
   end loop;
   cx:=cx||jsonb_build_object('totalVendas',revenue,'porForma',formas,'saldoInicial',initial,'saldoEsperado',initial+cash,
    'saldoContado',private.fc_dinheiro(cx->>'saldoContado'),'diferenca',private.fc_dinheiro(cx->>'diferenca'));
   p:=private.fc_identidade_patio(true);
   if p.empresa_id<>new.empresa_id then raise exception 'Caixa de outra empresa.' using errcode='42501';end if;
   status:=private.fc_status_patio(new.empresa_id,cx->>'id',new.estado);
   if not (status->>'liberado')::boolean then raise exception 'Fechamento bloqueado: confira todos os produtos do pátio, resolva diferenças e atualize contagens após movimentos.';end if;
   n:=0;
   for est in select * from private.fc_itens_patio(new.estado) loop
    select x into it from jsonb_array_elements(coalesce(cx->'estoqueSnapshot','[]')) x where x->>'produtoId'=est.produto_id;
    if it is null or (it->>'saldoFinal')::numeric<>est.total or (it->>'bloqueadoOrcamento')::numeric<>est.bloqueado or (it->>'disponivel')::numeric<>est.disponivel then raise exception 'Relatório de estoque não confere com a base e contagem atuais.';end if;
    n:=n+1;
   end loop;
   if jsonb_array_length(cx->'estoqueSnapshot')<>n then raise exception 'Relatório de estoque com produtos ausentes ou repetidos.';end if;
   foreach f in array array['totalVendas','saldoInicial','saldoEsperado','saldoContado','diferenca'] loop
    begin v:=(cx->>f)::numeric;exception when others then raise exception 'Valor de fechamento inválido: %.',f;end;
    if v is null or v::text in ('NaN','Infinity','-Infinity') or abs(v)>90071992547409.91 or (f<>'diferenca' and v<0) then raise exception 'Valor de fechamento inválido: %.',f;end if;
   end loop;
   if (cx->>'saldoContado')::numeric<0 or round((cx->>'saldoContado')::numeric-(cx->>'saldoEsperado')::numeric,2) is distinct from round((cx->>'diferenca')::numeric,2) then raise exception 'Saldo e diferença do fechamento inconsistentes.';end if;
   if round((cx->>'diferenca')::numeric,2)<>0 and nullif(btrim(cx->>'justificativa'),'') is null then raise exception 'Justificativa obrigatória para diferença de caixa.';end if;
   patio:=status||jsonb_build_object('validadoEm',clock_timestamp());
   cx:=cx||jsonb_build_object('patioConferencia',patio,'fechadoPor',p.nome,'fechadoPorId',p.user_id,'fechadoEm',clock_timestamp());
   insert into public.fc_caixa_fechamentos(id,empresa_id,data,unidade,operador,aberto_em,fechado_em,status,total_vendas,saldo_inicial,saldo_esperado,saldo_contado,diferenca,snapshot)
   values(cx->>'id',new.empresa_id,(cx->>'data')::date,cx->>'unidade',cx->>'operador',(cx->>'abertoEm')::timestamptz,(cx->>'fechadoEm')::timestamptz,'FECHADO',
    (cx->>'totalVendas')::numeric,(cx->>'saldoInicial')::numeric,(cx->>'saldoEsperado')::numeric,(cx->>'saldoContado')::numeric,(cx->>'diferenca')::numeric,cx);
  end if;
  caixas:=caixas||jsonb_build_array(cx);
 end loop;
 new.estado:=jsonb_set(new.estado,'{caixasBalcao}',caixas,true);new.updated_by:=auth.uid();return new;
end;$$;
create trigger fc_guardar_estado before insert or update or delete on public.fc_app_state for each row execute function private.fc_guardar_estado();

create function public.fc_salvar_estado(p_estado jsonb,p_versao bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a public.fc_app_state;empresa uuid:=public.fc_current_empresa_id();
begin
 if not public.fc_pode_operar_base(empresa) then raise exception 'Sem acesso ativo e aprovado à operação.' using errcode='42501';end if;
 if p_versao is null then
  insert into public.fc_app_state(empresa_id,estado,versao,updated_by) values(empresa,p_estado,1,auth.uid()) returning * into a;
 else
  update public.fc_app_state set estado=p_estado,versao=p_versao+1,updated_by=auth.uid() where empresa_id=empresa and versao=p_versao returning * into a;
  if not found then raise exception 'A base foi atualizada por outro usuário. Atualize os dados antes de gravar.' using errcode='40001';end if;
 end if;
 return jsonb_build_object('estado',a.estado,'versao',a.versao);
end;$$;

revoke all on public.fc_caixa_fechamentos from anon,authenticated;
grant select on public.fc_caixa_fechamentos to authenticated;
drop policy fc_caixa_fechamentos_insert on public.fc_caixa_fechamentos;
drop policy fc_caixa_fechamentos_update on public.fc_caixa_fechamentos;
drop policy fc_caixa_fechamentos_select on public.fc_caixa_fechamentos;
create policy fc_caixa_fechamentos_select on public.fc_caixa_fechamentos for select to authenticated using(public.fc_pode_acessar_financeiro(empresa_id));

revoke all on function private.fc_quantidade(text,boolean),private.fc_itens_patio(jsonb),private.fc_identidade_patio(boolean),private.fc_status_patio(uuid,text,jsonb),private.fc_consultar_patio(text),private.fc_gravar_contagem(text,text,numeric,text),private.fc_guardar_estado() from public,anon,authenticated;
grant execute on function private.fc_consultar_patio(text),private.fc_gravar_contagem(text,text,numeric,text) to authenticated;
revoke all on function public.fc_patio_status(text),public.fc_patio_contar(text,text,numeric,text),public.fc_salvar_estado(jsonb,bigint) from public,anon;
grant execute on function public.fc_patio_status(text),public.fc_patio_contar(text,text,numeric,text),public.fc_salvar_estado(jsonb,bigint) to authenticated;

create function private.fc_caixa_historico_imutavel() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'Histórico de caixa fechado é imutável.';end;$$;
revoke all on function private.fc_caixa_historico_imutavel() from public,anon,authenticated;
create trigger fc_caixa_historico_imutavel before update or delete on public.fc_caixa_fechamentos for each row execute function private.fc_caixa_historico_imutavel();
