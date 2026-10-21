import {useEffect,useRef,useState} from 'react';
import {createForteHistory} from './forte-history.js';
export function useForteNavigation(app,root,initial=root){
 const [screen,setScreen]=useState(()=>new URL(window.location.href).searchParams.get('forte_view')||initial),controller=useRef(null);
 useEffect(()=>{const nav=createForteHistory({app,root,initial,onChange:setScreen});controller.current=nav;setScreen(nav.screen);return()=>{nav.dispose();controller.current=null;};},[app,root]);
 const actions=useRef({navigate:(value,options)=>controller.current?.navigate(value,options),back:()=>controller.current?.back(),markClean:()=>controller.current?.markClean(),markDirty:()=>controller.current?.markDirty(),setGuard:fn=>controller.current?.setGuard(fn)});
 return [screen,(value,options)=>actions.current.navigate(typeof value==='function'?value(screen):value,options),actions.current];
}

// Layers retain their ancestors so Back closes only the top editor, including nested documents.
const layers=()=>window.history.state?.forteLayers||(window.history.state?.forteLayer?[window.history.state.forteLayer]:[]);
function pushLayer(name){const state=window.history.state||{},index=(state.forteUIIndex||0)+1;window.history.pushState({...state,forteLayer:name,forteLayers:[...layers().filter(n=>n!==name),name],forteLayerStart:{...state.forteLayerStart,[name]:index},forteUIIndex:index},'',window.location.href);}
export function useForteLayer(name,value,setValue){
 const latest=useRef({value,setValue}),saved=useRef(null),closing=useRef(false);latest.current={value,setValue};if(value)saved.current=value;
 useEffect(()=>{if(value){if(!layers().includes(name))pushLayer(name);}else if(layers().includes(name)){
  if(!saved.current){const state={...window.history.state},stack=layers().slice(0,layers().indexOf(name));state.forteLayers=stack;if(stack.length)state.forteLayer=stack.at(-1);else delete state.forteLayer;window.history.replaceState(state,'',window.location.href);return;}
  closing.current=true;const state=window.history.state;window.history.go(-Math.max(1,(state.forteUIIndex||1)-(state.forteLayerStart?.[name]||1)+1));
 }},[!!value,name]);
 useEffect(()=>{const pop=()=>{if(closing.current){closing.current=false;if(latest.current.value&&!layers().includes(name))pushLayer(name);return;}const open=layers().includes(name);if(!open&&latest.current.value){const event=new Event('forte:before-layer-close',{cancelable:true});window.dispatchEvent(event);if(event.defaultPrevented){window.history.forward();return;}latest.current.setValue(null);}else if(open&&!latest.current.value&&saved.current)latest.current.setValue(saved.current);};const navigate=()=>{if(latest.current.value)latest.current.setValue(null);};window.addEventListener('popstate',pop);window.addEventListener('forte:navigate',navigate);return()=>{window.removeEventListener('popstate',pop);window.removeEventListener('forte:navigate',navigate);};},[name]);
}
export function useForteTabs(name,initial,allowed){
 const first=allowed.includes(window.history.state?.forteTabs?.[name])?window.history.state.forteTabs[name]:initial;
 const [value,setValue]=useState(first);
 useEffect(()=>{const pop=()=>setValue(allowed.includes(window.history.state?.forteTabs?.[name])?window.history.state.forteTabs[name]:initial);window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[name,initial]);
 return [value,next=>{if(!allowed.includes(next)||next===value)return;const state=window.history.state||{};window.history.pushState({...state,forteTabs:{...state.forteTabs,[name]:next},forteUIIndex:(state.forteUIIndex||0)+1},'',window.location.href);setValue(next);}];
}

// Keep view filters in memory, scoped to the authenticated user and route; never credentials or business records.
const viewStates=new Map();
export function useForteViewState(name,initial,owner=''){
 const route=window.history.state?.forteNavigation;
 const key=JSON.stringify([owner,route?.app||'',route?.screen||'',name]);
 const [value,setValue]=useState(()=>viewStates.has(key)?viewStates.get(key):(typeof initial==='function'?initial():initial));
 useEffect(()=>{setValue(viewStates.has(key)?viewStates.get(key):(typeof initial==='function'?initial():initial));},[key]);
 return [value,next=>setValue(previous=>{const result=typeof next==='function'?next(previous):next;viewStates.set(key,result);if(viewStates.size>200)viewStates.delete(viewStates.keys().next().value);return result;})];
}
