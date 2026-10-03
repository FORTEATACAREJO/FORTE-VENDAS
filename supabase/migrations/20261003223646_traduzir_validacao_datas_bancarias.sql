create function private.fc_banco_data(p_value text) returns date language plpgsql immutable security invoker set search_path='' as $$
begin
 if p_value is null or p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Data bancária inválida. Use AAAA-MM-DD.';end if;
 begin return p_value::date;exception when others then raise exception 'Data bancária inválida ou inexistente.';end;
end;$$;
revoke all on function private.fc_banco_data(text) from public,anon,authenticated;
create or replace function private.fc_banco_criar_conta(p_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.fc_perfis;c private.fc_banco_contas;v bigint;d date;k text;
begin
 p:=private.fc_identidade_banco();perform 1 from public.fc_app_state where empresa_id=p.empresa_id for update;if not found then raise exception 'Base operacional desta empresa ainda não disponível.';end if;
 foreach k in array array['nome','banco','agencia','numero'] loop if nullif(btrim(p_dados->>k),'') is null or length(p_dados->>k)>100 then raise exception 'Dados obrigatórios da conta ausentes ou inválidos: %.',k;end if;end loop;
 v:=private.fc_centavos(p_dados->>'saldo');d:=private.fc_banco_data(p_dados->>'data');if d is null then raise exception 'Data inicial obrigatória.';end if;
 select * into c from private.fc_banco_contas where empresa_id=p.empresa_id and banco=btrim(p_dados->>'banco') and agencia=btrim(p_dados->>'agencia') and numero=btrim(p_dados->>'numero');
 if found then
  if c.saldo_inicial<>v or c.data_inicial<>d or c.nome<>btrim(p_dados->>'nome') then raise exception 'Conta já cadastrada com dados diferentes. O saldo inicial não pode ser sobrescrito.';end if;
 else insert into private.fc_banco_contas(empresa_id,nome,banco,agencia,numero,data_inicial,saldo_inicial,criado_por) values(p.empresa_id,btrim(p_dados->>'nome'),btrim(p_dados->>'banco'),btrim(p_dados->>'agencia'),btrim(p_dados->>'numero'),d,v,p.user_id) returning * into c;end if;
 return jsonb_build_object('contaId',c.id);
end;$$;
create or replace function private.fc_banco_importar(p_conta uuid,p_linhas jsonb,p_arquivo text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.fc_perfis;c private.fc_banco_contas;x jsonb;m private.fc_banco_movimentos;d date;v bigint;ref text;descr text;n int:=0;repetidos int:=0;
begin
 p:=private.fc_identidade_banco();perform 1 from public.fc_app_state where empresa_id=p.empresa_id for update;if not found then raise exception 'Base operacional desta empresa ainda não disponível.';end if;
 select * into c from private.fc_banco_contas where id=p_conta and empresa_id=p.empresa_id;if not found then raise exception 'Conta desta empresa não encontrada.';end if;
 if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas)=0 or jsonb_array_length(p_linhas)>5000 then raise exception 'Extrato inválido. Importe de 1 a 5.000 movimentos por arquivo.';end if;
 if nullif(btrim(p_arquivo),'') is null or length(p_arquivo)>255 then raise exception 'Nome do arquivo obrigatório.';end if;
 for x in select e from jsonb_array_elements(p_linhas)e loop
  ref:=nullif(btrim(x->>'referencia'),'');descr:=nullif(btrim(x->>'descricao'),'');
  if ref is null or descr is null or length(ref)>200 or length(descr)>500 then raise exception 'Identificador bancário e descrição obrigatórios em cada movimento.';end if;
  d:=private.fc_banco_data(x->>'data');if d is null or d<c.data_inicial then raise exception 'Data do movimento anterior à abertura da conta ou ausente.';end if;
  v:=private.fc_centavos(x->>'valor');if v=0 then raise exception 'Movimento bancário não pode ter valor zero.';end if;
  select * into m from private.fc_banco_movimentos where conta_id=p_conta and referencia=ref;
  if found then
   if m.data is distinct from d or m.centavos is distinct from v or m.descricao is distinct from descr then raise exception 'Identificador bancário repetido com conteúdo diferente: %.',ref;end if;repetidos:=repetidos+1;
  else insert into private.fc_banco_movimentos(empresa_id,conta_id,data,referencia,descricao,centavos,arquivo,criado_por) values(p.empresa_id,p_conta,d,ref,descr,v,p_arquivo,p.user_id);n:=n+1;end if;
 end loop;
 if abs(c.saldo_inicial::numeric+coalesce((select sum(centavos) from private.fc_banco_movimentos where conta_id=p_conta),0))>9007199254740991 then raise exception 'Saldo agregado fora dos limites monetários.';end if;
 return jsonb_build_object('importados',n,'repetidos',repetidos);
end;$$;
