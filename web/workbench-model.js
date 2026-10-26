import * as C from '../node_modules/cannon-es/dist/cannon-es.js';
import {validateSceneDocument, FINISHES} from './scene-document.js';

export const PART_TYPES = Object.freeze({
  core:{radius:.22,half:[.22,.22,.22],mass:1},
  block:{half:[.24,.20,.20],mass:1.2},
  ring:{radius:.24,tube:.065,half:[.305,.305,.065],mass:.7},
  module:{half:[.28,.16,.20],mass:1.1},
  crystal:{radius:.30,half:[.30,.30,.30],mass:.8},
  column:{radius:.18,height:.55,half:[.18,.275,.18],mass:1.1},
});
const vec=p=>new C.Vec3(p.x,p.y,p.z), quat=q=>new C.Quaternion(q.x,q.y,q.z,q.w);
const add=(a,b)=>a.vadd(b), sub=(a,b)=>a.vsub(b), mul=(v,s)=>v.scale(s);
const axes=[new C.Vec3(1,0,0),new C.Vec3(0,1,0),new C.Vec3(0,0,1)];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finitePoint=value=>value&&['x','y','z'].every(k=>typeof value[k]==='number'&&Number.isFinite(value[k]));
const dimensions=p=>p.stretch||{x:1,y:1,z:1};
const stretched=(v,stretch)=>new C.Vec3(v.x*stretch.x,v.y*stretch.y,v.z*stretch.z);
function convex(vertices,faces){
 // Cannon expects counter-clockwise outward faces; normalize winding once here.
 faces=faces.map(face=>{const a=vertices[face[0]],b=vertices[face[1]],c=vertices[face[2]],normal=b.vsub(a).cross(c.vsub(a));return normal.dot(a)<0?[...face].reverse():face;});
 return new C.ConvexPolyhedron({vertices,faces});
}
function ellipsoid(radius,stretch,latitude=8,longitude=12){
 const vertices=[new C.Vec3(0,radius*stretch.y,0)],faces=[];
 for(let row=1;row<latitude;row++){const theta=Math.PI*row/latitude;for(let col=0;col<longitude;col++){const phi=Math.PI*2*col/longitude;vertices.push(new C.Vec3(radius*Math.sin(theta)*Math.cos(phi)*stretch.x,radius*Math.cos(theta)*stretch.y,radius*Math.sin(theta)*Math.sin(phi)*stretch.z));}}
 const bottom=vertices.length;vertices.push(new C.Vec3(0,-radius*stretch.y,0));
 for(let col=0;col<longitude;col++){const next=(col+1)%longitude;faces.push([0,1+col,1+next]);for(let row=0;row<latitude-2;row++){const start=1+row*longitude;faces.push([start+col,start+longitude+col,start+longitude+next,start+next]);}const last=1+(latitude-2)*longitude;faces.push([last+col,bottom,last+next]);}
 return convex(vertices,faces);
}
function shapes(part) {
 const d=PART_TYPES[part.type],s=part.scale,t=dimensions(part),uniform=Math.abs(t.x-t.y)<1e-9&&Math.abs(t.y-t.z)<1e-9;
 if(part.type==='core')return [{shape:uniform?new C.Sphere(d.radius*s*t.x):ellipsoid(d.radius*s,t),offset:new C.Vec3()}];
 if(part.type==='ring')return Array.from({length:16},(_,i)=>({shape:uniform?new C.Sphere(d.tube*s*t.x):ellipsoid(d.tube*s,t,4,8),offset:new C.Vec3(Math.cos(i*Math.PI/8)*d.radius*s*t.x,Math.sin(i*Math.PI/8)*d.radius*s*t.y,0)}));
 if(part.type==='crystal'){
  const r=d.radius*s,vertices=[new C.Vec3(r,0,0),new C.Vec3(-r,0,0),new C.Vec3(0,r,0),new C.Vec3(0,-r,0),new C.Vec3(0,0,r),new C.Vec3(0,0,-r)].map(v=>stretched(v,t));
  return[{shape:convex(vertices,[[0,2,4],[4,2,1],[1,2,5],[5,2,0],[4,3,0],[1,3,4],[5,3,1],[0,3,5]]),offset:new C.Vec3()}];
 }
 if(part.type==='column'){
  const cylinder=new C.Cylinder(d.radius*s,d.radius*s,d.height*s,24);
  if(!uniform){const shape=convex(cylinder.vertices.map(v=>stretched(v,t)),cylinder.faces);return[{shape,offset:new C.Vec3()}];}
  if(t.x!==1)return[{shape:new C.Cylinder(d.radius*s*t.x,d.radius*s*t.x,d.height*s*t.x,24),offset:new C.Vec3()}];
  return[{shape:cylinder,offset:new C.Vec3()}];
 }
 const result=[{shape:new C.Box(new C.Vec3(...d.half.map((n,i)=>n*s*t[['x','y','z'][i]]))),offset:new C.Vec3()}];
 if(part.type==='module')result.push({shape:new C.Box(new C.Vec3(.12*s*t.x,.08*s*t.y,.12*s*t.z)),offset:new C.Vec3(0,.22*s*t.y,0)});
 return result;
}
function primitives(part,pose=part) {return shapes(part).map(item=>({shape:item.shape,position:add(pose.position,pose.quaternion.vmult(item.offset)),quaternion:pose.quaternion}));}
function convexData(primitive){const c=primitive.shape instanceof C.Box?primitive.shape.convexPolyhedronRepresentation:primitive.shape;return{vertices:c.vertices.map(v=>add(primitive.position,primitive.quaternion.vmult(v))),normals:c.faceNormals.map(v=>primitive.quaternion.vmult(v)),edges:c.uniqueEdges.map(v=>primitive.quaternion.vmult(v)),faces:c.faces};}
function overlap(a,b,tolerance=.018) {
 const sphereA=a.shape instanceof C.Sphere,sphereB=b.shape instanceof C.Sphere;
 if(sphereA&&sphereB)return a.position.distanceTo(b.position)<a.shape.radius+b.shape.radius-tolerance;
 if(sphereB)return overlap(b,a,tolerance);
 const aa=sphereA?null:convexData(a),bb=convexData(b),candidates=[...bb.normals];
 if(sphereA){
  // Face, vertex and nearest-edge axes cover rounded sphere/convex corners.
  for(const vertex of bb.vertices)candidates.push(sub(a.position,vertex));
  for(const face of bb.faces)for(let i=0;i<face.length;i++){const start=bb.vertices[face[i]],end=bb.vertices[face[(i+1)%face.length]],edge=sub(end,start),length=edge.lengthSquared();if(length>1e-12){const nearest=add(start,mul(edge,clamp(sub(a.position,start).dot(edge)/length,0,1)));candidates.push(sub(a.position,nearest));}}
 }else candidates.push(...aa.normals,...aa.edges.flatMap(x=>bb.edges.map(y=>x.cross(y))));
 for(const axis of candidates){if(axis.lengthSquared()<1e-10)continue;axis.normalize();
  const range=data=>{const dots=data.vertices.map(v=>v.dot(axis));return[Math.min(...dots),Math.max(...dots)];};
  const left=sphereA?[a.position.dot(axis)-a.shape.radius,a.position.dot(axis)+a.shape.radius]:range(aa),right=range(bb);
  if(Math.min(left[1],right[1])-Math.max(left[0],right[0])<=tolerance)return false;
 }return true;
}
function lowest(primitive){if(primitive.shape instanceof C.Sphere)return primitive.position.y-primitive.shape.radius;return Math.min(...convexData(primitive).vertices.map(v=>v.y));}

