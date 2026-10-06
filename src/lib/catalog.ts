import type { Product } from './types';
export const FILTER_GROUPS={shape:['Rectangle','Round','Cat-eye','Square','Aviator','Browline','Geometric','Oval'],material:['Acetate','Metal','Mixed'],fit:['Standard','Narrow','Wide']} as const;
export const SORTS=[['recommended','Recommended'],['newest','Newest'],['price-asc','Price: low to high'],['price-desc','Price: high to low'],['rating','Top rated']] as const;
export const PRICE_MIN=130,PRICE_MAX=200;
export const PAGE_SIZE=6;
const searchText=(p:Product)=>`${p.name} ${p.shape} ${p.material} ${p.description} ${p.colors.join(' ')} ${p.category==='sun'?'sunglasses':'optical glasses'}`.toLowerCase();
// URL params drive every filter, so results stay shareable and back-button friendly. "max" is whole dollars.
export function filterProducts(products:Product[],params:URLSearchParams){
 const all=(k:string)=>params.getAll(k),q=params.get('q')?.toLowerCase(),max=(Number(params.get('max'))||PRICE_MAX)*100;
 const list=products.filter(p=>(!params.get('category')||p.category===params.get('category'))&&(!q||searchText(p).includes(q))&&(!all('shape').length||all('shape').includes(p.shape))&&(!all('material').length||all('material').includes(p.material))&&(!all('fit').length||p.sizes.some(f=>all('fit').includes(f)))&&p.price<=max&&(!params.get('stock')||p.stock>0)&&(!params.get('sale')||p.originalPrice>p.price));
 const sort=params.get('sort');
 return list.sort(sort==='price-asc'?(a,b)=>a.price-b.price:sort==='price-desc'?(a,b)=>b.price-a.price:sort==='rating'?(a,b)=>b.rating-a.rating:sort==='newest'?(a,b)=>b.createdAt.localeCompare(a.createdAt):(a,b)=>a.rank-b.rank);
}
export function catalogHref(params:URLSearchParams,changes:Record<string,string|number|null|undefined>){const p=new URLSearchParams(params);for(const[k,v]of Object.entries(changes)){p.delete(k);if(v!==null&&v!==undefined&&v!=='')p.set(k,String(v))}return '/catalog'+(p.size?'?'+p:'')}
export const colorIndex=(p:Product,color:string)=>Math.max(0,p.colors.indexOf(color));
export const imageFilter=(p:Product|undefined,color:string|number)=>p?.swatches[typeof color==='number'?color:colorIndex(p,color)]?.filter??'none';
