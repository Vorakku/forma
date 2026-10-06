import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { toast } from 'sonner';
import { api } from './api';
import type { Delivery } from './rules';
import type { Bootstrap, OrderAddress, Product } from './types';
type Draft={address?:OrderAddress;delivery?:Delivery;saveAddress?:boolean};
type Panel='menu'|'search'|'cart'|null;
type State=Partial<Bootstrap>&{products:Product[];ready:boolean;error:string;busy:number;panel:Panel;recent:string[];compare:string[];promo:string|null;draft:Draft;
 init:()=>Promise<void>;refreshProducts:()=>Promise<void>;sync:(data:Bootstrap)=>void;perform:<T=any>(path:string,method?:string,body?:unknown,options?:{silent?:boolean})=>Promise<T>;
 setPanel:(panel:Panel)=>void;viewProduct:(id:string)=>void;clearRecent:()=>void;setCompare:(ids:string[])=>void;setPromo:(code:string|null)=>void;setDraft:(d:Draft)=>void;clearDraft:()=>void};
const safeStorage={getItem:(key:string)=>{try{return localStorage.getItem(key)}catch{return null}},setItem:(key:string,value:string)=>{try{localStorage.setItem(key,value)}catch{/* Preferences stay in memory when storage is unavailable. */}},removeItem:(key:string)=>{try{localStorage.removeItem(key)}catch{}}};
const strings=(v:unknown,max:number)=>Array.isArray(v)?v.filter(s=>typeof s==='string').slice(0,max):[];
export const useApp=create<State>()(persist((set,get)=>({products:[],ready:false,error:'',busy:0,panel:null,recent:[],compare:[],promo:null,draft:{},
 sync:data=>set(data),
 init:async()=>{set({error:''});try{const [state,products]=await Promise.all([api<Bootstrap>('/bootstrap'),api<Product[]>('/products')]);set({...state,products,ready:true})}catch(e){set({error:(e as Error).message,ready:false})}},
 refreshProducts:async()=>{try{set({products:await api<Product[]>('/products')})}catch{}},
 perform:async(path,method='POST',body,{silent=false}={})=>{set(s=>({busy:s.busy+1}));try{const result=await api(path,method,body);if(result.user&&result.cart)get().sync(result);if(result.state)get().sync(result.state);
  // Stock, sold counts and ratings change server-side after these calls.
  if(path==='/checkout'||path.startsWith('/orders/')||path.endsWith('/reviews'))await get().refreshProducts();return result}
  catch(e){if(!silent)toast((e as Error).message);throw e}finally{set(s=>({busy:Math.max(0,s.busy-1)}))}},
 setPanel:panel=>set({panel}),
 viewProduct:id=>set(s=>({recent:[id,...s.recent.filter(v=>v!==id)].slice(0,12)})),clearRecent:()=>set({recent:[]}),
 setCompare:compare=>set({compare:compare.slice(0,3)}),setPromo:promo=>set({promo}),
 setDraft:d=>set(s=>({draft:{...s.draft,...d}})),clearDraft:()=>set({draft:{},promo:null}),
}),{name:'forma-device-v1',version:1,storage:createJSONStorage(()=>safeStorage),partialize:s=>({recent:s.recent,compare:s.compare,promo:s.promo,draft:s.draft}),merge:(saved,current)=>{const p=(saved??{})as Partial<State>;return{...current,recent:strings(p.recent,12),compare:strings(p.compare,3),promo:typeof p.promo==='string'?p.promo:null,draft:p.draft&&typeof p.draft==='object'?p.draft:{}}}}));
export const useProduct=(id?:string)=>useApp(s=>s.products.find(p=>p.id===id));
