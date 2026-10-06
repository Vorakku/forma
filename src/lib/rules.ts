// Shop rules shared by the Worker (authoritative totals) and the client (live previews). Money is integer cents.
export type LensOption={id:string;name:string;price:number;description:string};
export const LENS_TYPES:LensOption[]=[
 {id:'non-prescription',name:'Non-prescription',price:0,description:'Clear optical or tinted sun lenses, included with your frame.'},
 {id:'single-vision',name:'Single vision',price:5000,description:'One prescription for distance or everyday vision.'},
 {id:'reading',name:'Reading',price:2500,description:'A single magnification for close-up reading.'}
];
const SUN_COATINGS:LensOption[]=[
 {id:'standard',name:'Standard UV sun lenses',price:0,description:'Tinted lenses with UV protection.'},
 {id:'polarized',name:'Polarized sun lenses',price:2000,description:'An optional glare-reducing finish.'}
];
const OPTICAL_COATINGS:LensOption[]=[
 {id:'standard',name:'Standard clear lenses',price:0,description:'Clear lenses with a basic anti-reflective finish.'},
 {id:'blue-light',name:'Blue-light filter',price:2500,description:'A subtle filter with a clear appearance.'},
 {id:'photochromic',name:'Light-adaptive lenses',price:6000,description:'Clear indoors, darker in sunlight.'}
];
export const coatingsFor=(category:string)=>category==='sun'?SUN_COATINGS:OPTICAL_COATINGS;
export const lensPrice=(category:string,lens:string,coating:string)=>(LENS_TYPES.find(l=>l.id===lens)?.price??0)+(coatingsFor(category).find(c=>c.id===coating)?.price??0);
export const lensLabel=(category:string,lens:string,coating:string)=>`${LENS_TYPES.find(l=>l.id===lens)?.name??'Non-prescription'} · ${coatingsFor(category).find(c=>c.id===coating)?.name??'Standard lenses'}`;
export const READING_POWERS=Array.from({length:15},(_,i)=>(.5+i*.25).toFixed(2));
export const FREE_SHIPPING_MIN=15000;
export const DELIVERY={standard:{price:800,name:'Standard',days:'5–7'},express:{price:1800,name:'Express',days:'2–3'}} as const;
export type Delivery=keyof typeof DELIVERY;
export const PAYMENTS=['Demo card','Cash on delivery (demo)'] as const;
export function promoError(code:string,subtotal:number){
 if(code!=='WELCOME10'&&code!=='FORMA20')return 'That code isn’t valid. Try WELCOME10 or FORMA20.';
 if(code==='FORMA20'&&subtotal<20000)return 'FORMA20 needs a subtotal of $200 or more.';
 return '';
}
export function totals(subtotal:number,promo?:string|null,delivery:Delivery='standard',hasItems=true){
 const discount=promo==='WELCOME10'?Math.round(subtotal*.1):promo==='FORMA20'&&subtotal>=20000?2000:0;
 const after=subtotal-discount;
 const shipping=!hasItems?0:delivery==='express'?DELIVERY.express.price:after>=FREE_SHIPPING_MIN?0:DELIVERY.standard.price;
 const tax=Math.round(after*.08);
 return {subtotal,discount,shipping,tax,total:after+shipping+tax,promo:discount?promo!:null};
}
export const RETURN_REASONS=['Fit wasn’t quite right','Prefer another style','Changed my mind','Other'] as const;
export const SUPPORT_TOPICS=['Frame & fit','Lenses','Delivery','Returns','Something else'] as const;
export const RETURN_WINDOW_MS=30*86400000;