export class WorkbenchModel {
  constructor(){
    this.world=new C.World({gravity:new C.Vec3(0,-3,0),allowSleep:true});
    this.world.solver.iterations=15;
    this.world.defaultContactMaterial.friction=.4;this.world.defaultContactMaterial.restitution=.45;
    this.floor=new C.Body({mass:0,shape:new C.Plane()});this.floor.quaternion.setFromEuler(-Math.PI/2,0,0);this.floorY=-1.2;this.floor.position.y=this.floorY;this.world.addBody(this.floor);
    this.parts=new Map();this.assemblies=new Map();this.links=[];this.frozen=false;this.gravity=true;this.nextId=1;this.reset();
  }
  reset(){for(const a of this.assemblies.values())this.world.removeBody(a.body);this.parts.clear();this.assemblies.clear();this.links=[];this.nextId=1;
    ['core','block','ring','module'].forEach((type,i)=>this.add(type,{x:(i-1.5)*.72,y:.4+(i%2)*.35,z:0}));
  }
  add(type,position={x:0,y:.8,z:0}){if(!PART_TYPES[type]||this.parts.size>=12)return null;
    const id='part-'+this.nextId++,p={id,type,scale:1,stretch:{x:1,y:1,z:1},color:'#75e8ec',finish:'hologram',position:vec(position),quaternion:new C.Quaternion()};this.parts.set(id,p);this.rebuild();return p;
  }
  editPart(id,patch={}){
    const part=this.parts.get(id);if(!part)throw new Error('Select an object first');
    const type=patch.type??part.type,stretch=patch.stretch??dimensions(part),color=patch.color??part.color,finish=patch.finish??part.finish;
    if(!Object.hasOwn(PART_TYPES,type))throw new Error('Unknown shape');
    if(!stretch||!['x','y','z'].every(k=>Number.isFinite(stretch[k])&&stretch[k]>=.5&&stretch[k]<=2))throw new Error('Dimensions must be between 0.5 and 2');
    if(typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color))throw new Error('Invalid object colour');
    if(!FINISHES.includes(finish))throw new Error('Unknown material');
    const reshaping=type!==part.type||['x','y','z'].some(k=>stretch[k]!==dimensions(part)[k]);
    if(reshaping&&this.links.some(l=>l.a.partId===id||l.b.partId===id))throw new Error('Detach before reshaping a connected part');
    part.type=type;part.stretch={...stretch};part.color=color.toLowerCase();part.finish=finish;
    if(reshaping)this.rebuild();return part;
  }
  duplicatePart(id){
    const original=this.parts.get(id);if(!original||this.parts.size>=12)return null;this.sync();
    const duplicate=this.add(original.type,{x:clamp(original.position.x+.5,-19,19),y:clamp(original.position.y+.2,-19,19),z:clamp(original.position.z,-19,19)});
    duplicate.scale=original.scale;duplicate.stretch={...dimensions(original)};duplicate.color=original.color;duplicate.finish=original.finish;duplicate.quaternion.copy(original.quaternion);this.rebuildFromEdited();return duplicate;
  }
  snapshot(){
    this.sync();return{version:1,parts:[...this.parts.values()].map(p=>({id:p.id,type:p.type,scale:p.scale,stretch:{...dimensions(p)},color:p.color,finish:p.finish,position:{x:p.position.x,y:p.position.y,z:p.position.z},quaternion:{x:p.quaternion.x,y:p.quaternion.y,z:p.quaternion.z,w:p.quaternion.w}})),links:this.links.map(l=>({a:{...l.a},b:{...l.b}})),gravity:this.gravity,frozen:this.frozen};
  }
  restore(document){
    const data=validateSceneDocument(document);
    // Validation is complete before touching the live scene or its physics world.
    for(const a of this.assemblies.values())this.world.removeBody(a.body);this.assemblies.clear();this.parts.clear();
    for(const p of data.parts)this.parts.set(p.id,{...p,position:vec(p.position),quaternion:quat(p.quaternion)});
    this.links=data.links;this.gravity=data.gravity;this.frozen=data.frozen;this.nextId=Math.max(0,...data.parts.map(p=>Number(p.id.slice(5))))+1;this.lastGravity=undefined;this.world.accumulator=0;this.rebuild();return this;
  }
  assemblyFor(id){return [...this.assemblies.values()].find(a=>a.partIds.includes(id))||null;}
  sync(){for(const a of this.assemblies.values())for(const id of a.partIds){const p=this.parts.get(id),local=a.locals.get(id);p.position=add(a.body.position,a.body.quaternion.vmult(local.position));p.quaternion=a.body.quaternion.mult(local.quaternion);}}
  rebuild(){
    const velocities=new Map();this.sync();for(const a of this.assemblies.values()){for(const id of a.partIds){const p=this.parts.get(id);if(p)velocities.set(id,{velocity:a.body.getVelocityAtWorldPoint(p.position,new C.Vec3()),angular:a.body.angularVelocity.clone(),quaternion:a.body.quaternion.clone(),held:a.body.type===C.Body.KINEMATIC});}this.world.removeBody(a.body);}
    this.assemblies.clear();const seen=new Set();
    for(const id of this.parts.keys()){if(seen.has(id))continue;const ids=[],queue=[id];while(queue.length){const next=queue.pop();if(seen.has(next))continue;seen.add(next);ids.push(next);for(const l of this.links){if(l.a.partId===next)queue.push(l.b.partId);if(l.b.partId===next)queue.push(l.a.partId);}}
      const center=new C.Vec3();ids.forEach(key=>center.vadd(this.parts.get(key).position,center));center.scale(1/ids.length,center);
      const mass=ids.reduce((sum,key)=>{const p=this.parts.get(key);return sum+PART_TYPES[p.type].mass*p.scale**3*dimensions(p).x*dimensions(p).y*dimensions(p).z;},0);
      const orientation=velocities.get(id)?.quaternion||new C.Quaternion();
      const body=new C.Body({mass,position:center,quaternion:orientation,linearDamping:.18,angularDamping:.35,allowSleep:true,sleepSpeedLimit:.08,sleepTimeLimit:.8});
      const locals=new Map();for(const key of ids){const p=this.parts.get(key),local={position:orientation.inverse().vmult(sub(p.position,center)),quaternion:orientation.inverse().mult(p.quaternion)};locals.set(key,local);for(const item of shapes(p))body.addShape(item.shape,add(local.position,local.quaternion.vmult(item.offset)),local.quaternion);}
      const previous=velocities.get(id);if(previous){const centerVelocity=new C.Vec3();let count=0;for(const key of ids){const sample=velocities.get(key);if(sample){centerVelocity.vadd(sample.velocity,centerVelocity);count++;}}if(count)centerVelocity.scale(1/count,centerVelocity);body.velocity.copy(centerVelocity);body.angularVelocity.copy(previous.angular);if(previous.held)body.type=C.Body.KINEMATIC;}
      body.updateMassProperties();this.world.addBody(body);this.assemblies.set(id,{id,partIds:ids,body,locals});
    }
  }
  hold(id){const a=this.assemblyFor(id);if(!a)return null;a.body.type=C.Body.KINEMATIC;a.body.velocity.setZero();a.body.angularVelocity.setZero();a.body.updateMassProperties();a.body.wakeUp();return a;}
  move(id,position){if(!finitePoint(position))throw new Error('Position must contain finite numbers');const a=this.assemblyFor(id);if(!a)return;a.body.position.copy(vec(position));a.body.aabbNeedsUpdate=true;a.body.wakeUp();this.sync();}
  transform(id,{position,quaternion,scaleFactor=1}={}){
    // Numeric inspector edits must fail before syncing or changing any live pose.
    if(position!==undefined&&!finitePoint(position))throw new Error('Position must contain finite numbers');
    if(typeof scaleFactor!=='number'||!Number.isFinite(scaleFactor)||scaleFactor<=0)throw new Error('Scale must be a positive finite number');
    if(quaternion!==undefined&&(!finitePoint(quaternion)||typeof quaternion.w!=='number'||!Number.isFinite(quaternion.w)||Math.abs(Math.hypot(quaternion.x,quaternion.y,quaternion.z,quaternion.w)-1)>.001))throw new Error('Orientation must be finite and normalized');
    const a=this.assemblyFor(id);if(!a)return false;this.sync();
    let factor=scaleFactor;for(const key of a.partIds){const p=this.parts.get(key);factor=clamp(factor,.6/p.scale,2/p.scale);}
    const radius=Math.max(...a.partIds.map(key=>{const p=this.parts.get(key);return p.position.distanceTo(a.body.position)+Math.max(...PART_TYPES[p.type].half.map((n,i)=>n*dimensions(p)[['x','y','z'][i]]))*p.scale;}));
    factor=Math.min(factor,1.65/radius);factor=Math.max(factor,Math.max(...a.partIds.map(key=>.6/this.parts.get(key).scale)));
    const center=a.body.position.clone(),rotation=quaternion?quat(quaternion).mult(a.body.quaternion.inverse()):new C.Quaternion();
    const destination=position?vec(position):center;
    for(const key of a.partIds){const p=this.parts.get(key);p.position=add(destination,rotation.vmult(mul(sub(p.position,center),factor)));p.quaternion=rotation.mult(p.quaternion);p.scale*=factor;}
    if(quaternion)a.body.quaternion.copy(quat(quaternion));
    // Rebuild from edited world poses, without sync overwriting them.
    this.rebuildFromEdited();return true;
  }
  rebuildFromEdited(){const saved=new Map([...this.parts].map(([id,p])=>[id,{position:p.position.clone(),quaternion:p.quaternion.clone()}]));
    // Update existing locals so rebuild's initial sync reads edited poses.
    for(const a of this.assemblies.values())for(const id of a.partIds){const p=saved.get(id);if(p)a.locals.set(id,{position:a.body.quaternion.inverse().vmult(sub(p.position,a.body.position)),quaternion:a.body.quaternion.inverse().mult(p.quaternion)});}this.rebuild();
  }
  setDepth(id,z){const a=this.assemblyFor(id);if(a)this.move(id,{x:a.body.position.x,y:a.body.position.y,z:clamp(z,-1.2,1.2)});}
  connectors(id){const p=this.parts.get(id);if(!p)return[];const d=PART_TYPES[p.type],directions=p.type==='ring'?[new C.Vec3(0,0,1),new C.Vec3(0,0,-1)]:[...axes,...axes.map(x=>mul(x,-1))];
    return directions.map((normal,index)=>{const h=d.half,t=dimensions(p),local=p.type==='ring'?new C.Vec3(d.radius*p.scale*t.x,0,normal.z*d.tube*p.scale*t.z):new C.Vec3(normal.x*h[0]*p.scale*t.x,normal.y*(p.type==='module'&&normal.y>0?.30:h[1])*p.scale*t.y,normal.z*h[2]*p.scale*t.z);
      return{partId:id,index,position:add(p.position,p.quaternion.vmult(local)),normal:p.quaternion.vmult(normal),occupied:this.links.some(l=>[l.a,l.b].some(c=>c.partId===id&&c.index===index))};});
  }
  preview(id){this.sync();const a=this.assemblyFor(id);if(!a)return null;const own=new Set(a.partIds),candidates=[];
    for(const key of a.partIds)for(const source of this.connectors(key).filter(c=>!c.occupied))for(const p of this.parts.values()){if(own.has(p.id))continue;for(const target of this.connectors(p.id).filter(c=>!c.occupied)){
      const distance=source.position.distanceTo(target.position),limit=clamp(.13*Math.min(this.parts.get(key).scale,p.scale),.06,.18);if(distance>limit)continue;
      const rotation=new C.Quaternion();rotation.setFromVectors(source.normal,mul(target.normal,-1));
      const poses=a.partIds.map(partId=>{const part=this.parts.get(partId);return{id:partId,position:add(target.position,rotation.vmult(sub(part.position,source.position))),quaternion:rotation.mult(part.quaternion)};});
      let blocked=false;for(const pose of poses){const part=this.parts.get(pose.id);if(primitives(part,pose).some(pa=>lowest(pa)<this.floorY-.02)){blocked=true;break;}
        for(const other of this.parts.values()){if(own.has(other.id))continue;if(primitives(part,pose).some(pa=>primitives(other).some(pb=>overlap(pa,pb)))){blocked=true;break;}}if(blocked)break;}
      if(!blocked)candidates.push({source,target,poses,distance});
    }}return candidates.sort((x,y)=>x.distance-y.distance)[0]||null;
  }
  release(id,velocity={x:0,y:0,z:0},snap=true){const candidate=snap?this.preview(id):null;
    if(candidate){for(const pose of candidate.poses){const p=this.parts.get(pose.id);p.position=pose.position;p.quaternion=pose.quaternion;}this.links.push({a:{partId:candidate.source.partId,index:candidate.source.index},b:{partId:candidate.target.partId,index:candidate.target.index}});this.rebuildFromEdited();}
    const a=this.assemblyFor(id);if(a){a.body.type=C.Body.DYNAMIC;a.body.updateMassProperties();const v=vec(velocity);if(v.length()>4)v.scale(4/v.length(),v);a.body.velocity.copy(candidate?new C.Vec3():v);a.body.angularVelocity.setZero();a.body.wakeUp();}return candidate;
  }
  detach(id){this.links=this.links.filter(l=>l.a.partId!==id&&l.b.partId!==id);this.rebuild();}
  deletePart(id){this.sync();this.links=this.links.filter(l=>l.a.partId!==id&&l.b.partId!==id);this.parts.delete(id);for(const a of this.assemblies.values()){a.partIds=a.partIds.filter(key=>key!==id);}this.rebuild();}
  step(dt){if(this.lastGravity!==this.gravity){for(const a of this.assemblies.values())a.body.wakeUp();this.lastGravity=this.gravity;}this.world.gravity.set(0,this.gravity?-3:0,0);if(!this.frozen)this.world.step(1/120,clamp(dt,0,8/120),8);this.sync();}
}
