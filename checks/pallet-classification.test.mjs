import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyPalletDocument} from '../supabase/functions/gmail-central/pallets.mjs';
test('structured XML counts only pallet items in supported piece units',()=>{
 const result=classifyPalletDocument({kind:'XML_NFE',items:[{description:'PALLET MADEIRA',unit:'UN',quantity:20},{description:'PALETES',unit:'PC',quantity:10},{description:'CIMENTO 50KG',unit:'SC',quantity:800}]});assert.equal(result.quantity,30);assert.equal(result.items.length,2);assert.equal(result.requires_manual_review,true);
});
test('PDF, fractional count and weight units stay manual; no guessed quantity',()=>{
 for(const doc of [{kind:'DANFE',items:[{description:'PALLET',unit:'UN',quantity:30}]},{kind:'XML_NFE',items:[{description:'PALETE',unit:'KG',quantity:30}]},{kind:'XML_NFE',items:[{description:'PALLET',unit:'UN',quantity:1.5}]}]){const r=classifyPalletDocument(doc);assert.equal(r.candidate,true);assert.equal(r.quantity,null);}
 const pdf=classifyPalletDocument({kind:'DOCUMENTO'},'scan.pdf','','Nota fiscal de pallets');assert.equal(pdf.candidate,true);assert.equal(pdf.quantity,null);
});
test('ordinary merchandise is not turned into pallet stock; filename candidates remain visible',()=>{
 assert.deepEqual(classifyPalletDocument({kind:'XML_NFE',items:[{description:'Cimento',unit:'SC',quantity:800}]}),{candidate:false});assert.equal(classifyPalletDocument({kind:'DOCUMENTO'},'pallets.pdf').quantity,null);
});
