import * as THREE from '/vendor/three/three.module.js';
import {formationPoint} from './ar-controls.js';

/** Original renderer; hand-particle research sources are credited in docs. */
export class ARScene{
  constructor(canvas){
    this.renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
    this.renderer.setClearColor(0x000000,0);
    this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-16/9,16/9,1,-1,.1,100);
    this.camera.position.z=10;this.root=new THREE.Group();this.scene.add(this.root);
    this.count=6500;this.positions=new Float32Array(this.count*3);this.sizes=new Float32Array(this.count);
    this.kind='orb';this.time=0;this.intensity=1;this.paused=false;this.aspect=16/9;
    this.target={center:{x:.5,y:.5},scale:1,spread:1,rotation:0,gesture:'idle',tracked:false};
    this.current={x:0,y:0,scale:1,spread:1,rotation:0};this.lastBurst=0;this.wasOpen=false;this.waves=[];
    this.geometry=new THREE.BufferGeometry();
    this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
    this.formations={};this.phaseSin=new Float32Array(this.count);this.phaseCos=new Float32Array(this.count);this.waveSin=new Float32Array(this.count);this.waveCos=new Float32Array(this.count);
    for(const kind of ['orb','galaxy','portal']){
      const base=new Float32Array(this.count*3);
      for(let i=0;i<this.count;i++){const p=formationPoint(kind,i,this.count);base.set([p.x,p.y,p.z],i*3);}
      this.formations[kind]=base;
    }
    for(let i=0;i<this.count;i++){this.phaseSin[i]=Math.sin(i*.077);this.phaseCos[i]=Math.cos(i*.077);this.waveSin[i]=Math.sin(i);this.waveCos[i]=Math.cos(i);}
    for(let i=0;i<this.count;i++){this.sizes[i]=1.5+((i*17)%23)/8;const p=formationPoint('orb',i,this.count);this.positions.set([p.x,p.y,p.z],i*3);}
    this.geometry.setAttribute('aSize',new THREE.BufferAttribute(this.sizes,1));
    this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      uniforms:{uColor:{value:new THREE.Color('#62e6ff')},uPower:{value:1},uRatio:{value:Math.min(devicePixelRatio,1.7)}},
      vertexShader:`attribute float aSize; uniform float uRatio; varying float depth; void main(){vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;gl_PointSize=aSize*uRatio;depth=clamp(1.0+position.z*.6,.6,1.3);}`,
      fragmentShader:`uniform vec3 uColor;uniform float uPower;varying float depth;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float a=exp(-d*d*4.)*depth*uPower;gl_FragColor=vec4(uColor,a);}`});
    this.points=new THREE.Points(this.geometry,this.material);this.points.frustumCulled=false;this.root.add(this.points);
    this.ringMaterial=new THREE.MeshBasicMaterial({color:'#62e6ff',transparent:true,opacity:.48,blending:THREE.AdditiveBlending,depthWrite:false});
    this.rings=[];
    for(let i=0;i<3;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(.36+i*.035,.0018,4,128),this.ringMaterial);ring.rotation.x=i*.9;ring.rotation.y=i*.65;this.root.add(ring);this.rings.push(ring);}
    this.beamGeometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
    this.beam=new THREE.Line(this.beamGeometry,new THREE.LineBasicMaterial({color:'#a9f8ff',transparent:true,opacity:.65,blending:THREE.AdditiveBlending}));
    this.scene.add(this.beam);this.beam.visible=false;
    this.resize();
  }
  resize(){const box=this.renderer.domElement.getBoundingClientRect();this.aspect=box.width/Math.max(1,box.height);this.camera.left=-this.aspect;this.camera.right=this.aspect;this.camera.updateProjectionMatrix();this.renderer.setSize(box.width,box.height,false);}
  color(value){this.material.uniforms.uColor.value.set(value);this.ringMaterial.color.set(value);this.beam.material.color.set(value);}
  setInput(state){this.target=state;if(state.burst&&!this.wasOpen&&performance.now()-this.lastBurst>650){this.burst();this.lastBurst=performance.now();}this.wasOpen=state.burst;}
  burst(){
    const material=this.ringMaterial.clone();material.opacity=.7;
    const ring=new THREE.Mesh(new THREE.RingGeometry(.24,.244,100),material);
    ring.position.set(this.current.x,this.current.y,.6);this.scene.add(ring);this.waves.push({mesh:ring,age:0});
  }
  reset(){this.current={x:0,y:0,scale:1,spread:1,rotation:0};this.target={...this.target,center:{x:.5,y:.5},scale:1,spread:1,rotation:0};for(const wave of this.waves){this.scene.remove(wave.mesh);wave.mesh.geometry.dispose();wave.mesh.material.dispose();}this.waves=[];}
  render(dt){
    dt=Math.min(.05,Math.max(0,dt));
    if(!this.paused){
      this.time+=dt;const t=this.time,target=this.target,current=this.current,a=1-Math.exp(-dt*11);
      const x=(target.center.x-.5)*2*this.aspect,y=(.5-target.center.y)*2;
      current.x+=(x-current.x)*a;current.y+=(y-current.y)*a;
      current.scale+=(target.scale-current.scale)*a;current.spread+=(target.spread-current.spread)*a;
      current.rotation+=Math.atan2(Math.sin(target.rotation-current.rotation),Math.cos(target.rotation-current.rotation))*a;
      const morph=1-Math.exp(-dt*7),spread=current.spread;
      const base=this.formations[this.kind]||this.formations.orb,sinTime=Math.sin(t*1.7),cosTime=Math.cos(t*1.7);
      for(let i=0;i<this.count;i++){
        const wave=.008*(sinTime*this.phaseCos[i]+cosTime*this.phaseSin[i])*this.intensity;
        const j=i*3;
        this.positions[j]+=(base[j]*spread+wave-this.positions[j])*morph;
        this.positions[j+1]+=(base[j+1]*spread+wave*this.waveCos[i]-this.positions[j+1])*morph;
        this.positions[j+2]+=(base[j+2]*spread+wave*this.waveSin[i]-this.positions[j+2])*morph;
      }
      this.geometry.attributes.position.needsUpdate=true;
      this.root.position.set(current.x,current.y,0);this.root.scale.setScalar(current.scale);
      this.points.rotation.set(this.kind==='galaxy'?1.05:.25+Math.sin(t*.2)*.2,t*.22,current.rotation+t*.07);
      this.rings.forEach((ring,i)=>{ring.visible=this.kind==='orb';ring.rotation.z=t*(i%2?-.4:.3)+current.rotation;ring.rotation.y=t*.15+i*.65;});
      this.material.uniforms.uPower.value=this.intensity*(target.tracked?1.1:.65);
      this.beam.visible=target.count===2;
      if(this.beam.visible){const half=current.scale*.28;const positions=this.beamGeometry.attributes.position;positions.setXYZ(0,current.x-half,current.y,0);positions.setXYZ(1,current.x+half,current.y,0);positions.needsUpdate=true;}
      this.waves=this.waves.filter(wave=>{wave.age+=dt;wave.mesh.scale.setScalar(1+wave.age*4);wave.mesh.material.opacity=.7*(1-wave.age/1.1);if(wave.age>1.1){this.scene.remove(wave.mesh);wave.mesh.geometry.dispose();wave.mesh.material.dispose();return false;}return true;});
    }
    this.renderer.render(this.scene,this.camera);
  }
  dispose(){this.geometry.dispose();this.material.dispose();this.ringMaterial.dispose();this.rings.forEach(ring=>ring.geometry.dispose());this.beamGeometry.dispose();this.beam.material.dispose();for(const wave of this.waves){wave.mesh.geometry.dispose();wave.mesh.material.dispose();}this.renderer.dispose();}
}
