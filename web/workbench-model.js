import * as C from '../node_modules/cannon-es/dist/cannon-es.js';

export const PART_TYPES = Object.freeze({
  core:{radius:.22,half:[.22,.22,.22],mass:1},
  block:{half:[.24,.20,.20],mass:1.2},
  ring:{radius:.24,tube:.065,half:[.305,.305,.065],mass:.7},
  module:{half:[.28,.16,.20],mass:1.1},
});
const vec=p=>new C.Vec3(p.x,p.y,p.z), quat=q=>new C.Quaternion(q.x,q.y,q.z,q.w);
const add=(a,b)=>a.vadd(b), sub=(a,b)=>a.vsub(b), mul=(v,s)=>v.scale(s);
const axes=[new C.Vec3(1,0,0),new C.Vec3(0,1,0),new C.Vec3(0,0,1)];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function shapes(part) {
  const d=PART_TYPES[part.type],s=part.scale;
  if(part.type==='core')return [{shape:new C.Sphere(d.radius*s),offset:new C.Vec3()}];
  if(part.type==='ring')return Array.from({length:16},(_,i)=>({shape:new C.Sphere(d.tube*s),offset:new C.Vec3(Math.cos(i*Math.PI/8)*d.radius*s,Math.sin(i*Math.PI/8)*d.radius*s,0)}));
  const result=[{shape:new C.Box(new C.Vec3(...d.half.map(n=>n*s))),offset:new C.Vec3()}];
  if(part.type==='module')result.push({shape:new C.Box(new C.Vec3(.12*s,.08*s,.12*s)),offset:new C.Vec3(0,.22*s,0)});
  return result;
}
function primitives(part,pose=part) {return shapes(part).map(item=>({shape:item.shape,position:add(pose.position,pose.quaternion.vmult(item.offset)),quaternion:pose.quaternion}));}
function overlap(a,b,tolerance=.018) {
  const sa=a.shape,sb=b.shape;
  if(sa instanceof C.Sphere&&sb instanceof C.Sphere)return a.position.distanceTo(b.position)<sa.radius+sb.radius-tolerance;
  if(sa instanceof C.Box&&sb instanceof C.Sphere)return overlap(b,a,tolerance);
  if(sa instanceof C.Sphere) {
    const p=b.quaternion.inverse().vmult(sub(a.position,b.position)),h=sb.halfExtents;
    const nearest=new C.Vec3(clamp(p.x,-h.x,h.x),clamp(p.y,-h.y,h.y),clamp(p.z,-h.z,h.z));
    return p.distanceTo(nearest)<sa.radius-tolerance;
  }
  const aa=axes.map(x=>a.quaternion.vmult(x)),bb=axes.map(x=>b.quaternion.vmult(x));
  const candidates=[...aa,...bb,...aa.flatMap(x=>bb.map(y=>x.cross(y)))],delta=sub(b.position,a.position);
  for(const axis of candidates){if(axis.lengthSquared()<1e-10)continue;axis.normalize();
    const ra=aa.reduce((sum,x,i)=>sum+Math.abs(x.dot(axis))*sa.halfExtents[['x','y','z'][i]],0);
    const rb=bb.reduce((sum,x,i)=>sum+Math.abs(x.dot(axis))*sb.halfExtents[['x','y','z'][i]],0);
    if(Math.abs(delta.dot(axis))>=ra+rb-tolerance)return false;
  }return true;
}

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
    const id='part-'+this.nextId++,p={id,type,scale:1,position:vec(position),quaternion:new C.Quaternion()};this.parts.set(id,p);this.rebuild();return p;
  }
  assemblyFor(id){return [...this.assemblies.values()].find(a=>a.partIds.includes(id))||null;}
  sync(){for(const a of this.assemblies.values())for(const id of a.partIds){const p=this.parts.get(id),local=a.locals.get(id);p.position=add(a.body.position,a.body.quaternion.vmult(local.position));p.quaternion=a.body.quaternion.mult(local.quaternion);}}
  rebuild(){
    const velocities=new Map();this.sync();for(const a of this.assemblies.values()){for(const id of a.partIds){const p=this.parts.get(id);if(p)velocities.set(id,{velocity:a.body.getVelocityAtWorldPoint(p.position,new C.Vec3()),angular:a.body.angularVelocity.clone(),quaternion:a.body.quaternion.clone(),held:a.body.type===C.Body.KINEMATIC});}this.world.removeBody(a.body);}
    this.assemblies.clear();const seen=new Set();
    for(const id of this.parts.keys()){if(seen.has(id))continue;const ids=[],queue=[id];while(queue.length){const next=queue.pop();if(seen.has(next))continue;seen.add(next);ids.push(next);for(const l of this.links){if(l.a.partId===next)queue.push(l.b.partId);if(l.b.partId===next)queue.push(l.a.partId);}}
      const center=new C.Vec3();ids.forEach(key=>center.vadd(this.parts.get(key).position,center));center.scale(1/ids.length,center);
      const mass=ids.reduce((sum,key)=>{const p=this.parts.get(key);return sum+PART_TYPES[p.type].mass*p.scale**3;},0);
      const orientation=velocities.get(id)?.quaternion||new C.Quaternion();
      const body=new C.Body({mass,position:center,quaternion:orientation,linearDamping:.18,angularDamping:.35,allowSleep:true,sleepSpeedLimit:.08,sleepTimeLimit:.8});
      const locals=new Map();for(const key of ids){const p=this.parts.get(key),local={position:orientation.inverse().vmult(sub(p.position,center)),quaternion:orientation.inverse().mult(p.quaternion)};locals.set(key,local);for(const item of shapes(p))body.addShape(item.shape,add(local.position,local.quaternion.vmult(item.offset)),local.quaternion);}
      const previous=velocities.get(id);if(previous){const centerVelocity=new C.Vec3();let count=0;for(const key of ids){const sample=velocities.get(key);if(sample){centerVelocity.vadd(sample.velocity,centerVelocity);count++;}}if(count)centerVelocity.scale(1/count,centerVelocity);body.velocity.copy(centerVelocity);body.angularVelocity.copy(previous.angular);if(previous.held)body.type=C.Body.KINEMATIC;}
      body.updateMassProperties();this.world.addBody(body);this.assemblies.set(id,{id,partIds:ids,body,locals});
    }
  }
  hold(id){const a=this.assemblyFor(id);if(!a)return null;a.body.type=C.Body.KINEMATIC;a.body.velocity.setZero();a.body.angularVelocity.setZero();a.body.updateMassProperties();a.body.wakeUp();return a;}
  move(id,position){const a=this.assemblyFor(id);if(!a)return;a.body.position.copy(vec(position));a.body.aabbNeedsUpdate=true;a.body.wakeUp();this.sync();}
  transform(id,{position,quaternion,scaleFactor=1}={}){
    const a=this.assemblyFor(id);if(!a)return false;this.sync();
    let factor=scaleFactor;for(const key of a.partIds){const p=this.parts.get(key);factor=clamp(factor,.6/p.scale,2/p.scale);}
    const radius=Math.max(...a.partIds.map(key=>{const p=this.parts.get(key);return p.position.distanceTo(a.body.position)+Math.max(...PART_TYPES[p.type].half)*p.scale;}));
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
    return directions.map((normal,index)=>{const h=d.half,local=p.type==='ring'?new C.Vec3(d.radius*p.scale,0,normal.z*d.tube*p.scale):new C.Vec3(normal.x*h[0]*p.scale,normal.y*(p.type==='module'&&normal.y>0?.30:h[1])*p.scale,normal.z*h[2]*p.scale);
      return{partId:id,index,position:add(p.position,p.quaternion.vmult(local)),normal:p.quaternion.vmult(normal),occupied:this.links.some(l=>[l.a,l.b].some(c=>c.partId===id&&c.index===index))};});
  }
  preview(id){this.sync();const a=this.assemblyFor(id);if(!a)return null;const own=new Set(a.partIds),candidates=[];
    for(const key of a.partIds)for(const source of this.connectors(key).filter(c=>!c.occupied))for(const p of this.parts.values()){if(own.has(p.id))continue;for(const target of this.connectors(p.id).filter(c=>!c.occupied)){
      const distance=source.position.distanceTo(target.position),limit=clamp(.13*Math.min(this.parts.get(key).scale,p.scale),.06,.18);if(distance>limit)continue;
      const rotation=new C.Quaternion();rotation.setFromVectors(source.normal,mul(target.normal,-1));
      const poses=a.partIds.map(partId=>{const part=this.parts.get(partId);return{id:partId,position:add(target.position,rotation.vmult(sub(part.position,source.position))),quaternion:rotation.mult(part.quaternion)};});
      let blocked=false;for(const pose of poses){const part=this.parts.get(pose.id);if(primitives(part,pose).some(pa=>pa.position.y-(pa.shape.radius??axes.reduce((sum,x,i)=>sum+Math.abs(pa.quaternion.vmult(x).y)*pa.shape.halfExtents[['x','y','z'][i]],0))<this.floorY-.02)){blocked=true;break;}
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
