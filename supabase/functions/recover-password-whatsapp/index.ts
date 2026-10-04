Deno.serve(async req=>{
const origin=req.headers.get("origin")||"";
if(req.method!=="POST"&&req.method!=="OPTIONS")return Response.json({error:"Requisição não permitida."},{status:405});
try{
const body=req.method==="POST"?JSON.stringify({...await req.json(),canal:"whatsapp"}):undefined;
return await fetch(Deno.env.get("SUPABASE_URL")+"/functions/v1/recover-password-email",{method:req.method,headers:{"content-type":"application/json",apikey:Deno.env.get("SUPABASE_ANON_KEY")!,origin},body});
}catch{return Response.json({error:"Não foi possível solicitar a recuperação."},{status:503})}
});
