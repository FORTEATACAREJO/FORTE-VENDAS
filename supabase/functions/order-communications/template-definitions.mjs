export function documentTemplateDefinitions(headerHandle){
 if(!headerHandle)throw Error('Anexe um PDF de exemplo antes de preparar os modelos.');
 return [
  {name:'forte_pedido_fornecedor_pdf',text:'Forte Atacarejo Ltda — Pedido {{1}}. Encaminhamos o pedido ao fornecedor referente à operação {{2}}. Confira o PDF anexo e responda com a confirmação e o número oficial do pedido.',example:['COMP-001','COMP-001']},
  {name:'forte_ordem_carregamento_pdf',text:'Forte Atacarejo Ltda — Ordem de carregamento. Pedido do fornecedor {{1}}. Local de retirada: {{2}}. Apresente o pedido e confira as instruções do PDF anexo antes do carregamento.',example:['PEDIDO-MODELO','Local de carregamento']}
 ].map(t=>({name:t.name,language:'pt_BR',category:'UTILITY',parameter_format:'POSITIONAL',components:[{type:'HEADER',format:'DOCUMENT',example:{header_handle:[headerHandle]}},{type:'BODY',text:t.text,example:{body_text:[t.example]}}]}));
}
