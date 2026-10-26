import * as THREE from './vendor/three/three.module.js';
import {OrbitControls} from './vendor/addons/controls/OrbitControls.js';
import {RoomEnvironment} from './vendor/addons/environments/RoomEnvironment.js';
import {GLTFExporter} from './vendor/addons/exporters/GLTFExporter.js';
import {createArtMesh,updateArtMaterial} from './art-meshes.js';
import {DEFAULT_DONUT,sanitizeDonut,generateDonut,updateDonutPositions} from './donut-shape.js';
import {DEFAULT_APPEARANCE,validateDonutDocument} from './donut-document.js';

/** One surface, one owner of its vertex buffers; camera motion never edits it. */
export class DonutScene {
 constructor(canvas){
  this.canvas=canvas;this.shape={...DEFAULT_DONUT};this.display={...this.shape};this.appearance={...DEFAULT_APPEARANCE};this.dirty=true;this.cameraMode=false;this.pointerMode='sculpt';
  this.renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.setClearColor(0,0);this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1;
  this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(46,1,.05,50);
  this.scene.add(new THREE.HemisphereLight(0xe7f4ed,0x343041,.7));const key=new THREE.DirectionalLight(0xffeadc,2.5);key.position.set(3,5,4);this.scene.add(key);const rim=new THREE.DirectionalLight(0xadc6ff,1.5);rim.position.set(-3,2,-2);this.scene.add(rim);
  const room=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(this.renderer);this.environment=pmrem.fromScene(room,.04);this.scene.environment=this.environment.texture;room.dispose();pmrem.dispose();
  this.group=createArtMesh({id:'donut',type:'ring',color:this.appearance.color,finish:this.appearance.finish},{cameraMode:false});this.mesh=this.group.children.find(o=>o.isMesh);
  for(const child of [...this.group.children])if(child!==this.mesh){child.geometry?.dispose();child.material?.dispose();this.group.remove(child);}this.mesh.geometry.dispose();this.mesh.geometry=new THREE.BufferGeometry();
  this.wireMaterial=new THREE.MeshBasicMaterial({color:0xc8f3e0,wireframe:true,transparent:true,opacity:.16,depthWrite:false});this.wire=new THREE.Mesh(this.mesh.geometry,this.wireMaterial);this.wire.renderOrder=2;this.group.add(this.wire);this.scene.add(this.group);
  this.orbit=new OrbitControls(this.camera,canvas);this.orbit.target.set(0,0,0);this.orbit.enableDamping=true;this.orbit.dampingFactor=.12;this.orbit.enablePan=false;this.orbit.minDistance=3.2;this.orbit.maxDistance=12;this.orbit.autoRotateSpeed=.65;
  this.setPointerMode('sculpt');this.home();this.resize();this.rebuild();
 }
 getDocument(){return{version:1,kind:'gestures-donut',shape:{...this.shape},appearance:{...this.appearance}};}
 loadDocument(input){const document=validateDonutDocument(input);this.shape=document.shape;this.appearance=document.appearance;this.display={...this.shape};this.dirty=true;this.rebuild();this.updateMaterial();if(this.pointerMode!=='catch')this.fitView();}
 setShape(patch,{instant=false}={}){this.shape=sanitizeDonut({...this.shape,...patch});if(instant)this.display={...this.shape};this.dirty=true;if(this.pointerMode!=='catch')this.fitView();}
 setAppearance(patch){const document=validateDonutDocument({...this.getDocument(),appearance:{...this.appearance,...patch}});this.appearance=document.appearance;this.updateMaterial();}
 updateMaterial(){updateArtMaterial(this.group,{type:'ring',color:this.appearance.color,finish:this.appearance.finish},{cameraMode:this.cameraMode});this.wire.visible=this.appearance.wire;this.wireMaterial.color.set(this.appearance.finish==='hologram'?this.appearance.color:'#c8f3e0');}
 setPointerMode(mode){this.pointerMode=mode;this.group.position.set(0,0,0);this.group.quaternion.identity();this.group.scale.setScalar(1);this.orbit.enableRotate=mode==='orbit'&&!this.cameraMode;this.orbit.enableZoom=!this.cameraMode&&mode!=='catch';this.orbit.enabled=!this.cameraMode&&mode!=='catch';}
 setCameraMode(enabled){this.cameraMode=enabled;this.orbit.autoRotate=false;this.setPointerMode(this.pointerMode==='catch'?'catch':enabled?'sculpt':this.pointerMode);this.home();this.updateMaterial();this.resize();}
 home(){this.orbit.autoRotate=false;this.orbit.enableDamping=false;this.orbit.update();this.camera.position.set(...(this.cameraMode?[0,.15,5.4]:[1.9,.8,4.8]));this.orbit.target.set(0,0,0);this.camera.lookAt(0,0,0);this.orbit.update();this.orbit.enableDamping=true;this.fitView();this.camera.updateMatrixWorld();}
 resize(){const r=this.canvas.getBoundingClientRect();this.renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);this.camera.aspect=Math.max(1,r.width)/Math.max(1,r.height);this.camera.updateProjectionMatrix();this.fitView();}
 fitView(){if(!this.camera.position.length())return;const s=this.shape,outer=s.radius*(1+.12*s.ripple)+s.tube*(1+.1*s.ripple)+.08,needed=outer/(Math.tan(this.camera.fov*Math.PI/360)*Math.min(1,this.camera.aspect))*1.12;if(this.camera.position.length()<needed){this.camera.position.setLength(needed);this.camera.updateMatrixWorld();}}
 rebuild(){const data=generateDonut(this.display),previous=this.mesh.geometry;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(data.positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('uv',new THREE.BufferAttribute(data.uvs,2));geometry.setIndex(new THREE.BufferAttribute(data.indices,1));this.mesh.geometry=this.wire.geometry=geometry;previous.dispose();this.topology=data;this.updateSurface();this.updateMaterial();}
 updateSurface(){const geometry=this.mesh.geometry;updateDonutPositions(this.display,geometry.attributes.position.array);geometry.attributes.position.needsUpdate=true;geometry.computeVertexNormals();
  // Average the duplicate UV seam normals, including all four corner copies.
  const normals=geometry.attributes.normal.array,stride=this.topology.tubularSegments+1,rows=this.topology.radialSegments;
  const pair=(a,b)=>{const x=normals[a*3]+normals[b*3],y=normals[a*3+1]+normals[b*3+1],z=normals[a*3+2]+normals[b*3+2],length=Math.hypot(x,y,z)||1;for(const index of [a,b]){normals[index*3]=x/length;normals[index*3+1]=y/length;normals[index*3+2]=z/length;}};
  for(let row=0;row<=rows;row++)pair(row*stride,row*stride+stride-1);for(let col=0;col<stride;col++)pair(col,rows*stride+col);
  geometry.attributes.normal.needsUpdate=true;geometry.computeBoundingSphere();geometry.computeBoundingBox();this.dirty=false;
 }
 render(dt){dt=Math.min(Math.max(dt,0),.1);let moving=false;const next={...this.display};const alpha=1-Math.exp(-dt/.045);for(const key of ['radius','tube','twist','ripple']){const distance=this.shape[key]-this.display[key];if(Math.abs(distance)>1e-5){next[key]=Math.abs(distance)<.00015?this.shape[key]:this.display[key]+distance*alpha;moving=true;}}next.detail=this.shape.detail;this.display=next;
  if(this.topology?.tubularSegments!==({low:72,medium:112,high:160}[next.detail]))this.rebuild();else if(moving||this.dirty)this.updateSurface();if(this.orbit.enabled)this.orbit.update(dt);if(this.pointerMode==='catch'&&this.catchState)this.placeCatch(dt);this.renderer.render(this.scene,this.camera);
 }
 placeCatch(dt){const state=this.catchState;this.camera.updateMatrixWorld();const raycaster=new THREE.Raycaster();raycaster.setFromCamera(new THREE.Vector2(state.position.x*2-1,1-state.position.y*2),this.camera);const point=raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),0),new THREE.Vector3());if(point)this.group.position.copy(point);const viewHeight=2*Math.abs(this.camera.position.z)*Math.tan(this.camera.fov*Math.PI/360),radius=this.mesh.geometry.boundingSphere?.radius||1.3;this.group.scale.setScalar(state.radius*viewHeight/radius);this.catchSpin=(this.catchSpin||0)+(state.phase==='flying'?dt*7:0);this.group.quaternion.copy(this.camera.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),this.catchSpin));}
 settle(){this.display={...this.shape};this.dirty=true;this.render(0);}
 async exportGLB(){this.settle();const object=this.mesh.clone();object.name='Gestures / sculpted donut';object.geometry=this.mesh.geometry;return new GLTFExporter().parseAsync(object,{binary:true,onlyVisible:true});}
 dispose(){this.orbit.dispose();this.mesh.geometry.dispose();this.mesh.material.dispose();this.wireMaterial.dispose();this.environment.dispose();this.renderer.dispose();}
}
