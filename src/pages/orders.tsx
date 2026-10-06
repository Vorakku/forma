import {useState} from 'react';
import {Link,useNavigate,useParams} from 'react-router-dom';
import {toast} from 'sonner';
import {Package} from 'lucide-react';
import {Breadcrumb,Empty,Modal,NotFound,PageTitle,ProductImage,STATUS_LABEL,Status,Totals,NONE} from '@/components/common';
import {AddressText} from '@/components/address-fields';
import {useApp,useProduct} from '@/lib/store';
import {lensLabel,RETURN_REASONS,RETURN_WINDOW_MS} from '@/lib/rules';
import {date,money} from '@/lib/utils';
import type {Order,OrderItem} from '@/lib/types';
const FLOW=['placed','processing','shipped','delivered'] as const;
const Thumb=({item}:{item:OrderItem})=><ProductImage product={useProduct(item.productId)} color={item.color}/>;
export function OrderCard({o}:{o:Order}){return<article className="order-card"><div className="order-card-head"><div><strong>{o.id}</strong><small>{date(o.createdAt)} · {o.items.reduce((n,l)=>n+l.quantity,0)} pairs</small></div><Status status={o.status}/></div><div className="order-card-products">{o.items.map((l,i)=><Thumb key={i} item={l}/>)}</div><div className="order-card-foot"><span>Total {money(o.total)}</span><Link className="button small outline" to={'/order/'+o.id}>View order</Link></div></article>}
export function Orders(){
 const orders=useApp(s=>s.orders??NONE),guest=useApp(s=>s.user?.guest);
 return<div className="page-wrap"><Breadcrumb parts={[{label:'Your orders'}]}/><PageTitle title="Your perspectives." copy={guest?'Guest orders placed in this browser. Sign in to connect them to your account.':'Orders, deliveries, and the pairs you picked.'}/>{orders.length?<div style={{maxWidth:950}}>{orders.map(o=><OrderCard key={o.id} o={o}/>)}</div>:<Empty title="No orders just yet." copy="Your future favorites are waiting. Once you check out, your orders will appear here." label="Find your frame" icon={Package}/>}</div>
}
function downloadReceipt(o:Order){
 const a=o.address,lines=['FORMA EYEWEAR','Demo receipt — no real payment collected','',`Order: ${o.id}`,`Date: ${date(o.createdAt)}`,`Status: ${STATUS_LABEL[o.status]}`,'',...o.items.map(l=>`${l.name} / ${l.color} / ${l.size}\n${lensLabel(l.category,l.lens,l.coating)}\n${l.quantity} × ${money(l.price)} = ${money(l.quantity*l.price)}`),'',`Subtotal: ${money(o.subtotal)}`,`Discount: -${money(o.discount)}`,`Shipping: ${money(o.shipping)}`,`Estimated tax (8%): ${money(o.tax)}`,`Total: ${money(o.total)}`,`Payment: ${o.paymentMethod}`,'',`Deliver to: ${a.firstName} ${a.lastName}`,a.line1,a.line2,`${a.city}, ${a.postalCode}`,a.country,'','This receipt was generated in your browser. No email was sent.'];
 const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=o.id+'-receipt.txt';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('Your demo receipt is ready.');
}
export function OrderDetail(){
 const{id}=useParams(),o=useApp(s=>s.orders?.find(o=>o.id===id)),perform=useApp(s=>s.perform),busy=useApp(s=>s.busy)>0,navigate=useNavigate();
 const[modal,setModal]=useState<'cancel'|'return'|null>(null);
 if(!o)return<NotFound/>;
 const index=FLOW.indexOf(o.status as typeof FLOW[number]),deliveredAt=[...o.events].reverse().find(e=>e.status==='delivered')?.time;
 const act=(path:string,body?:unknown,message?:string)=>perform(`/orders/${o.id}/${path}`,'POST',body).then(()=>{setModal(null);if(message)toast(message)},()=>{});
 return<div className="page-wrap"><Breadcrumb parts={[{label:'Your orders',to:'/orders'},{label:o.id}]}/><div className="page-title"><div><span className="eyebrow">Placed {date(o.createdAt)}</span><h1>{o.id}</h1></div><Status status={o.status}/></div>
  <div className="order-detail-layout"><section>
   {index>=0&&<div className="timeline">{FLOW.map((s,i)=><div key={s} className={i<=index?'done':'upcoming'}><i/>{STATUS_LABEL[s]}</div>)}</div>}
   <div className="detail-box"><h3>Your pair{o.items.length>1?'s':''}</h3>{o.items.map((l,i)=><div key={i} className="order-summary-item"><Thumb item={l}/><div>{l.name}<small>{l.color} · {l.size} · Qty {l.quantity}<br/>{lensLabel(l.category,l.lens,l.coating)}</small></div><span>{money(l.price*l.quantity)}</span></div>)}</div>
   <div className="guide-grid"><div className="detail-box"><h3>Deliver to</h3><p><AddressText a={o.address}/><br/>{o.address.email}</p></div><div className="detail-box"><h3>Delivery & payment</h3><p>{o.shippingMethod==='express'?'Express':'Standard'} delivery<br/>{o.paymentMethod}<br/>{o.paymentMethod.startsWith('Cash')?'Payment due on delivery (simulated)':'Demo payment recorded'}{['cancelled','returned'].includes(o.status)&&<><br/>Refund recorded (simulated)</>}</p></div></div>
   <div style={{display:'flex',gap:12,flexWrap:'wrap'}}><button type="button" className="button outline" disabled={busy} onClick={()=>perform(`/orders/${o.id}/reorder`).then(()=>{toast('Your previous selection is back in the bag.');navigate('/cart')},()=>{})}>Buy again</button><button type="button" className="button outline" onClick={()=>downloadReceipt(o)}>Download receipt</button>
    {(o.status==='placed'||o.status==='processing')&&<button type="button" className="text-button" onClick={()=>setModal('cancel')}>Cancel order</button>}
    {o.status==='delivered'&&deliveredAt&&Date.now()-new Date(deliveredAt).getTime()<RETURN_WINDOW_MS&&<button type="button" className="text-button" onClick={()=>setModal('return')}>Request a return</button>}</div>
   {o.returnReason&&<p className="form-note">Return reason: {o.returnReason}</p>}
   <div className="detail-box" style={{marginTop:30,background:'var(--soft)'}}><h3>Delivery simulator</h3><p>This is a demo order. Advance its status to test tracking, delivery, and returns.</p>
    {index>=0&&index<3?<button type="button" className="button small outline" style={{marginTop:18}} disabled={busy} onClick={()=>act('advance',undefined,'Demo order updated: '+STATUS_LABEL[FLOW[index+1]]+'.')}>Advance to {STATUS_LABEL[FLOW[index+1]]}</button>
    :o.status==='return_requested'?<button type="button" className="button small outline" style={{marginTop:18}} disabled={busy} onClick={()=>act('advance',undefined,'Demo order updated: Returned.')}>Complete demo return</button>
    :<p className="form-note">{o.status==='delivered'?'Delivered. You can now request a return.':'This order has no remaining delivery steps.'}</p>}</div>
  </section><aside className="summary-box"><h3>Order total</h3><Totals t={{...o,promo:o.coupon}}/><Link className="text-button" to="/help" style={{marginTop:22,display:'inline-block'}}>Need a hand?</Link></aside></div>
  <Modal open={modal==='cancel'} onOpenChange={x=>{if(!x)setModal(null)}} title="Cancel this order?"><div className="modal-body"><p>Order {o.id} will be cancelled and its frames returned to stock. Any recorded demo payment will be marked refunded.</p></div><div className="modal-footer"><button type="button" className="button outline" onClick={()=>setModal(null)}>Keep order</button><button type="button" className="button" disabled={busy} onClick={()=>act('cancel',undefined,'Order cancelled. Stock restored.')}>Cancel demo order</button></div></Modal>
  <Modal open={modal==='return'} onOpenChange={x=>{if(!x)setModal(null)}} title="A different fit?"><form onSubmit={e=>{e.preventDefault();void act('return',{reason:new FormData(e.currentTarget).get('reason')},'Return request saved.')}}><div className="modal-body"><p>Return the entire demo order {o.id}.</p><div className="field"><label htmlFor="return-reason">Reason for return</label><select name="reason" id="return-reason">{RETURN_REASONS.map(r=><option key={r}>{r}</option>)}</select></div><p className="form-note">This creates a return request. Complete it with the delivery simulator to test the refund and stock update.</p></div><div className="modal-footer"><button className="button" disabled={busy}>Request demo return</button></div></form></Modal>
 </div>
}
