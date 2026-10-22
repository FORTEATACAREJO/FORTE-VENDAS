const extensions={
 'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp',
 'application/pdf':'pdf','audio/ogg':'ogg','audio/mpeg':'mp3','audio/mp4':'m4a',
 'audio/aac':'aac','audio/amr':'amr','video/mp4':'mp4','video/3gpp':'3gp',
};
function detectedType(bytes){
 const starts=(...values)=>values.every((v,i)=>bytes[i]===v);
 if(starts(0xff,0xd8,0xff))return 'image/jpeg';
 if(starts(137,80,78,71,13,10,26,10))return 'image/png';
 if(starts(71,73,70,56,55,97)||starts(71,73,70,56,57,97))return 'image/gif';
 if(starts(82,73,70,70)&&[87,69,66,80].every((v,i)=>bytes[i+8]===v))return 'image/webp';
 if(starts(37,80,68,70,45))return 'application/pdf';
 return null;
}
export function prepareWhatsappMedia(file){
 const bytes=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0));
 const reported=String(file.mime||'').split(';')[0].trim().toLowerCase();
 const mime=detectedType(bytes)||(extensions[reported]?reported:'application/octet-stream');
 const extension=extensions[mime]||'bin';
 let name=String(file.filename||'anexo').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,'_').replace(/[. ]+$/g,'').slice(0,160)||'anexo';
 const current=name.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase();
 const compatible=current===extension||(extension==='jpg'&&current==='jpeg');
 if(!compatible){if((current&&Object.values(extensions).includes(current))||current==='jpeg'||current==='bin')name=name.slice(0,name.lastIndexOf('.'));name+='.'+extension;}
 if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(name))name='anexo-'+name;
 return {blob:new Blob([bytes],{type:mime}),mime,filename:name,previewable:mime==='application/pdf'||['image/jpeg','image/png','image/gif','image/webp'].includes(mime)};
}
