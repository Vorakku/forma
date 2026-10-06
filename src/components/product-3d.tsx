import {useEffect,useId,useRef,useState,type KeyboardEvent} from 'react';
import {Minus,Plus,RotateCcw,MoveUpRight} from 'lucide-react';
import {createObjectViewer,VIEWER_ROTATION_STEP,type ObjectViewer,type ObjectView} from '@/tryon/viewer';
import {buildDisplayGlasses} from '@/tryon/glasses';
import type {Product} from '@/lib/types';

const VIEWS:[ObjectView,string][]=[['perspective','Three-quarter'],['front','Front'],['side','Side'],['top','Top']];
export function Product3D({product,color,onPhotos}:{product:Product;color:number;onPhotos:()=>void}){
 const canvas=useRef<HTMLCanvasElement>(null),viewer=useRef<ObjectViewer|null>(null),instructions=useId();
 const[error,setError]=useState(''),[ready,setReady]=useState(false),[attempt,setAttempt]=useState(0),[view,setView]=useState('perspective');
 useEffect(()=>{
  let live=true;setError('');setReady(false);setView('perspective');
  try{viewer.current=createObjectViewer({canvas:canvas.current!,onError:message=>{if(live){setError(message);setReady(false)}}});setReady(true)}catch{setError('This browser could not open the 3D view. Try again or explore the photos.')}
  return()=>{live=false;viewer.current?.dispose();viewer.current=null};
 },[attempt]);
 useEffect(()=>{if(!ready)return;try{viewer.current?.setObject(buildDisplayGlasses(product,color))}catch{setError('This frame could not be displayed. Try again or explore the photos.');setReady(false);viewer.current?.dispose()}},[product,color,ready]);
 const preset=(next:ObjectView)=>{viewer.current?.setView(next);setView(next)},reset=()=>{viewer.current?.reset();setView('perspective')};
 const key=(event:KeyboardEvent<HTMLCanvasElement>)=>{
  if(!ready||event.ctrlKey||event.metaKey||event.altKey)return;
  const step=VIEWER_ROTATION_STEP;
  switch(event.key){case'ArrowLeft':viewer.current?.rotate(-step,0);break;case'ArrowRight':viewer.current?.rotate(step,0);break;case'ArrowUp':viewer.current?.rotate(0,-step);break;case'ArrowDown':viewer.current?.rotate(0,step);break;case'+':case'=':viewer.current?.zoom(true);break;case'-':viewer.current?.zoom(false);break;case'r':case'R':reset();event.preventDefault();return;default:return}
  event.preventDefault();setView('custom');
 };
 return<div className="product-3d"><div className="product-3d-stage"><canvas key={attempt} ref={canvas} tabIndex={ready?0:-1} role="img" aria-label={`Interactive 3D view of ${product.name} in ${product.colors[color]}`} aria-describedby={instructions} onKeyDown={key} onPointerDown={()=>setView('custom')} onWheel={()=>setView('custom')}/>
  <div className="product-3d-heading" aria-hidden="true"><span className="eyebrow">Every angle. Every detail.</span><span className="product-3d-mark">360°</span></div>
  {!error&&<span className="product-3d-hint">Drag to rotate · Pinch or scroll to zoom</span>}
  {error&&<div className="product-3d-fallback" role="status"><p>{error}</p><div><button type="button" className="button small outline" onClick={onPhotos}>View photos</button><button type="button" className="text-button" onClick={()=>setAttempt(value=>value+1)}>Try again</button></div></div>}
 </div><div className="product-3d-tools"><div className="product-3d-presets" role="group" aria-label="3D viewing angle">{VIEWS.map(([value,label])=><button type="button" key={value} aria-pressed={view===value} disabled={!ready} onClick={()=>preset(value)}>{label}</button>)}<button type="button" disabled={!ready} aria-pressed={view==='hinge'} onClick={()=>{viewer.current?.focus('detail.hinge.right');setView('hinge')}}><MoveUpRight aria-hidden="true"/> Hinge detail</button></div><div className="product-3d-zoom" role="group" aria-label="3D zoom and reset"><button type="button" className="icon-button" aria-label="Zoom out" disabled={!ready} onClick={()=>viewer.current?.zoom(false)}><Minus/></button><button type="button" className="icon-button" aria-label="Zoom in" disabled={!ready} onClick={()=>viewer.current?.zoom(true)}><Plus/></button><button type="button" className="icon-button" aria-label="Reset 3D view" disabled={!ready} onClick={reset}><RotateCcw/></button></div></div>
  <p id={instructions} className="sr-only">Drag or swipe to rotate. Scroll or pinch to zoom. With the 3D view focused, use arrow keys to rotate, plus or minus to zoom, and R to reset. The viewing angle buttons also work with a keyboard.</p><p className="form-note product-3d-note">Generated preview · Explore the shape, finish and frame details.</p>
 </div>;
}
