export const id=()=>crypto.randomUUID();
export const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
export const bytes=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export async function hash(value:string,salt=b64(crypto.getRandomValues(new Uint8Array(16)))){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(value),'PBKDF2',false,['deriveBits']);
 const result=await crypto.subtle.deriveBits({name:'PBKDF2',salt:bytes(salt),iterations:100000,hash:'SHA-256'},key,256);
 return salt+':'+b64(new Uint8Array(result));
}
export async function verify(value:string,stored:string|null){if(!stored)return false;const next=await hash(value,stored.split(':')[0]);let mismatch=stored.length^next.length;for(let i=0;i<stored.length;i++)mismatch|=stored.charCodeAt(i)^next.charCodeAt(i);return mismatch===0}
export async function digest(value:string){return b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))))}
