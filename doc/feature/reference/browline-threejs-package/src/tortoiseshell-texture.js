import * as THREE from 'three';
const cache=new Map();
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>t*t*(3-2*t);
function hash(x,y,seed){
  let n=(Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(seed,144269))|0;
  n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;
}
function noise(x,y,period,seed){
  const ix=Math.floor(x),iy=Math.floor(y),fx=smooth(x-ix),fy=smooth(y-iy);
  const wrap=v=>(v%period+period)%period;
  const h=(a,b)=>hash(wrap(a),wrap(b),seed);
  return lerp(lerp(h(ix,iy),h(ix+1,iy),fx),lerp(h(ix,iy+1),h(ix+1,iy+1),fx),fy);
}
/** Deterministic, seamless pigment pattern; inferred appearance, not a photo scan. */
export function createPatternData(seed=1836,size=512){
  const key=seed+':'+size;if(cache.has(key))return cache.get(key);
  const data=new Uint8Array(size*size*4);
  const palette=[[0,[13,7,4]],[0.34,[26,13,7]],[0.54,[46,21,8]],[0.70,[69,30,9]],[0.87,[96,43,12]],[1,[123,58,18]]];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size;
    const dx=(noise(u*4,v*4,4,seed+33)-0.5)*2.6;
    const dy=(noise(u*4,v*4,4,seed+78)-0.5)*2.6;
    let n=noise(u*11+dx,v*11+dy,11,seed)*0.67+noise(u*5,v*5,5,seed+11)*0.23+noise(u*29,v*29,29,seed+9)*0.10;
    n=smooth(Math.min(1,Math.max(0,(n-0.28)/0.50)));
    let i=0;while(i<palette.length-2&&n>palette[i+1][0])i++;
    const a=palette[i],b=palette[i+1],t=(n-a[0])/(b[0]-a[0]),offset=(y*size+x)*4;
    for(let c=0;c<3;c++)data[offset+c]=Math.round(lerp(a[1][c],b[1][c],t));
    data[offset+3]=255;
  }
  const result={data,width:size,height:size};cache.set(key,result);
  if(cache.size>4)cache.delete(cache.keys().next().value);
  return result;
}
export function createTortoiseshellTexture(seed=1836){
  const {data,width,height}=createPatternData(seed);
  const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat);
  texture.name='Tortoiseshell_Seed_'+seed;
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;
  return texture;
}
