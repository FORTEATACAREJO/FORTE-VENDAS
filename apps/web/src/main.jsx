import {startAccess} from "./access-standard.js";
import {supabase} from "./supabase.js";
import React from "react";import{createRoot}from"react-dom/client";import AuthGate from"./AuthGate.jsx";import"./styles.css";import"./App.css";
class ErrorBoundary extends React.Component{constructor(p){super(p);this.state={error:null}}static getDerivedStateFromError(error){return{error}}componentDidCatch(error,info){console.error("FORTE VENDAS UI ERROR",error,info)}render(){if(this.state.error)return <div style={{padding:24,fontFamily:"Arial"}}><h2>FORTE VENDAS — ERRO DE TELA</h2><p>O módulo encontrou um erro e foi protegido para não deixar a tela totalmente branca.</p><pre style={{whiteSpace:"pre-wrap",background:"#f6f6f6",padding:12}}>{String(this.state.error?.message||this.state.error)}</pre><button onClick={()=>location.reload()}>RECARREGAR SISTEMA</button></div>;return this.props.children}}
if(supabase)startAccess({client:supabase,app:"vendas",content:document.getElementById("root")}).ready.then(()=>createRoot(document.getElementById("root")).render(<ErrorBoundary><AuthGate/></ErrorBoundary>));
else document.getElementById("root").textContent="Conexão não configurada. Contate o administrador.";

if ("serviceWorker" in navigator && import.meta.env.PROD) window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(console.error));

