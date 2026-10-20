import {supabase,getAuthContext} from './supabase';
import {hashBlob} from './gmail';
export async function registerFreightReceipt(file,{data,cargaId,onCommit}){
 if(!file)return;
 const load=(data.cargas||[]).find(c=>c.id===cargaId&&c.status!=='CANCELADA');if(!load)throw Error('Vincule a carga antes de anexar o comprovante de frete.');
 if(load.modalidadeFrete==='CIF')throw Error('CIF não possui comprovante de frete separado.');
 if(!supabase||!onCommit)throw Error('Conecte ao sistema para guardar o comprovante compartilhado.');
 if(file.size>10*1024*1024||!(/\.(pdf|jpg|jpeg|png|webp)$/i.test(file.name)))throw Error('Use PDF ou imagem de até 10 MB.');
 const empresa=getAuthContext()?.profile?.empresa_id;if(!empresa)throw Error('Entre no sistema.');
 const hash=await hashBlob(file),path=empresa+'/'+crypto.randomUUID()+'/'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
 const {error}=await supabase.storage.from('forte-vendas-dossies').upload(path,file,{upsert:false,contentType:file.type||'application/pdf'});if(error)throw error;
 return onCommit({action:'DOCUMENT_ADD',requestId:crypto.randomUUID(),cargaId,categoria:'COMPROVANTE FRETE',path,hash,filename:file.name});
}
export async function openSharedProof(document){
 if(!document?.storagePath)throw Error('Comprovante compartilhado não localizado.');
 const {data,error}=await supabase.storage.from(document.storageBucket||'forte-vendas-dossies').createSignedUrl(document.storagePath,120);if(error)throw error;window.open(data.signedUrl,'_blank','noopener,noreferrer');
}
