import {test,expect} from '@playwright/test';
const apps=[['Vendas','https://forte-vendas.onrender.com/'],['Financeiro','https://forte-financeiro.onrender.com/'],['Fiscal','https://forte-fiscal.onrender.com/'],['Frete','https://forte-frete.onrender.com/'],['Carga Direta','https://forte-carga-direta.onrender.com/'],['Venda Externa','https://forte-venda-externa.onrender.com/'],['Pátio','https://forte-operador-patio.onrender.com/'],['Site Administração','https://site-forte-atacarejo.onrender.com/admin.html']];
for(const [name,url] of apps)test(`${name}: acesso, cadastro e recuperação publicados`,async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});expect(response.status()).toBe(200);
 const gate=page.locator('.forte-access');await expect(gate).toBeVisible();
 await expect(gate.locator('input[name="cpf"]')).toBeVisible();await expect(gate.locator('input[name="password"]')).toBeVisible();
 await expect(gate.getByRole('button',{name:'ENTRAR',exact:true})).toBeVisible();
 await gate.getByRole('button',{name:/CRIAR.*RECUPERAR|RECUPERAR.*SENHA|ESQUECI/i}).click();
 await expect(gate.locator('select[name="canal"]')).toHaveValue('whatsapp');
 await gate.locator('select[name="canal"]').selectOption('email');await expect(gate.locator('input[name="contact"]')).toHaveAttribute('type','email');
 await gate.getByRole('button',{name:'PRIMEIRO CADASTRO',exact:true}).click();
 await expect(gate.locator('input[name="nome"]')).toBeVisible();await expect(gate.locator('input[name="whatsapp"]')).toBeVisible();
 await expect(gate.locator('input[name="email"]')).not.toHaveAttribute('required','');
 await expect(gate.locator('input[name="password"]')).toHaveAttribute('pattern','[0-9]{6,}');
 await expect(gate.locator('input[name="confirm"]')).toBeVisible();
 const width=await gate.evaluate(el=>({scroll:el.scrollWidth,width:el.clientWidth}));expect(width.scroll).toBeLessThanOrEqual(width.width+2);
 expect(errors).toEqual([]);await info.attach('tela-publicada',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
});
test('Central: oito aplicativos e destinos corretos',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('https://site-forte-atacarejo.onrender.com/sistemas.html',{waitUntil:'domcontentloaded'});
 for(const [,url] of apps){const origin=new URL(url).origin;const matches=await page.locator('a[href]').evaluateAll((links,origin)=>links.filter(a=>{try{return new URL(a.href).origin===origin}catch{return false}}).length,origin);expect(matches,origin).toBeGreaterThan(0);}
 expect(errors).toEqual([]);await info.attach('central',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
});
test('Site: catálogo, marcas e orçamento',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('https://site-forte-atacarejo.onrender.com/',{waitUntil:'domcontentloaded'});await expect(page.locator('body')).toContainText(/CIPLAN/i);await expect(page.locator('body')).toContainText(/CSN/i);
 const budget=page.getByRole('link',{name:/ORÇAMENTO/i}).first();await expect(budget).toBeVisible();await budget.click();
 await expect(page.locator('body')).toContainText(/WhatsApp/i);expect(errors).toEqual([]);await info.attach('catalogo-orcamento',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
});
test('Central: telas pequenas e texto ampliado sem rolagem horizontal',async({page})=>{
 await page.goto('https://site-forte-atacarejo.onrender.com/sistemas.html',{waitUntil:'domcontentloaded'});
 for(const width of [320,390,768,1440])for(const font of ['16px','32px']){
  await page.setViewportSize({width,height:1100});await page.evaluate(font=>document.documentElement.style.fontSize=font,font);
  const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));expect(size.scroll,`${width}px / ${font}`).toBeLessThanOrEqual(size.width+1);
 }
});
