import {useState,type FormEvent} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {toast} from 'sonner';
import {Modal,Empty,ProductImage,ShippingProgress,NONE} from './common';
import {LensEditor} from './lens-editor';
import {useApp} from '@/lib/store';
import {lensLabel,promoError,totals,type Delivery} from '@/lib/rules';
import {money} from '@/lib/utils';
import type {CartLine as Line} from '@/lib/types';
export const useBag=()=>useApp(s=>s.cart??NONE);
export const bagCount=(cart:Line[])=>cart.reduce((n,l)=>n+l.quantity,0);
export function useBagTotals(delivery:Delivery='standard'){const cart=useBag(),promo=useApp(s=>s.promo);return totals(cart.reduce((n,l)=>n+l.unitPrice*l.quantity,0),promo,delivery,cart.length>0)}
// Client-side preview of the server's stock check, so checkout doesn't start with a bag it would reject.
export function bagProblem(cart:Line[]){if(!cart.length)return 'Your bag is empty.';for(const l of cart){const wanted=cart.filter(x=>x.productId===l.productId).reduce((n,x)=>n+x.quantity,0);if(wanted>l.product.stock)return `${l.product.name} has only ${l.product.stock} pairs available. Adjust the quantity in your bag.`}return ''}
export function useStartCheckout(){const navigate=useNavigate(),cart=useBag();return()=>{const problem=bagProblem(cart);if(problem)toast(problem);else navigate('/checkout?step=1')}}
export function CartLine({line}:{line:Line}){
 const perform=useApp(s=>s.perform),busy=useApp(s=>s.busy)>0,cart=useBag();const[editing,setEditing]=useState(false);const p=line.product;
 const others=cart.filter(l=>l.productId===p.id&&l.id!==line.id).reduce((n,l)=>n+l.quantity,0);
 const setQuantity=(quantity:number)=>perform('/cart/'+line.id,'PATCH',{quantity}).catch(()=>{});
 const remove=async()=>{const{productId,size,color,lens,coating,prescription,quantity}=line;try{await perform('/cart/'+line.id,'DELETE')}catch{return}toast('Pair removed from your bag.',{action:{label:'Undo',onClick:()=>perform('/cart','POST',{productId,size,color,lens,coating,prescription,quantity}).then(()=>toast('Pair restored to your bag.'),()=>{})}})};
 return<article className="cart-line"><Link className="cart-image" to={'/product/'+p.id}><ProductImage product={p} color={line.color}/></Link><div>
  <div className="line-top"><Link to={'/product/'+p.id}><h3>{p.name}</h3></Link><span>{money(line.unitPrice*line.quantity)}</span></div>
  <p className="line-meta">{line.color} / {line.size}<br/>{lensLabel(p.category,line.lens,line.coating)}{line.prescription&&<><br/>Prescription on file for this pair</>}</p>
  <div className="line-bottom"><div className="qty-control"><button type="button" aria-label={`Decrease ${p.name} quantity`} disabled={busy||line.quantity<=1} onClick={()=>setQuantity(line.quantity-1)}>−</button><span aria-live="polite">{line.quantity}</span><button type="button" aria-label={`Increase ${p.name} quantity`} disabled={busy||line.quantity>=20||line.quantity+others>=p.stock} onClick={()=>setQuantity(line.quantity+1)}>+</button></div>
   <div style={{display:'flex',gap:12}}><button type="button" className="remove" onClick={()=>setEditing(true)}>Edit lenses</button><button type="button" className="remove" disabled={busy} onClick={remove}>Remove</button></div></div>
 </div>{editing&&<LensEditor product={p} value={line} onClose={()=>setEditing(false)} onSave={async s=>{await perform('/cart/'+line.id,'PATCH',{lens:s.lens,coating:s.coating,prescription:s.prescription},{silent:true});setEditing(false);toast('Lens selection saved.')}}/>}</article>
}
export function PromoBox(){
 const promo=useApp(s=>s.promo),setPromo=useApp(s=>s.setPromo),t=useBagTotals();
 const apply=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const code=String(new FormData(e.currentTarget).get('code')??'').trim().toUpperCase();const problem=promoError(code,t.subtotal);if(problem)return void toast(problem);setPromo(code);toast('Discount code applied.')};
 return<>{promo?<div className="discount-applied"><span>{promo} {t.discount?'applied':'requires $200 subtotal'}</span><button type="button" onClick={()=>setPromo(null)} aria-label="Remove discount code">×</button></div>:<form className="promo-form" onSubmit={apply}><input name="code" placeholder="Discount code" aria-label="Discount code" required/><button type="submit">Apply</button></form>}<p className="promo-hint">Try WELCOME10 for 10% off, or FORMA20 on $200+.</p></>
}
export function CartDrawer(){
 const open=useApp(s=>s.panel==='cart'),setPanel=useApp(s=>s.setPanel),cart=useBag(),t=useBagTotals(),checkout=useStartCheckout(),count=bagCount(cart);
 return<Modal open={open} onOpenChange={o=>setPanel(o?'cart':null)} title={'Your bag'+(count?` (${count})`:'')} variant="drawer">
  <div className="modal-body">{cart.length?<><ShippingProgress t={t}/>{cart.map(l=><CartLine key={l.id} line={l}/>)}</>:<Empty title="Room for a favorite." copy="Your bag is empty. Let’s find your next pair."/>}</div>
  {cart.length>0&&<div className="modal-footer"><div className="drawer-total"><span>Subtotal</span><strong>{money(t.subtotal)}</strong></div><p className="drawer-shipping">Delivery, discounts, and tax calculated at checkout.</p><button type="button" className="button full" onClick={checkout}>Continue to checkout</button><Link className="text-button" to="/cart" style={{display:'block',textAlign:'center',margin:'16px auto 0',width:'max-content'}}>View your bag</Link></div>}
 </Modal>
}
