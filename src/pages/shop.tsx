import {useCallback,useEffect,useMemo,useState} from 'react';
import {Link,useNavigate,useParams,useSearchParams} from 'react-router-dom';
import {toast} from 'sonner';
import {Package,ShieldCheck,Truck,SlidersHorizontal,X,Heart,Search} from 'lucide-react';
import {Breadcrumb,Empty,FormError,Modal,NotFound,PageTitle,ProductCard,ProductGrid,ProductImage,RecentSection,Stars,WishlistButton,NONE,useSubmit} from '@/components/common';
import {LensEditor} from '@/components/lens-editor';
import {ProductGallery} from '@/components/product-gallery';
import {useApp,useProduct} from '@/lib/store';
import {api} from '@/lib/api';
import {FILTER_GROUPS,SORTS,PRICE_MIN,PRICE_MAX,PAGE_SIZE,catalogHref,colorIndex,filterProducts} from '@/lib/catalog';
import {lensLabel,lensPrice} from '@/lib/rules';
import {cn,date,money} from '@/lib/utils';
import type {LensSelection,Product,Review} from '@/lib/types';
const pick=(products:Product[],ids:string[])=>ids.map(id=>products.find(p=>p.id===id)).filter((p):p is Product=>!!p);
export function Home(){
 const products=useApp(s=>s.products),[ellis]=pick(products,['p03']),[jules]=pick(products,['p04']);
 return<>
  <section className="hero"><img src="/images/hero.webp" alt="A woman wearing black cat-eye glasses in natural light" width="1536" height="1024" fetchPriority="high"/><div className="hero-copy"><span className="eyebrow">The considered collection · 2026</span><h1>A new<br/>perspective.</h1><p>Distinctive frames. Effortless every day.</p><div className="hero-links"><Link className="button white" to="/catalog?category=optical">Discover optical</Link><Link className="button ghost-white" to="/catalog?category=sun">Explore sunglasses</Link></div></div><span className="hero-caption">Made to be seen. Designed to see.</span></section>
  <div className="service-strip"><span>Frames from $135, standard lenses included</span><span>Complimentary shipping on orders $150+</span><span>30 days to find your perfect fit</span></div>
  <section className="section"><div className="section-head"><div><span className="eyebrow">Our essentials</span><h2>Everyday icons.</h2></div><Link to="/catalog">View all frames</Link></div><ProductGrid products={pick(products,['p02','p03','p04','p01'])}/></section>
  <section className="editorial-grid"><div className="editorial-card"><span className="eyebrow">A little character</span><h2>Never quite<br/>ordinary.</h2><p>Rich acetate. Expressive shapes.<br/>Find a frame that feels like you.</p><Link className="text-button" to="/catalog?material=Acetate">Explore acetate</Link>{ellis&&<ProductImage product={ellis} className="editorial-product" loading="lazy"/>}</div><div className="editorial-card blue"><span className="eyebrow">Meet your lighter side</span><h2>Less frame.<br/>More you.</h2><p>Delicate lines, beautifully balanced.<br/>Our lightest metal essentials.</p><Link className="text-button" to="/catalog?material=Metal">Discover metal</Link>{jules&&<ProductImage product={jules} className="editorial-product" loading="lazy"/>}</div></section>
  <section className="manifesto"><span className="eyebrow">The FORMA way</span><h2>Good design is something<br/>you <span className="serif">feel</span>, every day.</h2><p>We believe your favorite pair should feel as natural as it looks. Considered shapes, thoughtful details, and nothing you don't need.</p><Link className="text-button" to="/about">Get to know FORMA</Link></section>
  <section className="section"><div className="section-head"><div><span className="eyebrow">A sunnier outlook</span><h2>Good days ahead.</h2></div><Link to="/catalog?category=sun">Shop sunglasses</Link></div><ProductGrid products={products.filter(p=>p.category==='sun')}/></section>
  <RecentSection/>
  <section className="promise-grid"><div><Package className="promise-icon" aria-hidden="true"/><h3>Everything you need</h3><p>Every frame comes with standard lenses, a protective case, and a cleaning cloth.</p></div><div><ShieldCheck className="promise-icon" aria-hidden="true"/><h3>Room to decide</h3><p>Take 30 days to get comfortable. Returns and exchanges start in your account.</p></div><div><Truck className="promise-icon" aria-hidden="true"/><h3>Good things, delivered</h3><p>Complimentary standard shipping on orders of $150 or more after discounts.</p></div></section>
 </>
}
function FilterControls({params,onChange,scope}:{params:URLSearchParams;onChange:(p:URLSearchParams)=>void;scope:string}){
 const[price,setPrice]=useState(Math.max(PRICE_MIN,Math.min(PRICE_MAX,Number(params.get('max'))||PRICE_MAX)));
 const toggle=(key:string,value:string,on:boolean)=>{const p=new URLSearchParams(params),kept=p.getAll(key).filter(v=>v!==value);p.delete(key);kept.forEach(v=>p.append(key,v));if(on)p.append(key,value);p.delete('page');onChange(p)};
 const commitPrice=()=>{if(String(price)===(params.get('max')??String(PRICE_MAX)))return;const p=new URLSearchParams(params);p.set('max',String(price));p.delete('page');onChange(p)};
 const check=(key:string,value:string,label:string)=><label key={key+value} className="check-label"><input type="checkbox" checked={params.getAll(key).includes(value)} onChange={e=>toggle(key,value,e.target.checked)}/>{label}</label>;
 return<>{Object.entries(FILTER_GROUPS).map(([key,options])=><details key={key} open><summary>{key==='fit'?'Frame width':key[0].toUpperCase()+key.slice(1)}</summary><div className="filter-options">{options.map(o=>check(key,o,o))}</div></details>)}
  <details open><summary>Price</summary><div className="filter-options"><label htmlFor={'max-price-'+scope} className="small">Up to <strong className="price-value">{money(price*100)}</strong></label><input className="range-input" id={'max-price-'+scope} type="range" min={PRICE_MIN} max={PRICE_MAX} step="5" value={price} onChange={e=>setPrice(Number(e.target.value))} onPointerUp={commitPrice} onKeyUp={commitPrice} onBlur={commitPrice}/><div className="range-labels"><span>${PRICE_MIN}</span><span>${PRICE_MAX}</span></div></div></details>
  <details><summary>Availability</summary><div className="filter-options">{check('stock','yes','In stock only')}{check('sale','yes','On sale')}</div></details></>
}
export function Catalog(){
 const[params]=useSearchParams(),navigate=useNavigate(),products=useApp(s=>s.products);
 const[draft,setDraft]=useState<URLSearchParams|null>(null);
 const list=useMemo(()=>filterProducts(products,params),[products,params]);
 const pageCount=Math.ceil(list.length/PAGE_SIZE),page=Math.max(1,Math.min(pageCount||1,Number(params.get('page'))||1)),visible=list.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
 const cat=params.get('category')??'',q=params.get('q');
 const title=q?`Results for “${q}”`:cat==='sun'?'A sunnier outlook.':cat==='optical'?'Everyday perspective.':'Find your frame.';
 const pills=[...params.entries()].filter(([k])=>['shape','material','fit','stock','sale','max','q'].includes(k));
 const go=(p:URLSearchParams)=>navigate('/catalog'+(p.size?'?'+p:''));
 const keepBasics=(p:URLSearchParams)=>{const keep=new URLSearchParams();for(const k of ['category','sort'])if(p.get(k))keep.set(k,p.get(k)!);return keep};
 const removePill=(key:string,value:string)=>{const p=new URLSearchParams(params),kept=p.getAll(key).filter(v=>v!==value);p.delete(key);kept.forEach(v=>p.append(key,v));p.delete('page');go(p)};
 const pageLink=(n:number,label?:string)=><Link key={label??n} to={catalogHref(params,{page:n})} className={!label&&page===n?'active':undefined} aria-current={!label&&page===n?'page':undefined} style={label?{width:'auto',padding:'0 12px'}:undefined} aria-label={label?label+' page':undefined}>{label??n}</Link>;
 return<div className="page-wrap"><Breadcrumb parts={[{label:'Eyewear'}]}/>
  <div className="page-title"><div><span className="eyebrow">The FORMA collection</span><h1>{title}</h1><p>Considered shapes. Beautiful details. Your next everyday pair.</p><div className="category-tabs">{[['','All eyewear'],['optical','Optical glasses'],['sun','Sunglasses']].map(([c,l])=><Link key={c} className={cat===c?'active':undefined} to={catalogHref(params,{category:c,page:null})}>{l}</Link>)}</div></div></div>
  <div className="catalog-layout"><aside className="filter-sidebar" aria-label="Filter products"><FilterControls params={params} onChange={go} scope="catalog"/><button type="button" className="text-button" style={{marginTop:20}} onClick={()=>go(keepBasics(params))}>Clear filters</button></aside>
   <section className="catalog-products"><div className="catalog-toolbar"><span>{list.length} frames</span><button type="button" className="filter-mobile-button" onClick={()=>setDraft(new URLSearchParams(params))}><SlidersHorizontal aria-hidden="true"/> Filters</button><label>Sort by <select aria-label="Sort products" value={params.get('sort')??'recommended'} onChange={e=>navigate(catalogHref(params,{sort:e.target.value,page:null}))}>{SORTS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label></div>
    {pills.length>0&&<div className="filter-pills">{pills.map(([k,v])=><button type="button" key={k+v} className="pill" onClick={()=>removePill(k,v)}>{k==='max'?'Under '+money(Number(v)*100):k==='stock'?'In stock':k==='sale'?'On sale':v}<X aria-hidden="true"/></button>)}</div>}
    <div className="product-grid">{visible.length?visible.map(p=><ProductCard key={p.id} product={p} compare/>):<Empty title="Nothing in this view." copy="Try another shape, widen your price range, or clear your filters." to="/catalog" label="Reset all filters" icon={Search}/>}</div>
    {pageCount>1&&<nav className="pagination" aria-label="Catalog pages">{page>1&&pageLink(page-1,'Previous')}{Array.from({length:pageCount},(_,i)=>pageLink(i+1))}{page<pageCount&&pageLink(page+1,'Next')}</nav>}
   </section></div>
  <Modal open={!!draft} onOpenChange={o=>{if(!o)setDraft(null)}} title="Find your frame." variant="drawer">{draft&&<><div className="modal-body"><div className="filter-sidebar" style={{display:'block'}}><FilterControls key={draft.toString()} params={draft} onChange={setDraft} scope="modal"/></div><button type="button" className="text-button" style={{marginTop:20}} onClick={()=>setDraft(keepBasics(draft))}>Clear filters</button></div><div className="modal-footer"><button type="button" className="button full" onClick={()=>{draft.delete('page');setDraft(null);go(draft)}}>Show {filterProducts(products,draft).length} frames</button></div></>}</Modal>
 </div>
}
export function ProductDetail(){
 const{id}=useParams(),[params]=useSearchParams(),p=useProduct(id),viewProduct=useApp(s=>s.viewProduct);
 useEffect(()=>{if(p)viewProduct(p.id)},[p?.id,viewProduct]);
 if(!p)return<NotFound/>;
 const c=Number(params.get('color'));return<ProductView key={p.id} product={p} initialColor={Number.isInteger(c)&&p.colors[c]?c:0}/>
}
function ProductView({product:p,initialColor}:{product:Product;initialColor:number}){
 const products=useApp(s=>s.products),perform=useApp(s=>s.perform),setPanel=useApp(s=>s.setPanel),cart=useApp(s=>s.cart??NONE),busy=useApp(s=>s.busy)>0;
 const[sel,setSel]=useState<LensSelection>({size:p.sizes[0],color:p.colors[initialColor],lens:'non-prescription',coating:'standard',prescription:null});
 const[modal,setModal]=useState<'zoom'|'lenses'|'restock'|null>(null);
 const extra=lensPrice(p.category,sel.lens,sel.coating),ci=colorIndex(p,sel.color),stock=p.stock;
 const add=async()=>{if(cart.filter(l=>l.productId===p.id).reduce((n,l)=>n+l.quantity,0)+1>stock)return void toast('There aren’t enough pairs available for that quantity.');try{await perform('/cart','POST',{productId:p.id,...sel,quantity:1});toast(`${p.name} added to your bag.`,{action:{label:'View bag',onClick:()=>setPanel('cart')}})}catch{}};
 return<><div className="page-wrap"><Breadcrumb parts={[{label:p.category==='sun'?'Sunglasses':'Optical glasses',to:'/catalog?category='+p.category},{label:p.name}]}/>
  <div className="product-detail"><ProductGallery product={p} color={ci} onZoom={()=>setModal('zoom')}/>
   <div><div className="product-heading"><span className="eyebrow">{p.category==='sun'?'Sun essentials':'Optical essentials'} / {p.material}</span><h1>{p.name}</h1><div className="detail-price">{p.originalPrice>p.price&&<><del className="muted small">{money(p.originalPrice)}</del> </>}{money(p.price+extra)}<span className="small muted"> {extra?'with selected lenses':'standard lenses included'}</span></div><button type="button" className="review-link" onClick={()=>document.querySelector('#product-reviews')?.scrollIntoView({behavior:'smooth',block:'start'})}><Stars n={Math.round(p.rating)}/> {p.rating.toFixed(1)} ({p.reviewCount} reviews)</button></div>
    <p className="product-description">{p.description}</p>
    <div className="option-label"><strong>Color</strong><span>{sel.color}</span></div><div className="color-options">{p.colors.map((c,i)=><button type="button" key={c} className={cn('color-option',ci===i&&'selected')} style={{'--swatch':p.swatches[i]?.hex} as React.CSSProperties} onClick={()=>setSel({...sel,color:c})} title={c} aria-label={c} aria-pressed={ci===i}/>)}</div>
    <div className="option-label"><strong>Frame width</strong><Link className="text-button small" to="/guide">Fit guide</Link></div><div className="segmented">{p.sizes.map(f=><button type="button" key={f} className={cn('segment',sel.size===f&&'selected')} onClick={()=>setSel({...sel,size:f})} aria-pressed={sel.size===f}>{f}</button>)}</div>
    <div className="lens-summary"><div><strong>Your lenses</strong><span>{lensLabel(p.category,sel.lens,sel.coating)}</span>{sel.prescription&&<span>Prescription added</span>}</div><button type="button" className="text-button" onClick={()=>setModal('lenses')}>Choose lenses</button></div>
    <div className="add-buttons"><button type="button" className="button full" disabled={busy} onClick={stock?add:()=>setModal('restock')}>{stock?'Add to bag · '+money(p.price+extra):'Notify me when available'}</button><WishlistButton product={p} className="icon-button"/></div>
    <div className="product-promises"><span>{stock?stock+' pairs available':'Currently sold out'}</span><span>Case & cloth included</span><span>30-day returns</span></div>
    <div className="product-accordion"><details open><summary>Made for the details</summary><p>{p.material==='Metal'?'Fine, lightweight metal with adjustable nose pads and spring hinges.':p.material==='Mixed'?'Rich acetate meets fine metal for a comfortable, considered balance.':'Hand-polished acetate with a sculpted finish and durable five-barrel hinges.'} Every pair includes a case and microfiber cleaning cloth.</p><div className="spec-grid"><div><span>Shape</span>{p.shape}</div><div><span>Material</span>{p.material}</div><div><span>Lens / bridge / temple</span>{p.dimensions} mm</div><div><span>Weight</span>{p.weight}</div></div></details><details><summary>Delivery & returns</summary><p>Standard delivery takes 5–7 business days. Prescription lenses add 3–5 business days. Standard shipping is $8, or complimentary from $150 after discounts. Start a return within 30 days in your orders.</p></details><details><summary>Care for your pair</summary><p>Rinse before wiping. Use the included microfiber cloth with lens-safe cleaning solution. Keep your glasses in their case when not in use.</p></details></div>
   </div></div>
  <section className="reviews-section" id="product-reviews"><Reviews product={p}/></section></div>
  <section className="section"><div className="section-head"><div><span className="eyebrow">Another point of view</span><h2>You might also like.</h2></div></div><ProductGrid products={products.filter(x=>x.id!==p.id&&x.category===p.category).slice(0,4)}/></section>
  <RecentSection except={p.id}/>
  <Modal open={modal==='zoom'} onOpenChange={o=>{if(!o)setModal(null)}} title={p.name+' · '+sel.color} variant="wide"><div><ProductImage product={p} color={ci} className="zoom-image"/></div></Modal>
  {modal==='lenses'&&<LensEditor product={p} value={sel} onClose={()=>setModal(null)} onSave={s=>{setSel(s);setModal(null);toast('Lens selection saved.')}}/>}
  <RestockModal product={p} open={modal==='restock'} onClose={()=>setModal(null)}/>
 </>
}
function RestockModal({product,open,onClose}:{product:Product;open:boolean;onClose:()=>void}){
 const user=useApp(s=>s.user),perform=useApp(s=>s.perform),{error,busy,submit}=useSubmit();
 return<Modal open={open} onOpenChange={o=>{if(!o)onClose()}} title="Keep this one in sight."><form onSubmit={submit(async f=>{await perform('/restock','POST',{productId:product.id,email:f.email},{silent:true});onClose();toast('Notification request saved. No email is sent in this demo.')})}><div className="modal-body"><p>Ask to hear when {product.name} is back.</p><div className="field"><label htmlFor="restock-email">Email address</label><input id="restock-email" name="email" type="email" defaultValue={user?.guest?'':user?.email} required/></div><p className="form-note">Demo request only. No email notification will be sent.</p><FormError message={error}/></div><div className="modal-footer"><button className="button" disabled={busy}>Save notification request</button></div></form></Modal>
}
function Reviews({product:p}:{product:Product}){
 const user=useApp(s=>s.user),perform=useApp(s=>s.perform),navigate=useNavigate();
 const[reviews,setReviews]=useState<Review[]|null>(null),[filter,setFilter]=useState(0),[writing,setWriting]=useState(false),[commenting,setCommenting]=useState<string|null>(null),[rating,setRating]=useState(5);
 const load=useCallback(()=>api<Review[]>(`/products/${p.id}/reviews`).then(setReviews,()=>setReviews([])),[p.id]);
 useEffect(()=>{void load()},[load]);
 const review=useSubmit(),comment=useSubmit();
 const needAccount=(message:string)=>{if(!user?.guest)return false;toast(message);navigate('/account?next=product/'+p.id);return true};
 if(!reviews)return<><h2>A few perspectives.</h2><p className="muted" style={{padding:'30px 0'}}>Loading reviews…</p></>;
 const visible=filter?reviews.filter(r=>r.rating===filter):reviews,avg=reviews.length?reviews.reduce((n,r)=>n+r.rating,0)/reviews.length:0;
 return<><h2>A few perspectives.</h2><div className="reviews-layout"><div><div className="review-score">{avg.toFixed(1)}</div><Stars n={Math.round(avg)}/><p className="muted small" style={{marginTop:10}}>Based on {reviews.length} reviews</p>
   <div className="rating-bars">{[5,4,3,2,1].map(n=>{const count=reviews.filter(r=>r.rating===n).length;return<div key={n} className="rating-bar"><span>{n} ★</span><div><i style={{width:(reviews.length?count/reviews.length*100:0)+'%'}}/></div><span>{count}</span></div>})}</div>
   <button type="button" className="button outline full" onClick={()=>{if(needAccount('Sign in to share your perspective.'))return;if(reviews.some(r=>r.mine))return void toast('You already reviewed this frame.');setRating(5);setWriting(true)}}>Write a review</button><p className="form-note">Initial reviews are illustrative sample reviews.</p></div>
  <div><div className="review-tools"><span>{visible.length} reviews</span><label>Rating <select aria-label="Filter reviews by rating" value={filter} onChange={e=>setFilter(Number(e.target.value))}><option value="0">All ratings</option>{[5,4,3,2,1].map(n=><option key={n} value={n}>{n} stars</option>)}</select></label></div>
   {visible.length?visible.map(r=><article key={r.id} className="review-item"><Stars n={r.rating}/><h4>{r.title}</h4><div className="review-meta"><span>{r.author} · {r.sample?'Sample review':r.verified?'Verified order':'Community review'}</span><span>{date(r.createdAt)}</span></div><p>{r.text}</p>
    <button type="button" className="text-button" onClick={async()=>{try{const x=await api<{liked:boolean;likes:number}>(`/reviews/${r.id}/like`,'POST');setReviews(list=>list!.map(v=>v.id===r.id?{...v,...x}:v))}catch(e){toast((e as Error).message)}}}>{r.liked?'Helpful ✓':'Helpful'} ({r.likes})</button><button type="button" className="text-button" style={{marginLeft:18}} onClick={()=>{if(!needAccount('Sign in to join the conversation.'))setCommenting(r.id)}}>Comment</button>
    {r.comments.map(c=><p key={c.id} style={{background:'var(--soft)',padding:13,marginTop:15}}><strong className="small">{c.author}</strong><br/>{c.text}</p>)}</article>):<p className="muted" style={{padding:'30px 0'}}>No reviews with this rating yet.</p>}</div></div>
  <Modal open={writing} onOpenChange={setWriting} title="Your perspective."><form onSubmit={review.submit(async f=>{await perform(`/products/${p.id}/reviews`,'POST',{rating,title:f.title,text:f.text},{silent:true});setWriting(false);setFilter(0);await load();document.querySelector('#product-reviews')?.scrollIntoView({block:'start'});toast('Your review is saved.')})}><div className="modal-body"><p>Share your thoughts on {p.name}.</p><div className="review-star-select" role="group" aria-label="Select rating">{[1,2,3,4,5].map(n=><button type="button" key={n} className={cn(n<=rating&&'selected')} onClick={()=>setRating(n)} aria-label={n+' stars'} aria-pressed={n===rating}>★</button>)}</div><div className="form-grid"><div className="field full"><label htmlFor="review-title">A short headline</label><input id="review-title" name="title" maxLength={90} minLength={3} required/></div><div className="field full"><label htmlFor="review-text">Your review</label><textarea id="review-text" name="text" minLength={10} maxLength={2000} required/></div></div><FormError message={review.error}/></div><div className="modal-footer"><button className="button" disabled={review.busy}>Publish review</button></div></form></Modal>
  <Modal open={!!commenting} onOpenChange={o=>{if(!o)setCommenting(null)}} title="Join the conversation."><form onSubmit={comment.submit(async f=>{await api(`/reviews/${commenting}/comments`,'POST',{text:f.text});setCommenting(null);await load();toast('Comment saved.')})}><div className="modal-body"><div className="field"><label htmlFor="comment-text">Your comment</label><textarea id="comment-text" name="text" minLength={3} maxLength={1000} required/></div><FormError message={comment.error}/></div><div className="modal-footer"><button className="button" disabled={comment.busy}>Post comment</button></div></form></Modal>
 </>
}
export function Wishlist(){
 const ids=useApp(s=>s.wishlist??NONE),products=useApp(s=>s.products),list=pick(products,ids);
 return<div className="page-wrap"><Breadcrumb parts={[{label:'Saved frames'}]}/><PageTitle title="Keep them in sight." copy={`${list.length} saved ${list.length===1?'frame':'frames'}. A little collection of possibilities.`}/>{list.length?<ProductGrid products={list}/>:<Empty title="Good things are worth saving." copy="Tap the heart on any frame to keep it here." label="Find a favorite" icon={Heart}/>}</div>
}
