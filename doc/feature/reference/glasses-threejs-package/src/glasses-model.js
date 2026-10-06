/**
 * Photo-derived black acetate eyeglasses. Three.js r186 / 0.186.1.
 * Input dimensions are millimeters. ALL returned geometry and transforms use meters.
 * +X = right when viewed from the front; +Y = up; +Z = forward.
 * No dimensions or hidden surfaces are claimed to be measured from the product.
 */
import * as THREE from 'three';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import DESIGN from './design.json';

export const DEFAULTS = Object.freeze({...DESIGN});
const mm = n => n * 0.001;

function commandPath(commands, Type = THREE.Path) {
  const path = new Type();
  for (const c of commands) {
    if (c[0] === 'M') path.moveTo(c[1], c[2]);
    if (c[0] === 'C') path.bezierCurveTo(...c.slice(1));
    if (c[0] === 'L') path.lineTo(c[1], c[2]);
  }
  return path;
}

function reverseCommands(commands, mirror = false) {
  const segments = [];
  let p = commands[0].slice(1);
  for (const c of commands.slice(1)) {
    segments.push({start:p, c});
    p = c.slice(-2);
  }
  const x = v => mirror ? -v : v;
  const result = [['M',x(p[0]),p[1]]];
  for (const {start,c} of segments.reverse()) {
    result.push(c[0] === 'C'
      ? ['C',x(c[3]),c[4],x(c[1]),c[2],x(start[0]),start[1]]
      : ['L',x(start[0]),start[1]]);
  }
  return result;
}

/** Return the same editable contours used by the SVG blueprint. */
export function getContours(overrides = {}) {
  const p = {...DEFAULTS,...overrides};
  const scaleX = p.frontWidth / DEFAULTS.frontWidth;
  const outer = [...p.outerRight, ...reverseCommands(p.outerRight,true).slice(1)]
    .map(c=>c.map((v,i)=>i>0 && i%2===1 ? v*scaleX : v));
  const sample = commandPath(p.innerRight).getPoints(512);
  const minX = Math.min(...sample.map(v=>v.x)), maxX = Math.max(...sample.map(v=>v.x));
  const minY = Math.min(...sample.map(v=>v.y)), maxY = Math.max(...sample.map(v=>v.y));
  const inner = p.innerRight.map(c=>c.map((v,i)=>{
    if (!i) return v;
    if (i%2===1) return (p.lensGap/2+(v-minX)/(maxX-minX)*p.lensWidth)*scaleX;
    return p.lensTop-p.lensHeight+(v-minY)/(maxY-minY)*p.lensHeight;
  }));
  const left = inner.map(c=>c.map((v,i)=>i>0 && i%2===1 ? -v : v));
  return {outer, right:inner, left, params:p};
}

function warp(x,y,p) {
  return -p.wrap * (x/(p.frontWidth/2))**2 + y*Math.tan(THREE.MathUtils.degToRad(p.pantoscopicTilt));
}

