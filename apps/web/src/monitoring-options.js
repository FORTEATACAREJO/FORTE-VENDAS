const mask=value=>String(value||'').replace(/Bearer\s+\S+/gi,'Bearer [REMOVIDO]').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g,'[TOKEN REMOVIDO]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[EMAIL REMOVIDO]').replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,'[CPF REMOVIDO]').replace(/\b(?:senha|password|token|secret|api[_-]?key)\s*[:=]\s*["']?[^\s,"'}]+/gi,'[SEGREDO REMOVIDO]').replace(/\b\d{6,}\b/g,'[NÚMERO REMOVIDO]');
const safeURL=value=>{try{const u=new URL(value);return u.origin+u.pathname;}catch{return undefined;}};
export function sanitizeMonitoringEvent(event){
 const result={event_id:event.event_id,timestamp:event.timestamp,platform:event.platform,level:event.level,release:event.release,environment:event.environment,logger:event.logger,message:event.message?mask(event.message):undefined,tags:{sistema:'FORTE VENDAS'}};
 if(event.exception?.values)result.exception={values:event.exception.values.map(e=>({type:mask(e.type),value:mask(e.value),mechanism:e.mechanism?{type:e.mechanism.type,handled:e.mechanism.handled}:undefined,stacktrace:e.stacktrace?{frames:(e.stacktrace.frames||[]).map(f=>({filename:safeURL(f.filename),function:mask(f.function),lineno:f.lineno,colno:f.colno,in_app:f.in_app}))}:undefined}))};
 // Explicit whitelist: no form values, user identity, cookies, request body,
 // breadcrumbs, application state, session recordings or arbitrary contexts.
 return result;
}
export function monitoringOptions(env){
 const dsn=String(env.VITE_SENTRY_DSN||'').trim();let valid=false;try{const u=new URL(dsn);valid=u.protocol==='https:'&&!!u.username&&/^\/\d+$/.test(u.pathname);}catch{}
 return {dsn:valid?dsn:undefined,enabled:env.PROD===true&&valid,environment:'production',release:'forte-vendas@'+(env.VITE_APP_RELEASE||'6.9.0'),sendDefaultPii:false,defaultIntegrations:false,autoSessionTracking:false,enableLogs:false,sampleRate:1,beforeSend:sanitizeMonitoringEvent};
}
