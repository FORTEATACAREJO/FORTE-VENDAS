const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{parse}=require('@babel/parser'),traverse=require('@babel/traverse').default;
test('legacy sale edit shortcuts resolve an imported editor and use the server workflow',()=>{
 const ast=parse(fs.readFileSync('apps/web/src/App.jsx','utf8'),{sourceType:'module',plugins:['jsx']});let count=0;
 traverse(ast,{JSXOpeningElement(p){if(p.node.name.name!=='EditSale')return;count++;const binding=p.scope.getBinding('EditSale');assert(binding,'EditSale must be defined at render');assert.equal(binding.path.parent.source.value,'./EditSale.jsx');const props=p.node.attributes;assert(props.some(x=>x.name?.name==='onCommit'&&x.value.expression.name==='commitOrderWorkflow'));assert(!props.some(x=>x.name?.name==='onSave'));}});assert.equal(count,1);
});