function extruded(commands,p,{depth,bevel,bevelThickness,holes=[],lens=false,centerX=0}={}) {
  const shape = commandPath(commands,THREE.Shape);
  for (const hole of holes) {
    const path=commandPath(hole);
    shape.holes.push(THREE.ShapeUtils.isClockWise(path.getPoints(128)) ? commandPath(reverseCommands(hole)) : path);
  }
  const coreDepth = depth - 2*bevelThickness;
  let geometry = new THREE.ExtrudeGeometry(shape,{
    depth:coreDepth,steps:1,curveSegments:40,
    bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness,
    bevelOffset:-bevel,bevelSegments:4
  });
  geometry.translate(0,0,-coreDepth/2);
  if (lens) {
    const old = geometry;
    geometry = new TessellateModifier(5,5).modify(old);
    old.dispose();
  }
  const pos = geometry.attributes.position;
  const lensCY = p.lensTop-p.lensHeight/2;
  for (let i=0;i<pos.count;i++) {
    const x=pos.getX(i), y=pos.getY(i);
    let z=pos.getZ(i)+warp(x,y,p);
    if(lens) z+=p.lensSag-((x-centerX)**2+(y-lensCY)**2)/1000;
    pos.setXYZ(i,mm(x),mm(y),mm(z));
  }
  // Shared vertices smooth the small bevels and gentle bow. No UV textures are used.
  geometry.deleteAttribute('normal');geometry.deleteAttribute('uv');
  const unmerged=geometry;geometry=mergeVertices(unmerged,1e-7);unmerged.dispose();
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function sweptTemple(p,side) {
  const scaleX = p.frontWidth / DEFAULTS.frontWidth;
  let points = p.templeControlPoints.map(v=>new THREE.Vector3(side*v[0]*scaleX,v[1],v[2]));
  const origin=points[0].clone();
  const original = new THREE.CatmullRomCurve3(points,false,'centripetal');
  const factor=p.templeLength/original.getLength();
  points=points.map(v=>v.clone().sub(origin).multiplyScalar(factor).add(origin));
  const curve=new THREE.CatmullRomCurve3(points,false,'centripetal');
  const positions=[],indices=[],radial=20,steps=100;
  for(let i=0;i<=steps;i++) {
    const t=i/steps, c=curve.getPointAt(t), tangent=curve.getTangentAt(t).normalize();
    const u=new THREE.Vector3().crossVectors(tangent,new THREE.Vector3(0,1,0)).normalize();
    const v=new THREE.Vector3().crossVectors(u,tangent).normalize();
    const halfW=THREE.MathUtils.lerp(1.6,1.25,Math.min(1,t*2));
    let halfH=3.25-1.0*Math.min(1,t*2);
    if(t>0.72) halfH+=0.25*Math.sin((t-0.72)/0.28*Math.PI);
    const endScale=t>0.975 ? Math.max(0.12,(1-t)/0.025) : 1;
    for(let j=0;j<radial;j++) {
      const a=j/radial*2*Math.PI;
      const xx=Math.sign(Math.cos(a))*Math.abs(Math.cos(a))**0.55*halfW*endScale;
      const yy=Math.sign(Math.sin(a))*Math.abs(Math.sin(a))**0.55*halfH*endScale;
      const q=c.clone().addScaledVector(u,xx).addScaledVector(v,yy).sub(origin);
      positions.push(mm(q.x),mm(q.y),mm(q.z));
      if(i<steps) {
        const a0=i*radial+j, b=i*radial+(j+1)%radial;
        const c0=a0+radial,d=b+radial;
        indices.push(a0,c0,b,b,c0,d);
      }
    }
  }
  // Watertight caps, with normals pointing away from the solid.
  for(let end=0;end<2;end++) {
    const ring=end?steps*radial:0, q=curve.getPointAt(end).sub(origin);
    const center=positions.length/3;
    positions.push(mm(q.x),mm(q.y),mm(q.z));
    for(let j=0;j<radial;j++) {
      const a=ring+j,b=ring+(j+1)%radial;
      if(end) indices.push(center,b,a); else indices.push(center,a,b);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();
  return {geometry,origin:origin.multiplyScalar(0.001),curve};
}

export function createGlasses(overrides={}) {
  const p={...DEFAULTS,...overrides};
  const contours=getContours(p), group=new THREE.Group(), parts={};
  group.name='PhotoDerived_BlackAcetate_Glasses';
  group.userData={dimensionsAreEstimated:true, units:'meters',photoSource:'reference.png',authoringDimensionsMM:{frontWidth:p.frontWidth,templeLength:p.templeLength}};
  const acetate=new THREE.MeshPhysicalMaterial({
    color:0x0b0d0f,metalness:0,roughness:p.roughness,
    clearcoat:1,clearcoatRoughness:0.14,ior:1.49
  });
  acetate.name='Glossy_Black_Acetate';
  const glass=new THREE.MeshPhysicalMaterial({
    color:0xffffff,metalness:0,roughness:0.025,transmission:1,
    opacity:1,ior:1.5,thickness:mm(p.lensThickness),
    attenuationColor:0xffffff,attenuationDistance:1,envMapIntensity:0.55
  });
  glass.name='Clear_Thin_Lens';
  const silver=new THREE.MeshStandardMaterial({color:0xb7b3a6,metalness:0.88,roughness:0.25});
  silver.name='Silver_Rivets_And_Hinges';
  function add(name,geometry,material,parent=group){
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;
    mesh.castShadow=material!==glass;mesh.receiveShadow=false;
    parent.add(mesh);parts[name]=mesh;return mesh;
  }
  const frame=add('front_frame',extruded(contours.outer,p,{depth:p.frontDepth,bevel:p.bevel,bevelThickness:p.bevelThickness,holes:[contours.right,contours.left]}),acetate);
  for(const side of [-1,1]) {
    const suffix=side>0?'R':'L',inner=side>0?contours.right:contours.left;
    // Small overlap buries the lens edge in the acetate rather than leaving a gap.
    const cx=side*(p.lensGap/2+p.lensWidth/2)*p.frontWidth/DEFAULTS.frontWidth;
    const cy=p.lensTop-p.lensHeight/2;
    const lensCommands=inner.map(c=>c.map((v,i)=>!i?v:(i%2 ? cx+(v-cx)*1.008 : cy+(v-cy)*1.008)));
    add('lens_'+suffix,extruded(lensCommands,p,{depth:p.lensThickness,bevel:0.1,bevelThickness:0.1,lens:true,centerX:cx}),glass);
    const t=sweptTemple(p,side), pivot=new THREE.Group();
    pivot.name='temple_pivot_'+suffix;pivot.position.copy(t.origin);group.add(pivot);
    parts[pivot.name]=pivot;
    add('temple_'+suffix,t.geometry,acetate,pivot);
    const rivet=add('front_rivet_'+suffix,new THREE.SphereGeometry(1,24,14),silver,frame);
    const x=side*65.6*p.frontWidth/DEFAULTS.frontWidth,y=8.3;
    rivet.position.set(mm(x),mm(y),mm(warp(x,y,p)+p.frontDepth/2+0.03));
    rivet.scale.set(mm(1.85),mm(0.63),mm(0.2));
    rivet.rotation.y=side*0.105;rivet.rotation.x=-THREE.MathUtils.degToRad(p.pantoscopicTilt);
    const pin=add('hinge_pin_'+suffix,new THREE.CylinderGeometry(mm(0.85),mm(0.85),mm(5.1),16),silver,frame);
    pin.position.copy(t.origin).add(new THREE.Vector3(mm(side*0.35),0,mm(0.25)));
    const sideBadge=add('temple_rivet_'+suffix,new THREE.SphereGeometry(1,20,12),silver,pivot);
    sideBadge.position.set(mm(side*2.5),mm(0),mm(-4.7));
    sideBadge.scale.set(mm(0.18),mm(0.68),mm(1.45));
  }
  const bases=new Map();
  for(const child of group.children) bases.set(child,child.position.clone());
  function setOpen(degrees=90){
    const angle=THREE.MathUtils.degToRad(90-THREE.MathUtils.clamp(degrees,0,90));
    parts.temple_pivot_R.rotation.y=angle;parts.temple_pivot_L.rotation.y=-angle;
  }
  function setExploded(amount=0){
    const distance=mm(amount);
    for(const child of group.children){
      child.position.copy(bases.get(child));
      if(child.name==='front_frame') child.position.z+=distance*0.3;
      if(child.name.startsWith('lens_')) {child.position.z+=distance*1.35;child.position.x+=child.name.endsWith('R')?distance*0.3:-distance*0.3;}
      if(child.name.startsWith('temple_pivot_')) {child.position.x+=child.name.endsWith('R')?distance:-distance;child.position.z-=distance*0.4;}
    }
  }
  function dispose(){
    const geometries=new Set(),materials=new Set();
    group.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);materials.add(o.material);}});
    for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
  }
  return {group,parts,params:p,materials:{acetate,glass,silver},setOpen,setExploded,dispose,contours};
}
