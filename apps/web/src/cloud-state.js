// Serializes saves from this session and refuses stale writes from another session.
export function createCloudStateStore(client, context, onError = () => {}) {
  let version, accepted = null, blocked = false, tail = Promise.resolve();
  const copy = value => value == null ? value : structuredClone(value);
  function fail(error, state) {
    blocked = true;
    const message = error?.code === '40001'
      ? 'Outra pessoa atualizou a base. Suas alterações locais foram preservadas. Atualize os dados antes de continuar.'
      : (/permission denied|row-level security|jwt|network|fetch/i.test(error?.message || '')
        ? 'Não foi possível gravar. Confira a sessão e a conexão; suas alterações locais foram preservadas.'
        : error?.message || 'Não foi possível gravar; suas alterações locais foram preservadas.');
    const failure = Object.assign(new Error(message), {code:error?.code});
    onError(failure, state); return failure;
  }
  async function load() {
    const ctx=context(); if(!ctx?.profile?.empresa_id)throw new Error('Entre no sistema antes de atualizar a base.');
    let result;
    try { result=await client.from('fc_app_state').select('estado,versao').eq('empresa_id',ctx.profile.empresa_id).maybeSingle(); }
    catch(error) { throw fail(error); }
    if(result.error)throw fail(result.error);
    version=result.data ? Number(result.data.versao) : null;
    if(version!==null&&!Number.isSafeInteger(version))throw fail(new Error('Versão de dados inválida.'));
    accepted=copy(result.data?.estado||null);blocked=false;onError(null);
    return copy(accepted);
  }
  function save(state) {
    const desired=copy(state);
    const run=tail.then(async()=>{
      if(blocked)throw new Error('Atualize os dados antes de continuar. As alterações locais estão preservadas.');
      if(version===undefined)throw fail(new Error('Aguarde o carregamento dos dados antes de gravar.'),desired);
      if(JSON.stringify(desired)===JSON.stringify(accepted))return copy(accepted);
      let result;
      try { result=await client.rpc('fc_salvar_estado',{p_estado:desired,p_versao:version}); }
      catch(error) { throw fail(error,desired); }
      if(result.error)throw fail(result.error,desired);
      const receipt=result.data;
      if(!receipt?.estado||!Number.isSafeInteger(Number(receipt.versao))||Number(receipt.versao)!==(version===null?1:version+1))throw fail(new Error('Não foi possível confirmar a gravação. Atualize os dados.'),desired);
      version=Number(receipt.versao);accepted=copy(receipt.estado);return copy(accepted);
    });
    tail=run.catch(()=>{});return run;
  }
  return {load,save};
}
