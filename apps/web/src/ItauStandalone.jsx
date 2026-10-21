import {useRef,useState} from 'react';
import {parseMoneyInput} from './financial.js';
import {todayBrazil} from './itau-report.js';

export default function ItauStandalone({data,onBankAction,onClose}){
 const [clienteId,setCliente]=useState(''),[motivo,setMotivo]=useState(''),[referencia,setReferencia]=useState('');
 const [valor,setValor]=useState(''),[vencimento,setVencimento]=useState(todayBrazil());
 const [juros,setJuros]=useState('0'),[multa,setMulta]=useState('0'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const request=useRef(null),inFlight=useRef(false),[validated,setValidated]=useState({});
 const bills=(data.boletosClientes||[]).filter(b=>b.origem==='AVULSO');
 async function prepare(e){
  e.preventDefault();if(inFlight.current)return;
  const input={clienteId,motivo:motivo.trim(),referencia:referencia.trim(),valor:parseMoneyInput(valor),vencimento,jurosMes:parseMoneyInput(juros),multa:parseMoneyInput(multa)};
  if(!clienteId||!input.motivo||!Number.isFinite(input.valor)||input.valor<=0||Math.abs(input.valor*100-Math.round(input.valor*100))>0.000001)return setMessage('Informe cliente, motivo e valor positivo com até duas casas decimais.');
  if(!vencimento||vencimento<todayBrazil()||[input.jurosMes,input.multa].some(n=>!Number.isFinite(n)||n<0||n>99.99))return setMessage('Confira o vencimento, juros e multa.');
  const signature=JSON.stringify(input);if(!request.current||request.current.signature!==signature)request.current={signature,id:crypto.randomUUID()};
  inFlight.current=true;setBusy(true);setMessage('Salvando cobrança…');
  try{await onBankAction({action:'CREATE_STANDALONE',requestId:request.current.id,...input});setMessage('Cobrança salva em contas a receber. Valide no Itaú antes de registrar. Nenhum boleto foi registrado no banco nesta etapa.');}
  catch(e){setMessage(e.message||'Não foi possível confirmar. Tente novamente com os mesmos dados para conferir a solicitação.');}
  finally{inFlight.current=false;setBusy(false);}
 }
 async function bank(b,action){
  if(inFlight.current)return;
  if(action==='REGISTER'&&!confirm(`Registrar boleto avulso de R$ ${Number(b.valor).toFixed(2)} para ${b.cliente}, vencimento ${b.vencimento}?`))return;
  inFlight.current=true;setBusy(true);setMessage('Conferindo com o Itaú…');
  try{const r=await onBankAction({action,boletoId:b.id});if(action==='VALIDATE'){if(!r.ok||r.registered!==false||r.receipt?.etapa!=='validacao')throw Error('Validação não confirmada.');setValidated(v=>({...v,[b.id]:JSON.stringify(b)}));setMessage('Validado, sem registro. Confira e solicite o registro quando autorizado.');}else setMessage(r.registered?'Boleto registrado e confirmado pelo Itaú.':'Resultado em conferência. Não repita o registro.');}
  catch(e){setMessage(e.message||'Resultado não confirmado. Confira antes de repetir.');}
  finally{inFlight.current=false;setBusy(false);}
 }
 return <div className="modalBackdrop"><section className="modal wide" role="dialog" aria-modal="true" aria-label="Boleto avulso"><div className="sectionHead"><h2>NOVO BOLETO AVULSO</h2><button type="button" disabled={busy} onClick={onClose}>FECHAR</button></div>
  <p>Carteira 109 · Sem vínculo com venda. A cobrança fica em contas a receber, sem movimentar estoque ou caixa. Espécie: diversos.</p>
  <form onSubmit={prepare}><fieldset disabled={busy} style={{border:0,padding:0}}><div className="miniGrid">
   <label>CLIENTE<select required value={clienteId} onChange={e=>setCliente(e.target.value)}><option value="">SELECIONE...</option>{(data.clientes||[]).filter(c=>c.ativo!==false).map(c=><option key={c.id} value={c.id}>{c.razaoSocial||c.nome}</option>)}</select></label>
   <label>MOTIVO DA COBRANÇA<input required maxLength={200} value={motivo} onChange={e=>setMotivo(e.target.value)}/></label>
   <label>REFERÊNCIA (OPCIONAL)<input maxLength={10} value={referencia} onChange={e=>setReferencia(e.target.value)}/></label>
   <label>VALOR (R$)<input required inputMode="decimal" value={valor} onChange={e=>setValor(e.target.value)}/></label>
   <label>VENCIMENTO<input required type="date" min={todayBrazil()} value={vencimento} onChange={e=>setVencimento(e.target.value)}/></label>
   <label>JUROS AO MÊS (%)<input required type="number" min="0" max="99.99" step="0.01" value={juros} onChange={e=>setJuros(e.target.value)}/></label>
   <label>MULTA (%)<input required type="number" min="0" max="99.99" step="0.01" value={multa} onChange={e=>setMulta(e.target.value)}/></label>
  </div><button type="submit">SALVAR COBRANÇA AVULSA</button></fieldset></form><p role="status">{message}</p>
  <h3>BOLETOS AVULSOS</h3>{!bills.length&&<p>Nenhuma cobrança avulsa cadastrada.</p>}{bills.slice().reverse().map(b=><article className="transportBox" key={b.id}><b>{b.cliente} · {b.referencia||'AVULSO'}</b><p>{b.motivo} · R$ {Number(b.valor).toFixed(2)} · {b.vencimento} · {b.status}</p><div className="actions"><button type="button" disabled={busy||!!b.idCobranca||b.status==='CANCELADO'||!!b.nossoNumero} onClick={()=>bank(b,'VALIDATE')}>VALIDAR NO ITAÚ</button><button type="button" disabled={busy||validated[b.id]!==JSON.stringify(b)||!!b.idCobranca||b.status==='CANCELADO'||!!b.nossoNumero} onClick={()=>bank(b,'REGISTER')}>REGISTRAR BOLETO AVULSO</button></div>{b.linhaDigitavel&&<p>LINHA DIGITÁVEL: {b.linhaDigitavel}</p>}</article>)}
 </section></div>;
}
