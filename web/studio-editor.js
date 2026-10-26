import * as THREE from './vendor/three/three.module.js';
import {OrbitControls} from './vendor/addons/controls/OrbitControls.js';
import {TransformControls} from './vendor/addons/controls/TransformControls.js';
import {GLTFExporter} from './vendor/addons/exporters/GLTFExporter.js';
import {SceneHistory} from './scene-document.js';
import {createPreset} from './art-presets.js';

/** Three's editor controls drive the same rigid assemblies as the hand input. */
export class StudioEditor {
  constructor(field,{onChange=()=>{},onMessage=()=>{}}={}) {
    this.field=field;this.onChange=onChange;this.onMessage=onMessage;this.history=new SceneHistory();this.mode='translate';
    this.orbit=new OrbitControls(field.camera,field.canvas);this.orbit.target.set(0,.05,0);this.orbit.enableDamping=true;this.orbit.dampingFactor=.08;
    this.orbit.minDistance=2.5;this.orbit.maxDistance=12;this.orbit.maxPolarAngle=Math.PI*.48;this.orbit.autoRotateSpeed=.7;
    this.proxy=new THREE.Object3D();field.scene.add(this.proxy);
    this.gizmo=new TransformControls(field.camera,field.canvas);this.gizmo.setSize(.75);this.gizmo.setSpace('world');field.scene.add(this.gizmo.getHelper());
    this.gizmo.addEventListener('mouseDown',()=>this.beginTransform());
    this.gizmo.addEventListener('objectChange',()=>this.applyTransform());
    this.gizmo.addEventListener('mouseUp',()=>this.endTransform(!this.canceling));
    this.gizmo.addEventListener('dragging-changed',e=>{this.orbit.enabled=!e.value&&!field.cameraMode;this.dragging=e.value;});
    this.down=e=>{this.pointer={x:e.clientX,y:e.clientY,gizmo:!!this.gizmo.axis,pointerId:e.pointerId};};
    this.up=e=>{if(!this.pointer)return;const start=this.pointer;this.pointer=null;if(start.gizmo||Math.hypot(e.clientX-start.x,e.clientY-start.y)>5)return;const rect=field.canvas.getBoundingClientRect(),point={x:(e.clientX-rect.left)/rect.width,y:(e.clientY-rect.top)/rect.height};field.cancel();field.selected=field.pick(point);this.onChange();};
    field.canvas.addEventListener('pointerdown',this.down);field.canvas.addEventListener('pointerup',this.up);
    field.onBeforeEdit=()=>this.history.checkpoint(field.model.snapshot());field.editor=this;
    this.home();
  }
  home(){const {camera,cameraMode}=this.field;this.orbit.autoRotate=false;this.orbit.enableDamping=false;this.orbit.update();camera.position.set(...(cameraMode?[0,1.3,6]:[2.8,1.9,5.2]));this.orbit.target.set(0,.05,0);camera.lookAt(this.orbit.target);camera.updateMatrixWorld();this.orbit.update();this.orbit.enableDamping=true;}
  setCameraMode(enabled){this.cancelTransform();this.field.setCameraMode(enabled);this.orbit.enabled=!enabled;this.orbit.autoRotate=false;this.home();this.field.resize();}
  setMode(mode){if(!['translate','rotate','scale'].includes(mode))return;this.mode=mode;this.gizmo.setMode(mode);this.onChange();}
  beginTransform(){const f=this.field;if(!f.selected)return;this.before=f.model.snapshot();f.cancel();this.id=f.selected;const a=f.model.hold(this.id);this.baseScale=f.model.parts.get(this.id).scale;this.proxy.position.copy(a.body.position);this.proxy.quaternion.copy(a.body.quaternion);this.proxy.scale.setScalar(1);this.dragging=true;this.orbit.autoRotate=false;}
  applyTransform(){if(!this.id||!this.dragging)return;const f=this.field,p=f.model.parts.get(this.id);if(!p)return;
    let ratio=1;if(this.mode==='scale'){const axis=this.gizmo.axis;ratio=axis?.length===1?this.proxy.scale[axis.toLowerCase()]:(this.proxy.scale.x+this.proxy.scale.y+this.proxy.scale.z)/3;}
    ratio=Math.max(.01,Number.isFinite(ratio)?ratio:1);
    const position=this.proxy.position.clone();position.clamp(new THREE.Vector3(-5,-1, -3),new THREE.Vector3(5,4,3));
    f.model.transform(this.id,{position,quaternion:this.proxy.quaternion,scaleFactor:this.mode==='scale'?ratio*this.baseScale/p.scale:1});f.sync();this.onChange();
  }
  endTransform(snap=true){if(!this.id){this.dragging=false;return;}if(this.id){this.field.model.release(this.id,{x:0,y:0,z:0},snap&&this.mode==='translate');if(this.before)this.history.checkpoint(this.before);this.id=null;this.before=null;this.proxy.scale.setScalar(1);}this.dragging=false;this.onChange();}
  cancelTransform(){this.canceling=true;this.gizmo.pointerUp(null);this.canceling=false;this.endTransform(false);const pointerId=this.pointer?.pointerId;if(pointerId!==undefined&&this.field.canvas.hasPointerCapture(pointerId))this.field.canvas.releasePointerCapture(pointerId);this.pointer=null;}
  change(action){this.cancelTransform();const f=this.field;f.cancel();const before=f.model.snapshot();try{action();if(JSON.stringify(before)!==JSON.stringify(f.model.snapshot()))this.history.checkpoint(before);f.sync();this.onChange();return true;}catch(error){this.onMessage(error.message);this.onChange();return false;}}
  editSelected(patch){if(this.field.selected)this.change(()=>this.field.model.editPart(this.field.selected,patch));}
  setTransform({position,rotation,scale}={}){if(!this.field.selected)return;this.change(()=>{const f=this.field,a=f.model.assemblyFor(f.selected),p=f.model.parts.get(f.selected);const options={};if(position){if(!['x','y','z'].every(k=>Number.isFinite(position[k])))throw Error('Enter a finite position.');options.position={x:THREE.MathUtils.clamp(position.x,-5,5),y:THREE.MathUtils.clamp(position.y,-1,4),z:THREE.MathUtils.clamp(position.z,-3,3)};}if(rotation){const desired=new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation.map(THREE.MathUtils.degToRad)));options.quaternion=desired.multiply(new THREE.Quaternion(p.quaternion.x,p.quaternion.y,p.quaternion.z,p.quaternion.w).invert()).multiply(new THREE.Quaternion(a.body.quaternion.x,a.body.quaternion.y,a.body.quaternion.z,a.body.quaternion.w));}if(scale)options.scaleFactor=scale/p.scale;f.model.transform(f.selected,options);const updated=f.model.assemblyFor(f.selected);updated.body.velocity.setZero();updated.body.angularVelocity.setZero();});}
  duplicate(){this.change(()=>{const p=this.field.model.duplicatePart(this.field.selected);if(p)this.field.selected=p.id;});}
  preset(name){this.change(()=>{this.field.model.restore(createPreset(name));this.field.selected=null;this.home();});}
  restore(document){return this.change(()=>{this.field.model.restore(document);this.field.selected=null;});}
  undo(){this.field.cancel();const document=this.history.undo(this.field.model.snapshot());if(document){this.field.model.restore(document);this.field.selected=null;this.field.sync();this.onChange();}}
  redo(){this.field.cancel();const document=this.history.redo(this.field.model.snapshot());if(document){this.field.model.restore(document);this.field.selected=null;this.field.sync();this.onChange();}}
  update(dt){const f=this.field;this.orbit.enabled=!f.cameraMode&&!this.dragging&&!f.held;if(this.orbit.enabled)this.orbit.update(dt);if(!this.dragging){const a=f.selected?f.model.assemblyFor(f.selected):null;if(a&&!f.held){this.proxy.position.copy(a.body.position);this.proxy.quaternion.copy(a.body.quaternion);this.proxy.scale.setScalar(1);if(this.gizmo.object!==this.proxy)this.gizmo.attach(this.proxy);}else this.gizmo.detach();}this.gizmo.enabled=!f.held;this.gizmo.getHelper().visible=!this.presentation&&!!this.gizmo.object;}
  async exportGLB(){this.field.model.sync();this.field.sync();const group=new THREE.Group();group.name='Gestures sculpture';for(const [id,mesh] of this.field.meshes){const clone=mesh.clone(true);clone.name=this.field.model.parts.get(id).type+' '+id;clone.traverse(o=>{if(o.isLine)o.visible=false;});group.add(clone);}return new GLTFExporter().parseAsync(group,{binary:true,onlyVisible:true});}
  dispose(){this.cancelTransform();this.field.canvas.removeEventListener('pointerdown',this.down);this.field.canvas.removeEventListener('pointerup',this.up);this.gizmo.dispose();this.orbit.dispose();this.field.scene.remove(this.proxy,this.gizmo.getHelper());}
}
