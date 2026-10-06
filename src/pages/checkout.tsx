import {useRef} from 'react';
import {Link,useNavigate,useParams,useSearchParams} from 'react-router-dom';
import {Check} from 'lucide-react';
import {Breadcrumb,Empty,FormError,NotFound,PageTitle,ShippingProgress,SummaryItems,Totals,NONE,useSubmit} from '@/components/common';
import {AddressFields,AddressText,addressFrom} from '@/components/address-fields';
import {CartLine,PromoBox,bagCount,useBag,useBagTotals,useStartCheckout} from '@/components/cart';
import {useApp} from '@/lib/store';
import {DELIVERY,PAYMENTS,totals,type Delivery} from '@/lib/rules';
import {date,money,uuid} from '@/lib/utils';
import type {Order} from '@/lib/types';
export function Cart(){
 const cart=useBag(),t=useBagTotals(),checkout=useStartCheckout(),count=bagCount(cart);
 return<div className="page-wrap"><Breadcrumb parts={[{label:'Your bag'}]}/><PageTitle title="Your bag." copy={count?`${count} ${count===1?'pair':'pairs'}, one fresh perspective.`:undefined}/>
  {cart.length?<div className="bag-page"><section><ShippingProgress t={t}/>{cart.map(l=><CartLine key={l.id} line={l}/>)}<Link className="text-button" to="/catalog" style={{display:'inline-block',marginTop:25}}>Keep exploring</Link></section><aside className="summary-box"><h3>Order summary</h3><Totals t={t}/><PromoBox/><button type="button" className="button full" style={{marginTop:24}} onClick={checkout}>Continue to checkout</button><p className="form-note">Demo checkout · No real payment is collected.</p></aside></div>
  :<Empty title="A little room for a new favorite." copy="Your bag is empty. Find a frame you love, then choose the lenses that suit your day."/>}</div>
}
const STEPS=['Your details','Delivery','Review & pay'];
export function Checkout(){
 const[params]=useSearchParams(),navigate=useNavigate(),cart=useBag(),user=useApp(s=>s.user),addresses=useApp(s=>s.addresses??NONE),draft=useApp(s=>s.draft),setDraft=useApp(s=>s.setDraft),clearDraft=useApp(s=>s.clearDraft),promo=useApp(s=>s.promo),perform=useApp(s=>s.perform);
 // One key per checkout visit: a retried submit after a dropped response returns the same order instead of a second one.
 const key=useRef(uuid());const{error,busy,submit}=useSubmit();
 const delivery:Delivery=draft.delivery??'standard',t=useBagTotals(delivery),member=user&&!user.guest;
 if(!cart.length)return<div className="page-wrap"><Empty title="Your bag is empty." copy="Choose a pair before continuing to checkout."/></div>;
 const saved=addresses.find(a=>a.isDefault)??addresses[0],a=draft.address??(member&&saved?{...saved,email:user.email}:{email:member?user.email:''});
 const step=draft.address?Math.min(3,Math.max(1,Number(params.get('step'))||1)):1;
 const edit=(n:number)=><Link className="text-button small" to={'/checkout?step='+n} style={{display:'inline-block',marginTop:12}}>{n===1?'Edit details':'Change delivery'}</Link>;
 const standardShipping=totals(t.subtotal,promo,'standard').shipping;
 return<div className="page-wrap"><Breadcrumb parts={[{label:'Your bag',to:'/cart'},{label:'Checkout'}]}/><div className="checkout-layout"><section className="checkout-form">
  <div className="checkout-steps">{STEPS.map((l,i)=><span key={l} className={i+1===step?'active':undefined}><i>{i+1<step?'✓':i+1}</i>{l}</span>)}</div>
  {step===1?<><h2>Where should we send your pair?</h2><p>{member?`Shopping as ${user.firstName}.`:<>Checkout as a guest, or <Link className="text-button" to="/account?next=checkout">sign in</Link> to save your details.</>}</p>
   {member&&addresses.length>0&&<div className="field" style={{marginBottom:22}}><label htmlFor="saved-address">Use a saved address</label><select id="saved-address" defaultValue="" onChange={e=>{const x=addresses.find(x=>x.id===e.target.value);if(x){const{id:_,isDefault:__,...rest}=x;setDraft({address:{...rest,email:user.email}})}}}><option value="">Choose an address</option>{addresses.map(x=><option key={x.id} value={x.id}>{x.line1+', '+x.city}</option>)}</select></div>}
   <form onSubmit={submit(f=>{setDraft({address:{email:f.email.toLowerCase(),...addressFrom(f)},saveAddress:!!f.saveAddress});navigate('/checkout?step=2')})}><AddressFields address={a} contact/>{member&&<label className="check-label" style={{marginTop:20}}><input type="checkbox" name="saveAddress" defaultChecked={draft.saveAddress??true}/> Save this address in my account</label>}<p className="form-note">Your details are saved with your order in this demo store.</p><FormError message={error}/><div className="form-actions"><Link className="text-button" to="/cart">Back to bag</Link><button className="button" type="submit">Continue to delivery</button></div></form></>
  :step===2?<><h2>Choose your delivery.</h2><div className="detail-box"><p><AddressText a={a}/></p>{edit(1)}</div>
   <form onSubmit={submit(f=>{setDraft({delivery:f.delivery==='express'?'express':'standard'});navigate('/checkout?step=3')})}>{(['standard','express'] as const).map(d=><label key={d} className="radio-card"><input type="radio" name="delivery" value={d} defaultChecked={delivery===d}/><div><strong>{DELIVERY[d].name} delivery</strong><p>{DELIVERY[d].days} business days · Prescription lenses add 3–5 days.</p></div><span className="choice-price">{d==='express'?money(DELIVERY.express.price):standardShipping?money(standardShipping):'Complimentary'}</span></label>)}<div className="form-actions"><Link className="text-button" to="/checkout?step=1">Back to details</Link><button className="button">Review your order</button></div></form></>
  :<><h2>One last look.</h2><div className="detail-box"><h3>Deliver to</h3><p>{a.email}<br/><AddressText a={a}/></p>{edit(1)}</div><div className="detail-box"><h3>{DELIVERY[delivery].name} delivery</h3><p>{DELIVERY[delivery].days} business days, plus lens preparation where needed.</p>{edit(2)}</div>
   <form onSubmit={submit(async f=>{const r=await perform<{order:Order}>('/checkout','POST',{address:draft.address,delivery,payment:f.payment,coupon:promo??'',terms:!!f.terms,saveAddress:!!(member&&draft.saveAddress),idempotencyKey:key.current},{silent:true});clearDraft();navigate('/confirmation/'+r.order.id,{replace:true})})}>
    <div className="payment-notice"><strong>Demo payment</strong>This is a working demo checkout. No money will be charged, no card details are needed, and no physical order will be sent.</div>
    <label className="radio-card"><input type="radio" name="payment" value={PAYMENTS[0]} defaultChecked/><div><strong>Test card ···· 4242</strong><p>Simulates a successful payment.</p></div></label><label className="radio-card"><input type="radio" name="payment" value={PAYMENTS[1]}/><div><strong>Cash on delivery</strong><p>Records payment due on delivery in this demo.</p></div></label>
    <label className="check-label" style={{marginTop:25,lineHeight:1.6}}><input type="checkbox" name="terms" required/><span>I agree to the <Link className="text-button small" to="/legal?type=terms">terms</Link> and understand this is a demo order.</span></label>
    <FormError message={error}/><div className="form-actions"><Link className="text-button" to="/checkout?step=2">Back to delivery</Link><button className="button" type="submit" disabled={busy}>Place demo order · {money(t.total)}</button></div></form></>}
 </section><aside className="summary-box"><h3>Your selection <span className="muted small">({bagCount(cart)})</span></h3><SummaryItems items={cart}/><Totals t={t}/><PromoBox/><p className="form-note">Prices and tax are illustrative. This is a demo store.</p></aside></div></div>
}
export function Confirmation(){
 const{id}=useParams(),o=useApp(s=>s.orders?.find(o=>o.id===id));if(!o)return<NotFound/>;
 return<div className="page-wrap"><div className="confirmation"><div className="confirm-icon"><Check aria-hidden="true"/></div><span className="eyebrow">A new perspective, on its way</span><h1>Looks like a good choice.</h1><p>Your demo order <strong>{o.id}</strong> is saved. You can track its progress and manage it below. No payment was collected or email sent.</p>
  <div className="detail-box" style={{textAlign:'left',marginTop:35}}><SummaryItems items={o.items}/><Totals t={{...o,promo:o.coupon}}/><p className="form-note">Order placed {date(o.createdAt)} · {o.paymentMethod}</p></div><Link className="button" to={'/order/'+o.id}>View your order</Link><Link className="button outline" to="/catalog">Keep exploring</Link></div></div>
}
