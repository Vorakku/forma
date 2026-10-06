export const FILTER_MIN_CUTOFF=1.0;
export const FILTER_BETA=.15; // quicker turns after video/pose sync; confirm speed versus resting jitter on a real camera
export const FILTER_D_CUTOFF=1.0;
const alpha=(cutoff:number,dt:number)=>1/(1+1/(2*Math.PI*cutoff*dt));

// Timestamps are seconds; resetting seeds the next sample without a stale tail.
export class OneEuroFilter{
 private time:number|undefined;
 private raw=0;
 private value=0;
 private derivative=0;
 constructor(private minCutoff=FILTER_MIN_CUTOFF,private beta=FILTER_BETA,private dCutoff=FILTER_D_CUTOFF){}
 reset(){this.time=undefined;this.derivative=0}
 filter(value:number,time:number){
  if(this.time===undefined){this.time=time;this.raw=this.value=value;return value}
  const dt=time-this.time;
  if(dt<=0)return this.value;
  const speed=(value-this.raw)/dt;
  this.derivative+=alpha(this.dCutoff,dt)*(speed-this.derivative);
  this.value+=alpha(this.minCutoff+this.beta*Math.abs(this.derivative),dt)*(value-this.value);
  this.raw=value;this.time=time;
  return this.value;
 }
}
