export const LIGHT_SAMPLE_EVERY=4;
export const LIGHT_SAMPLE_WIDTH=32;
export const LIGHT_SAMPLE_HEIGHT=18;
export const LIGHT_SMOOTHING=.5; // seconds, exponential time constant
export const LIGHT_COLOR_MIX=.4;
export const LIGHT_REFERENCE_LUMINANCE=.18;
export const LIGHT_MIN=.25;
export const LIGHT_MAX=1.4;
export const LIGHT_LUMINANCE_FLOOR=.001;
export const LIGHT_AMBIENT_INTENSITY=.8;
export const LIGHT_KEY_INTENSITY=3;
export const LIGHT_KEY_MIN=.35;
export const LIGHT_KEY_MAX=1.25;
export const LIGHT_GROUND_SCALE=.6;
export const LIGHT_ENVIRONMENT_MAX=1.1;
export const LIGHT_SHADOW_FLAT=.35;
export const LIGHT_SHADOW_DIRECTIONAL=1.2;
export const LIGHT_LENS_CLEARCOAT=.35;
export const LIGHT_LENS_OPACITY_SCALE=.5;
export const LIGHT_LENS_OPACITY_MIN=.02;
export const LIGHT_LENS_OPACITY_MAX=.06;
export const LIGHT_CLEAR_LENS_THRESHOLD=.2;
export const LIGHT_TINT_OPACITY_MIN=.9;
export const KEY_SHIFT_MAX_X=18;
export const KEY_SHIFT_MAX_Y=8;
export const KEY_SHIFT_MIN_Y=4;
export const LIGHT_FACE_VERTICES=468;

type Landmark={x:number;y:number};
export type LightEstimate={color:[number,number,number];ambient:number;face:number;horizontal:number;vertical:number};
const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
const linear=Array.from({length:256},(_,i)=>{const v=i/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});
const luminance=(r:number,g:number,b:number)=>.2126*r+.7152*g+.0722*b;
const neutral=():LightEstimate=>({color:[1,1,1],ambient:LIGHT_REFERENCE_LUMINANCE,face:LIGHT_REFERENCE_LUMINANCE,horizontal:0,vertical:0});

// Pixels and landmarks are both unmirrored. Positive x is camera right, positive y is up.
export function estimateLight(data:Uint8ClampedArray,width:number,height:number,landmarks:Landmark[]):LightEstimate{
 let minX=1,minY=1,maxX=0,maxY=0;
 for(const p of landmarks.slice(0,LIGHT_FACE_VERTICES)){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y)}
 if(!(maxX>minX&&maxY>minY)){minX=minY=0;maxX=maxY=1}
 const x0=clamp(Math.floor(minX*width),0,width-1),x1=clamp(Math.ceil(maxX*width),x0+1,width),y0=clamp(Math.floor(minY*height),0,height-1),y1=clamp(Math.ceil(maxY*height),y0+1,height),midX=(x0+x1)/2,midY=(y0+y1)/2;
 let r=0,g=0,b=0,face=0,left=0,right=0,top=0,bottom=0,n=0,nl=0,nr=0,nt=0,nb=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,pr=linear[data[i]],pg=linear[data[i+1]],pb=linear[data[i+2]],l=luminance(pr,pg,pb);r+=pr;g+=pg;b+=pb;
  if(x>=x0&&x<x1&&y>=y0&&y<y1){face+=l;n++;if(x+.5<midX){left+=l;nl++}else{right+=l;nr++}if(y+.5<midY){top+=l;nt++}else{bottom+=l;nb++}}
 }
 const pixels=width*height;r/=pixels;g/=pixels;b/=pixels;face/=n||1;
 left=nl?left/nl:face;right=nr?right/nr:face;top=nt?top/nt:face;bottom=nb?bottom/nb:face;
 const peak=Math.max(r,g,b,LIGHT_LUMINANCE_FLOOR);
 return{color:[r/peak,g/peak,b/peak],ambient:luminance(r,g,b),face,horizontal:(right-left)/Math.max(right+left,LIGHT_LUMINANCE_FLOOR),vertical:(top-bottom)/Math.max(top+bottom,LIGHT_LUMINANCE_FLOOR)};
}

export class LightEstimator{
 private value=neutral();private target=neutral();private time:number|undefined;
 get current(){return this.value}
 sample(data:Uint8ClampedArray,width:number,height:number,landmarks:Landmark[]){this.target=estimateLight(data,width,height,landmarks)}
 update(time:number){
  if(this.time===undefined)this.value={...this.target,color:[...this.target.color]};
  else{
   const a=1-Math.exp(-Math.max(0,time-this.time)/LIGHT_SMOOTHING);
   for(let i=0;i<3;i++)this.value.color[i]+=(this.target.color[i]-this.value.color[i])*a;
   for(const key of ['ambient','face','horizontal','vertical'] as const)this.value[key]+=(this.target[key]-this.value[key])*a;
  }
  this.time=time;return this.value;
 }
 reset(){this.value=neutral();this.target=neutral();this.time=undefined}
}

export function lightSettings(estimate:LightEstimate){
 const ambient=clamp(estimate.ambient/LIGHT_REFERENCE_LUMINANCE,LIGHT_MIN,LIGHT_MAX),direction=clamp(Math.hypot(estimate.horizontal,estimate.vertical),0,1);
 return{color:estimate.color.map(c=>1+(c-1)*LIGHT_COLOR_MIX),ambient,key:clamp(estimate.face/LIGHT_REFERENCE_LUMINANCE,LIGHT_KEY_MIN,LIGHT_KEY_MAX),shiftX:clamp(estimate.horizontal,-1,1)*KEY_SHIFT_MAX_X,shiftY:clamp(estimate.vertical,-1,1)*KEY_SHIFT_MAX_Y,shadow:LIGHT_SHADOW_FLAT+(LIGHT_SHADOW_DIRECTIONAL-LIGHT_SHADOW_FLAT)*direction,environment:Math.min(ambient,LIGHT_ENVIRONMENT_MAX)};
}

export function lensOpacity(base:number,ambient:number){
 return base<LIGHT_CLEAR_LENS_THRESHOLD?clamp(base*ambient*LIGHT_LENS_OPACITY_SCALE,LIGHT_LENS_OPACITY_MIN,LIGHT_LENS_OPACITY_MAX):base*(LIGHT_TINT_OPACITY_MIN+(1-LIGHT_TINT_OPACITY_MIN)*ambient/LIGHT_MAX);
}
