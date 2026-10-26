import * as THREE from './vendor/three/three.module.js';
import {WorkbenchModel} from './workbench-model.js';
import {createArtMesh,updateArtMaterial} from './art-meshes.js';
import {RoomEnvironment} from './vendor/addons/environments/RoomEnvironment.js';
const cyan=0x8de4d2,amber=0xffbf7b;
const vector=v=>new THREE.Vector3(v.x,v.y,v.z),quat=q=>new THREE.Quaternion(q.x,q.y,q.z,q.w);

export class ARScene {
 constructor(canvas){
  this.canvas=canvas;this.model=new WorkbenchModel();this.selected=null;this.hands=new Map();this.samples=[];this.cameraMode=false;
  this.renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.setClearColor(0,0);
  this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;
  this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(46,16/9,.05,60);
  this.camera.position.set(0,1.3,6);this.camera.lookAt(0,.3,0);this.camera.updateMatrixWorld();
  this.scene.add(new THREE.HemisphereLight(0xe8f6ee,0x3c3548,.7));
  const light=new THREE.DirectionalLight(0xffead7,2.5);light.position.set(3,5,4);light.castShadow=true;
  light.shadow.mapSize.set(1024,1024);light.shadow.camera.left=-4;light.shadow.camera.right=4;light.shadow.camera.top=4;light.shadow.camera.bottom=-4;light.shadow.bias=-.0005;this.scene.add(light);
  const fill=new THREE.DirectionalLight(0xb0c4ff,1.2);fill.position.set(-3,1,-2);this.scene.add(fill);
  const environment=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(this.renderer);
  this.environment=pmrem.fromScene(environment,.04);this.scene.environment=this.environment.texture;environment.dispose();pmrem.dispose();
  this.floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.ShadowMaterial({color:0x000000,opacity:.23}));this.floor.rotation.x=-Math.PI/2;this.floor.position.y=this.model.floorY-.002;this.floor.receiveShadow=true;this.scene.add(this.floor);
  this.grid=new THREE.GridHelper(12,36,0x648a84,0x405853);this.grid.position.y=this.model.floorY;this.grid.material.transparent=true;this.grid.material.opacity=.16;this.scene.add(this.grid);
  this.meshes=new Map();this.ghosts=new THREE.Group();this.scene.add(this.ghosts);this.ports=new THREE.Group();this.scene.add(this.ports);this.cursor=new THREE.Group();this.scene.add(this.cursor);
  this.raycaster=new THREE.Raycaster();this.portGeometry=new THREE.SphereGeometry(.022,8,6);this.portMaterial=new THREE.MeshBasicMaterial({color:cyan,transparent:true,opacity:.6});this.activePortMaterial=new THREE.MeshBasicMaterial({color:amber});
  this.cursorGeometry=new THREE.RingGeometry(.035,.044,24);this.cursorMaterial=new THREE.MeshBasicMaterial({color:amber,side:THREE.DoubleSide,transparent:true,opacity:.9});this.resize();this.sync();
 }
 makeMesh(part,ghost=false){return createArtMesh(part,{ghost,cameraMode:this.cameraMode});}
 clearGroup(group){for(const child of [...group.children]){child.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();});group.remove(child);}}
 setCameraMode(enabled){this.cancel();this.cameraMode=enabled;this.floor.visible=!enabled;this.grid.material.opacity=enabled?.3:.16;this.sync();}
 sync(){
  for(const ghost of [...this.ghosts.children]){const part=this.model.parts.get(ghost.userData.partId);if(!part||part.type!==ghost.userData.artType){this.clearGroup(ghost);this.ghosts.remove(ghost);}}
  for(const [id,mesh] of this.meshes)if(!this.model.parts.has(id)||this.model.parts.get(id).type!==mesh.userData.artType){this.clearGroup(mesh);this.scene.remove(mesh);this.meshes.delete(id);}
  for(const part of this.model.parts.values()){
   let mesh=this.meshes.get(part.id);if(!mesh){mesh=this.makeMesh(part);this.meshes.set(part.id,mesh);this.scene.add(mesh);}
   mesh.position.copy(part.position);mesh.quaternion.copy(part.quaternion);const t=part.stretch||{x:1,y:1,z:1};mesh.scale.set(part.scale*t.x,part.scale*t.y,part.scale*t.z);
   updateArtMaterial(mesh,part,{selected:part.id===this.selected,hovered:part.id===this.hovered,cameraMode:this.cameraMode});
  }
  if(this.selected&&!this.model.parts.has(this.selected))this.selected=null;
 }
 resize(){const r=this.canvas.getBoundingClientRect();this.renderer.setSize(r.width||1280,r.height||720,false);this.camera.aspect=(r.width||1280)/(r.height||720);this.camera.updateProjectionMatrix();}
 ray(point){this.raycaster.setFromCamera(new THREE.Vector2(point.x*2-1,1-point.y*2),this.camera);return this.raycaster.ray;}
 planePoint(point,z){return this.ray(point).intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),-z),new THREE.Vector3());}
 pick(point){this.sync();this.scene.updateMatrixWorld(true);this.ray(point);return this.raycaster.intersectObjects([...this.meshes.values()],true).find(hit=>hit.object.isMesh&&hit.object.userData.artBody&&hit.object.userData.partId)?.object.userData.partId||null;}
 baseline(){if(!this.held)return;const a=this.model.assemblyFor(this.held);if(!a)return;const hands=[...this.hands.values()];if(!hands.length)return;const points=hands.map(h=>this.planePoint(h.point,a.body.position.z));if(points.some(p=>!p))return;const center=points.length===2?points[0].clone().add(points[1]).multiplyScalar(.5):points[0];this.gesture={offset:vector(a.body.position).sub(center),distance:points.length===2?points[0].distanceTo(points[1]):0,angle:points.length===2?Math.atan2(points[1].y-points[0].y,points[1].x-points[0].x):0,quaternion:quat(a.body.quaternion),baseScale:this.model.parts.get(this.held).scale};}
 events(events){if(this.rebaselinePending){for(const e of events)if(e.type==='move'&&this.hands.has(e.id))this.hands.set(e.id,e);this.baseline();this.rebaselinePending=false;}for(const e of events){if(e.type==='start'){if(this.editor?.dragging)continue;this.hands.set(e.id,e);if(!this.held){const hit=this.pick(e.point);if(hit){this.onBeforeEdit?.();this.selected=hit;this.held=hit;this.model.hold(hit);this.samples=[];}}this.baseline();}else if(e.type==='move'){if(!this.hands.has(e.id))continue;this.hands.set(e.id,e);this.manipulate(e.timestamp);}else if(e.type==='end'){this.hands.delete(e.id);if(!e.throwAllowed){this.cancel();continue;}if(this.held&&!this.hands.size)this.release(e.throwAllowed,e.timestamp);else this.baseline();}}}
 setTrackingComplete(complete){if(this.trackingPaused&&complete)this.rebaselinePending=true;this.trackingPaused=!complete;}
 manipulate(timestamp){if(!this.held||!this.gesture||this.trackingPaused)return;const a=this.model.assemblyFor(this.held);if(!a)return;const points=[...this.hands.values()].map(h=>this.planePoint(h.point,a.body.position.z));if(points.some(p=>!p))return;const center=points.length===2?points[0].clone().add(points[1]).multiplyScalar(.5):points[0];const position=center.add(this.gesture.offset);position.x=THREE.MathUtils.clamp(position.x,-3,3);position.y=THREE.MathUtils.clamp(position.y,-.9,3);
  if(points.length===2&&this.gesture.distance>.04){const ratio=THREE.MathUtils.clamp(points[0].distanceTo(points[1])/this.gesture.distance,.3,3),angle=Math.atan2(points[1].y-points[0].y,points[1].x-points[0].x)-this.gesture.angle,q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),angle).multiply(this.gesture.quaternion);this.model.transform(this.held,{position,quaternion:q,scaleFactor:ratio*this.gesture.baseScale/this.model.parts.get(this.held).scale});}else this.model.move(this.held,position);
  this.samples.push({timestamp,position:position.clone()});this.samples=this.samples.filter(p=>timestamp-p.timestamp<=120);
 }
 release(throwAllowed=false,timestamp=performance.now()){if(!this.held)return;let velocity=new THREE.Vector3();const samples=this.samples.filter(p=>timestamp-p.timestamp<=120);if(throwAllowed&&samples.length>1){const first=samples[0],last=samples.at(-1),seconds=(last.timestamp-first.timestamp)/1000;if(seconds>.015)velocity.copy(last.position).sub(first.position).divideScalar(seconds);if(velocity.length()>4)velocity.setLength(4);}this.model.release(this.held,velocity,throwAllowed);this.held=null;this.gesture=null;this.samples=[];}
 cancel(){this.release(false);this.hands.clear();this.trackingPaused=false;this.rebaselinePending=false;}
 setDepth(z){if(!this.selected)return;this.model.setDepth(this.selected,z);this.baseline();this.samples=[];}
 add(type){this.cancel();const part=this.model.add(type);if(part)this.selected=part.id||part;this.sync();}
 detach(){this.cancel();if(this.selected)this.model.detach(this.selected);this.sync();}
 delete(){this.cancel();if(this.selected)this.model.deletePart(this.selected);this.selected=null;this.sync();}
 reset(){this.cancel();this.model.reset();this.selected=null;this.sync();}
 render(dt){
  this.model.step(Math.min(dt,.1));this.sync();this.editor?.update(dt);
  this.ports.visible=this.cursor.visible=this.ghosts.visible=!this.editor?.presentation;
  this.ports.children.forEach(o=>o.visible=false);this.cursor.children.forEach(o=>o.visible=false);
  const candidate=this.held?this.model.preview(this.held):null;
  // Reuse transient objects; hand tracking must not allocate dozens of geometries every frame.
  const ghostIds=new Set();if(candidate)for(const pose of candidate.poses){const part=this.model.parts.get(pose.id);let mesh=this.ghosts.children.find(o=>o.userData.partId===pose.id&&o.userData.artType===part.type);if(!mesh){mesh=this.makeMesh(part,true);mesh.userData.partId=pose.id;this.ghosts.add(mesh);}ghostIds.add(mesh);mesh.visible=true;mesh.position.copy(pose.position);mesh.quaternion.copy(pose.quaternion);const t=part.stretch||{x:1,y:1,z:1};mesh.scale.set(part.scale*t.x,part.scale*t.y,part.scale*t.z);}
  this.ghosts.children.forEach(o=>o.visible=ghostIds.has(o));
  let index=0;if(this.held)for(const part of this.model.parts.values())for(const port of this.model.connectors(part.id))if(!port.occupied){const active=candidate&&((candidate.source.partId===port.partId&&candidate.source.index===port.index)||(candidate.target.partId===port.partId&&candidate.target.index===port.index));let marker=this.ports.children[index++];if(!marker){marker=new THREE.Mesh(this.portGeometry,this.portMaterial);this.ports.add(marker);}marker.visible=true;marker.material=active?this.activePortMaterial:this.portMaterial;marker.scale.setScalar(active?1.8:1);marker.position.copy(port.position);}
  index=0;for(const hand of this.hands.values()){const p=this.planePoint(hand.point,this.held?this.model.assemblyFor(this.held).body.position.z:0);if(p){let circle=this.cursor.children[index++];if(!circle){circle=new THREE.Mesh(this.cursorGeometry,this.cursorMaterial);this.cursor.add(circle);}circle.visible=true;circle.position.copy(p);}}
  this.renderer.render(this.scene,this.camera);
 }
 dispose(){this.cancel();this.editor?.dispose();for(const mesh of this.meshes.values())this.clearGroup(mesh);this.clearGroup(this.ghosts);this.portGeometry.dispose();this.portMaterial.dispose();this.activePortMaterial.dispose();this.cursorGeometry.dispose();this.cursorMaterial.dispose();this.grid.geometry.dispose();this.grid.material.dispose();this.floor.geometry.dispose();this.floor.material.dispose();this.environment.dispose();this.scene.traverse(o=>o.shadow?.dispose());this.renderer.dispose();}
}
