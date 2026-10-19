import React,{useEffect,useRef} from 'react';
import {renderGmailCentral} from './gmail-central.js';
export default function GmailCentral({client}){const host=useRef(null);useEffect(()=>{if(host.current)renderGmailCentral({client,host:host.current,app:'financeiro'});},[client]);return <section className="panel"><h2>GMAIL CENTRAL — CONFERÊNCIA FINANCEIRA</h2><p>Documentos originais, boletos e vínculos em análise. Nenhum pagamento automático.</p><div ref={host}/></section>;}
