import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {Breadcrumb,PageTitle,ProductImage} from '@/components/common';
import {useApp} from '@/lib/store';
import {createFaceEngine,FaceEngineError,type FaceEngine,type FaceStatus} from '@/tryon/engine';
import {buildOverlayGlasses} from '@/tryon/glasses';

type Status=FaceStatus|'idle'|'unsupported';
const STATUS_HOLD_MS=900; // tracking ⇄ no-face must hold this long before it is shown/announced, so blinks don't spam screen readers
const COPY:Record<Status,string>={idle:'Your camera is off.',loading:'Loading the face model and camera…',tracking:'Tracking your face. Turn gently to explore the fit.','no-face':'Move into frame',error:'The camera could not start.',unsupported:'This browser cannot use the camera here. Use a browser with camera and WebGL 2 support on HTTPS or localhost.'};
export function TryOn(){
 const products=useApp(s=>s.products),[params,setParams]=useSearchParams(),product=products.find(p=>p.id===params.get('product'))??products[0];
 const[selection,setSelection]=useState({id:product?.id,color:0}),color=selection.id===product?.id?selection.color:0;
 const[status,setStatus]=useState<Status>(()=>window.isSecureContext&&typeof navigator.mediaDevices?.getUserMedia==='function'?'idle':'unsupported'),[error,setError]=useState(''),[frameError,setFrameError]=useState(''),[engine,setEngine]=useState<FaceEngine|null>(null);
 const video=useRef<HTMLVideoElement>(null),canvas=useRef<HTMLCanvasElement>(null),active=useRef<FaceEngine|null>(null),startup=useRef<AbortController|null>(null);
 const[shown,setShown]=useState(status);
 useEffect(()=>{if(status!=='tracking'&&status!=='no-face')return void setShown(status);const timer=setTimeout(()=>setShown(status),STATUS_HOLD_MS);return()=>clearTimeout(timer)},[status]);
 useEffect(()=>()=>{startup.current?.abort();active.current?.dispose()},[]);
 useEffect(()=>{
  if(!engine)return;
  try{engine.setObject(product?buildOverlayGlasses(product,color):null);setFrameError('')}catch{setFrameError('This frame could not be drawn. Please choose another frame.')}
 },[engine,product,color]);
 const stop=()=>{startup.current?.abort();startup.current=null;active.current?.dispose();active.current=null;setEngine(null);setStatus('idle');setError('');setFrameError('')};
 const start=async()=>{
  if(status==='loading'||!video.current||!canvas.current)return;
  stop();const controller=new AbortController();startup.current=controller;setStatus('loading');
  try{
   const next=await createFaceEngine({video:video.current,canvas:canvas.current,signal:controller.signal,debug:params.get('debug')==='1',onStatus:(state,failure)=>{if(!controller.signal.aborted){setStatus(state);setError(failure?.message??'')}}});
   if(controller.signal.aborted){next.dispose();return}active.current=next;setEngine(next);
  }catch(failure){if(controller.signal.aborted)return;setStatus(failure instanceof FaceEngineError&&failure.code==='unsupported'?'unsupported':'error');setError(failure instanceof FaceEngineError?failure.message:'The 3D view could not start. Please try again.')}
 };
 const choose=(id:string)=>{setSelection({id,color:0});setFrameError('');setParams(previous=>{const next=new URLSearchParams(previous);next.set('product',id);return next},{replace:true})};
 const running=status==='tracking'||status==='no-face',busy=status==='loading',showVideo=running||busy;
 return<div className="page-wrap tryon-page"><Breadcrumb parts={[{label:'3D Demo'}]}/><PageTitle title="A new perspective." copy="Try frames on with your camera. Video stays on your device and is never uploaded."/>
  <div className="tryon-layout"><section className="tryon-view" aria-label="Live 3D try-on"><div className={'tryon-stage'+(showVideo?' active':'')}>
   <video ref={video} autoPlay muted playsInline aria-hidden="true"/><canvas ref={canvas} role="img" aria-label="Mirrored live camera with 3D frame"/>
   {!showVideo&&<div className="tryon-placeholder"><span className="eyebrow">3D Demo</span><p>See a different side of your next frame.</p></div>}
  </div><p className="tryon-status" role="status" aria-live="polite">{error||frameError||COPY[shown]}</p><div className="tryon-actions">
   {running?<button type="button" className="button outline" onClick={stop}>Stop camera</button>:<button type="button" className="button" disabled={busy||status==='unsupported'||!product} onClick={()=>void start()}>{busy?'Starting camera…':status==='error'?'Try again':'Start camera'}</button>}
   {busy&&<button type="button" className="text-button" onClick={stop}>Cancel</button>}<span className="form-note">Average fit preview. Actual fit may vary.</span>
  </div></section><aside className="tryon-controls" aria-label="Frame and colour picker">
   {product&&<div className="tryon-selection"><span className="eyebrow">Your perspective</span><h2>{product.name}</h2><p className="muted small">{product.shape} · {product.material} · {product.dimensions} mm</p><fieldset className="tryon-colours"><legend>Colour: {product.colors[color]}</legend><div className="swatches">{product.swatches.map((swatch,i)=><button type="button" key={i} className={'swatch'+(color===i?' selected':'')} style={{'--swatch':swatch.hex} as CSSProperties} aria-label={product.colors[i]??`Colour ${i+1}`} aria-pressed={color===i} onClick={()=>{setSelection({id:product.id,color:i});setFrameError('')}}/>)}</div></fieldset><Link className="text-button" to={'/product/'+product.id}>View {product.name}</Link></div>}
   <fieldset className="tryon-frames"><legend>Choose a frame</legend><div className="tryon-frame-grid">{products.map(p=><button type="button" key={p.id} className={'tryon-frame'+(p.id===product?.id?' selected':'')} aria-pressed={p.id===product?.id} onClick={()=>choose(p.id)}><ProductImage product={p} loading="lazy" width="160" height="100"/><span>{p.name}</span></button>)}</div>{!products.length&&<p className="muted small">No frames are available to preview.</p>}</fieldset>
  </aside></div>
 </div>;
}
