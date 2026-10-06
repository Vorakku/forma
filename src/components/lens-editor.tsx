import {useState} from 'react';
import {Modal,FormError,useSubmit} from './common';
import {LENS_TYPES,READING_POWERS,coatingsFor} from '@/lib/rules';
import {money} from '@/lib/utils';
import type {Eye,LensSelection,Prescription,Product} from '@/lib/types';
const EYES=['right','left'] as const;
// Mounted only while open, so each opening starts from the saved selection.
export function LensEditor({product,value,onSave,onClose}:{product:Product;value:LensSelection;onSave:(s:LensSelection)=>Promise<unknown>|void;onClose:()=>void}){
 const[lens,setLens]=useState(value.lens);const{error,busy,submit}=useSubmit();
 const rx=value.lens===lens?value.prescription:null;const eyes=rx&&'eyes' in rx?rx.eyes:[];
 const save=submit(async f=>{
  let prescription:Prescription|null=null;
  if(lens==='single-vision'){const read=EYES.map(eye=>({eye,sphere:Number(f[eye+'-sphere']),cylinder:Number(f[eye+'-cylinder']||0),axis:Number(f[eye+'-axis']||0)}));if(read.some(e=>f[e.eye+'-sphere']===''))throw Error('Enter the sphere for both eyes.');if(read.some(e=>e.cylinder!==0&&!e.axis))throw Error('Enter an axis for each non-zero cylinder.');if(!f.pd)throw Error('Enter your pupillary distance.');prescription={pd:Number(f.pd),eyes:read as Eye[]}}
  else if(lens==='reading')prescription={power:f.power||'1.00'};
  if(!coatingsFor(product.category).some(c=>c.id===f.coating))throw Error('Choose a lens type and finish.');
  await onSave({...value,lens,coating:f.coating,prescription});
 });
 return<Modal open onOpenChange={o=>{if(!o)onClose()}} title="Choose your lenses."><form onSubmit={save}><div className="modal-body"><p>Start with your vision, then choose a finish. Prices are added to the frame.</p>
  <h3>Your vision</h3><div className="lens-options">{LENS_TYPES.map(l=><label key={l.id} className="radio-card"><input type="radio" name="lens" value={l.id} checked={lens===l.id} onChange={()=>setLens(l.id)}/><div><strong>{l.name}</strong><p>{l.description}</p></div><span className="choice-price">{l.price?'+'+money(l.price):'Included'}</span></label>)}</div>
  {lens==='single-vision'?<><h3 style={{marginTop:30}}>Your prescription</h3><p className="form-note">Copy the values from your current prescription. They are saved with this pair in your demo order.</p>
   <div className="rx-grid"><span/><span className="rx-head">Sphere (SPH)</span><span className="rx-head">Cylinder (CYL)</span><span className="rx-head">Axis</span>{EYES.map(eye=>{const r=eyes.find(e=>e.eye===eye);return<span key={eye} style={{display:'contents'}}><span>{eye==='right'?'OD / R':'OS / L'}</span><input type="number" name={eye+'-sphere'} aria-label={eye+' sphere'} min="-12" max="12" step=".25" placeholder="0.00" defaultValue={r?.sphere} required/><input type="number" name={eye+'-cylinder'} aria-label={eye+' cylinder'} min="-6" max="6" step=".25" placeholder="0.00" defaultValue={r?.cylinder||''}/><input type="number" name={eye+'-axis'} aria-label={eye+' axis'} min="1" max="180" step="1" placeholder="1–180" defaultValue={r?.axis||''}/></span>})}</div>
   <div className="field"><label htmlFor="rx-pd">Pupillary distance (PD), mm</label><input id="rx-pd" type="number" name="pd" min="50" max="80" step=".5" defaultValue={rx&&'pd' in rx?rx.pd:''} placeholder="e.g. 63" required/></div></>
  :lens==='reading'?<div className="field" style={{marginTop:25}}><label htmlFor="reading-power">Reading power</label><select id="reading-power" name="power" defaultValue={rx&&'power' in rx?rx.power:'1.00'}>{READING_POWERS.map(n=><option key={n} value={n}>+{n}</option>)}</select></div>:null}
  <h3 style={{marginTop:30}}>Your finish</h3><div className="lens-options">{coatingsFor(product.category).map(c=><label key={c.id} className="radio-card"><input type="radio" name="coating" value={c.id} defaultChecked={value.coating===c.id}/><div><strong>{c.name}</strong><p>{c.description}</p></div><span className="choice-price">{c.price?'+'+money(c.price):'Included'}</span></label>)}</div>
  <FormError message={error}/></div><div className="modal-footer"><button className="button full" type="submit" disabled={busy}>Save lens selection</button></div></form></Modal>
}
