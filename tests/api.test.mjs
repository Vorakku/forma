import {test,after,before} from 'node:test';
import assert from 'node:assert/strict';
import {createRuntime} from '../scripts/local-runtime.mjs';
import {randomUUID} from 'node:crypto';
let mf;
before(async()=>{mf=await createRuntime({persist:false})});
after(async()=>{await mf?.dispose()});
function client(){let cookie='';return{async request(path,method='GET',body){const r=await mf.dispatchFetch('http://localhost:4174/api'+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body!==undefined?JSON.stringify(body):undefined});const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return{status:r.status,data:await r.json()}}}}
const address={email:'ada@example.com',firstName:'Ada',lastName:'Lane',line1:'21 Street 302',city:'Phnom Penh',country:'Cambodia',postalCode:'120102',phone:'+855 12 345 678'};
const plain={size:'Standard',color:'Ink black',lens:'non-prescription',coating:'standard'};
const rx={pd:63,eyes:[{eye:'right',sphere:-1.25,cylinder:-.5,axis:90},{eye:'left',sphere:-1,cylinder:0,axis:0}]};
const checkout=(extra={})=>({address,delivery:'standard',payment:'Demo card',coupon:'',terms:true,idempotencyKey:randomUUID(),...extra});
test('FORMA shop: catalog, bag, checkout, orders, accounts and ownership',async t=>{
 const ada=client(),bob=client();let state,orderId;
 await t.test('bootstrap seeds 12 frames with sample reviews and isolated guests',async()=>{const a=await ada.request('/bootstrap'),b=await bob.request('/bootstrap');assert.equal(a.status,200);assert.ok(a.data.user.guest);assert.notEqual(a.data.user.id,b.data.user.id);assert.ok(!('passwordHash' in a.data.user));const p=await ada.request('/products');assert.equal(p.data.length,12);const ellis=p.data.find(x=>x.id==='p01');assert.equal(ellis.price,14500);assert.deepEqual(ellis.sizes,['Standard','Wide']);assert.equal(ellis.swatches.length,ellis.colors.length);assert.equal(ellis.reviewCount,3);const r=await ada.request('/products/p01/reviews');assert.equal(r.data.length,3);assert.ok(r.data.every(x=>x.sample))});
 await t.test('bag validates frame, lens and prescription choices',async()=>{
  assert.equal((await ada.request('/cart','POST',{productId:'p01',...plain,color:'Neon',quantity:1})).status,400);
  assert.equal((await ada.request('/cart','POST',{productId:'p01',...plain,lens:'single-vision',quantity:1})).data.error,'Add your prescription before adding this pair.');
  assert.equal((await ada.request('/cart','POST',{productId:'p01',...plain,lens:'single-vision',prescription:{...rx,eyes:[{...rx.eyes[0],axis:0},rx.eyes[1]]},quantity:1})).data.error,'Enter an axis for each non-zero cylinder.');
  assert.equal((await ada.request('/cart','POST',{productId:'p12',...plain,color:'Cobalt',quantity:1})).status,400,'sold-out frames cannot be added');
  const ok=await ada.request('/cart','POST',{productId:'p01',...plain,lens:'single-vision',coating:'blue-light',prescription:rx,quantity:1});assert.equal(ok.status,200);assert.equal(ok.data.cart[0].unitPrice,14500+5000+2500);assert.deepEqual(ok.data.cart[0].prescription,rx);
  const merged=await ada.request('/cart','POST',{productId:'p01',...plain,lens:'single-vision',coating:'blue-light',prescription:rx,quantity:1});assert.equal(merged.data.cart.length,1);assert.equal(merged.data.cart[0].quantity,2);
  assert.equal((await ada.request('/cart','POST',{productId:'p01',...plain,quantity:13})).status,400,'stock is checked across lines');
  state=(await ada.request('/cart/'+merged.data.cart[0].id,'PATCH',{lens:'non-prescription',coating:'standard',prescription:null})).data;assert.equal(state.cart[0].unitPrice,14500);assert.equal(state.cart[0].prescription,null);
  assert.equal((await bob.request('/cart/'+state.cart[0].id,'PATCH',{quantity:1})).status,404,'other shoppers cannot edit the line');
 });
 await t.test('checkout charges authoritative totals, decrements stock and is idempotent',async()=>{
  assert.equal((await ada.request('/checkout','POST',checkout({coupon:'NOPE'}))).status,400);
  assert.equal((await ada.request('/checkout','POST',checkout({terms:false}))).status,400);
  const input=checkout({coupon:'welcome10'});const r=await ada.request('/checkout','POST',input);assert.equal(r.status,201);const o=r.data.order;orderId=o.id;
  assert.match(o.id,/^FRM-/);assert.equal(o.subtotal,29000);assert.equal(o.discount,2900);assert.equal(o.shipping,0);assert.equal(o.tax,Math.round(26100*.08));assert.equal(o.total,26100+2088);assert.equal(o.status,'placed');assert.equal(r.data.state.cart.length,0);
  const again=await ada.request('/checkout','POST',input);assert.equal(again.data.order.id,o.id);
  const stock=(await ada.request('/products')).data.find(p=>p.id==='p01');assert.equal(stock.stock,12);assert.equal(stock.sold,2);
  assert.equal((await ada.request('/checkout','POST',checkout())).data.error,'Your bag is empty.');
 });
 await t.test('FORMA20 needs $200 and express shipping is always charged',async()=>{await bob.request('/cart','POST',{productId:'p09',size:'Standard',color:'Midnight',lens:'non-prescription',coating:'polarized',quantity:1});const r=await bob.request('/checkout','POST',checkout({coupon:'FORMA20',delivery:'express'}));assert.equal(r.data.order.discount,0);assert.equal(r.data.order.coupon,'');assert.equal(r.data.order.shipping,1800);assert.equal(r.data.order.subtotal,18000)});
 await t.test('orders are private and follow the delivery simulator and return flow',async()=>{
  assert.equal((await bob.request('/orders/'+orderId+'/advance','POST')).status,404);
  assert.equal((await ada.request('/orders/'+orderId+'/return','POST',{reason:'Other'})).status,400);
  for(const s of ['processing','shipped','delivered'])assert.equal((await ada.request('/orders/'+orderId+'/advance','POST')).data.orders.find(o=>o.id===orderId).status,s);
  assert.equal((await ada.request('/orders/'+orderId+'/cancel','POST')).status,400,'delivered orders cannot be cancelled');
  assert.equal((await ada.request('/orders/'+orderId+'/advance','POST')).status,400);
  const req=await ada.request('/orders/'+orderId+'/return','POST',{reason:'Prefer another style'});const o=req.data.orders.find(o=>o.id===orderId);assert.equal(o.status,'return_requested');assert.equal(o.returnReason,'Prefer another style');
  await ada.request('/orders/'+orderId+'/advance','POST');assert.equal((await ada.request('/products')).data.find(p=>p.id==='p01').stock,14,'completed returns restock');
 });
 await t.test('cancellation restocks once, reorder refills the bag',async()=>{await ada.request('/cart','POST',{productId:'p11',size:'Standard',color:'Gold / amber',lens:'non-prescription',coating:'standard',quantity:2});const o=(await ada.request('/checkout','POST',checkout())).data.order;assert.equal((await ada.request('/products')).data.find(p=>p.id==='p11').stock,3);const [a,b]=await Promise.all([ada.request('/orders/'+o.id+'/cancel','POST'),ada.request('/orders/'+o.id+'/cancel','POST')]);assert.ok([a.status,b.status].includes(200));assert.equal((await ada.request('/products')).data.find(p=>p.id==='p11').stock,5);const re=await ada.request('/orders/'+o.id+'/reorder','POST');assert.equal(re.data.cart[0].quantity,2)});
 await t.test('guest signup keeps the bag; reviews and addresses need an account',async()=>{
  assert.equal((await ada.request('/products/p01/reviews','POST',{rating:5,title:'Great',text:'Lovely frame, very light.'})).status,401);
  assert.equal((await ada.request('/addresses','POST',{...address,email:undefined})).status,401);
  const reg=await ada.request('/auth/register','POST',{firstName:'Ada',lastName:'Lane',email:'ADA@example.com',password:'demo-password'});assert.equal(reg.status,200);assert.equal(reg.data.user.guest,false);assert.equal(reg.data.user.email,'ada@example.com');assert.equal(reg.data.cart.length,1);assert.equal(reg.data.orders.length,2);
  assert.equal((await bob.request('/auth/register','POST',{firstName:'B',lastName:'B',email:'ada@example.com',password:'demo-password'})).status,409);
  const rv=await ada.request('/products/p01/reviews','POST',{rating:4,title:'Great fit',text:'Lovely frame, very light.'});assert.equal(rv.status,200);const list=(await ada.request('/products/p01/reviews')).data;assert.equal(list[0].author,'Ada L.');assert.equal(list[0].verified,false,'returned orders do not verify');assert.equal((await ada.request('/products/p01/reviews','POST',{rating:4,title:'Again',text:'Second review attempt.'})).status,409);
  const like=await bob.request('/reviews/'+list[0].id+'/like','POST');assert.deepEqual(like.data,{liked:true,likes:1});assert.equal((await bob.request('/reviews/'+list[0].id+'/comments','POST',{text:'Agreed!'})).status,401);
  const {email,...a}=address;const s1=await ada.request('/addresses','POST',a);assert.ok(s1.data.addresses[0].isDefault);const s2=await ada.request('/addresses','POST',{...a,line1:'9 Other Road',isDefault:true});assert.equal(s2.data.addresses.filter(x=>x.isDefault).length,1);assert.equal(s2.data.addresses.find(x=>x.isDefault).line1,'9 Other Road');
 });
 await t.test('login merges a guest bag and email-matched guest orders; logout ends the session',async()=>{
  const carol=client();await carol.request('/bootstrap');await carol.request('/cart','POST',{productId:'p04',size:'Standard',color:'Silver',lens:'reading',coating:'standard',prescription:{power:'1.25'},quantity:1});await carol.request('/checkout','POST',checkout());await carol.request('/cart','POST',{productId:'p04',size:'Standard',color:'Silver',lens:'non-prescription',coating:'standard',quantity:1});
  assert.equal((await carol.request('/auth/login','POST',{email:'ada@example.com',password:'wrong-password'})).status,401);
  const r=await carol.request('/auth/login','POST',{email:'ada@example.com',password:'demo-password'});assert.equal(r.status,200);assert.equal(r.data.cart.length,2);assert.equal(r.data.orders.length,3);
  await carol.request('/auth/logout','POST');assert.equal((await carol.request('/cart/x','DELETE')).status,401);
 });
 await t.test('password reset requires the demo verification code',async()=>{const eve=client();await eve.request('/bootstrap');const f=await eve.request('/auth/forgot','POST',{email:'ada@example.com'});assert.match(f.data.demoCode,/^\d{6}$/);assert.equal((await eve.request('/auth/reset','POST',{challengeId:f.data.challengeId,code:f.data.demoCode==='000000'?'111111':'000000',password:'new-password'})).status,400);assert.equal((await eve.request('/auth/reset','POST',{challengeId:f.data.challengeId,code:f.data.demoCode,password:'new-password'})).status,200);assert.equal((await eve.request('/auth/login','POST',{email:'ada@example.com',password:'new-password'})).status,200)});
 await t.test('newsletter, restock and support requests are stored',async()=>{assert.deepEqual((await bob.request('/newsletter','POST',{email:'x@example.com'})).data,{subscribed:true});assert.deepEqual((await bob.request('/newsletter','POST',{email:'X@example.com'})).data,{subscribed:false});assert.equal((await bob.request('/restock','POST',{productId:'p12',email:'x@example.com'})).status,200);const s=await bob.request('/support','POST',{name:'Bob',email:'b@example.com',topic:'Lenses',message:'Can I add a prescription later?'});assert.match(s.data.requests[0].id,/^HELP-/)});
});
