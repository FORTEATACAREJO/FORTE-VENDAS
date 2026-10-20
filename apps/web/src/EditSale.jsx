import {useRef,useState} from 'react';
import SaleEditor from './SaleEditor.jsx';
import './operation-sheet.css';
// Legacy list and search shortcuts use the same editor/action as the operation sheet.
export default function EditSale({sale,data,canEdit=false,onCommit,onClose}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const lock=useRef(false),pending=useRef(new Map());
 const sales=sale?(data.vendas||[]).filter(v=>sale.grupoPedidoId?v.grupoPedidoId===sale.grupoPedidoId:v.id===sale.id):[];
 async function run(body){
  if(lock.current||!canEdit)throw Error('Edição indisponível.');
  lock.current=true;setBusy(true);setError('');
  const signature=JSON.stringify(body);let requestId=pending.current.get(signature);
  if(!requestId){requestId=crypto.randomUUID();pending.current.set(signature,requestId);}
  try{const result=await onCommit({...body,requestId});pending.current.delete(signature);return result;}
  catch(e){setError(e.message||'Não foi possível salvar a edição.');throw e;}
  finally{lock.current=false;setBusy(false);}
 }
 return <div className="modalBackdrop"><section className="modal wide" role="dialog" aria-modal="true" aria-label="Editar venda"><div className="modalHead"><h2>EDITAR VENDA</h2><button type="button" disabled={busy} onClick={onClose}>Fechar</button></div>{error&&<p role="alert" className="sheet-error">{error}</p>}{!sales.length?<p role="alert">Venda não localizada. Feche esta janela e atualize os dados.</p>:<><p>{sale.cliente} • {sale.numeroVenda}</p>{!canEdit&&<p role="alert">Seu perfil não permite editar esta venda.</p>}<SaleEditor key={sale.grupoPedidoId||sale.id} row={{id:sale.grupoPedidoId||sale.id,sales}} run={run} busy={busy||!canEdit} onSaved={onClose}/></>}</section></div>;
}
