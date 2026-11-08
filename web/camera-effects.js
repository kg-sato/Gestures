import * as THREE from './vendor/three/three.module.js';

const MODES = ['cover', 'riso', 'crt', 'dither', 'liquid', 'particles'];
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
const vertex = `varying vec2 vUv;
void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;

// Camera pixels stay in their input color space; these are authored image effects,
// not lit scene materials. Texture sampling and landmarks share one cover crop.
const fragment = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVideo;
uniform sampler2D uPaper;
uniform sampler2D uCover;
uniform vec2 uResolution;
uniform vec2 uSource;
uniform int uMode;
uniform float uConnected,uTime,uSeparation,uPalette,uReduced;
uniform vec4 uWindow;
uniform vec4 uTrails[12];
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec2 coverUV(vec2 p){
 float a=uResolution.x/uResolution.y,b=uSource.x/uSource.y;
 vec2 crop=vec2(min(1.,a/b),min(1.,b/a));
 vec2 q=(p-.5)*crop+.5;
 return vec2(1.-q.x,q.y);
}
vec3 camera(vec2 p){return texture2D(uVideo,coverUV(clamp(p,vec2(.001),vec2(.999)))).rgb;}
float paper(vec2 p){return texture2D(uPaper,p*uResolution/512.).r;}
float pinLight(float base,float blend){return blend<.5?min(base,2.*blend):max(base,2.*blend-1.);}
float inkBase(vec2 p){
 float n=paper(p);
 float g=lum(camera(p));
 g=pinLight(g,mix(.5,n,.25));
 return clamp((g-.48)*1.7+.52+(n-.5)*.12,0.,1.);
}
vec3 inkColor(float channel){
 if(uPalette<.5){if(channel<.5)return vec3(.91,.20,.40);if(channel<1.5)return vec3(.03,.55,.65);return vec3(.98,.65,.13);}
 if(uPalette<1.5){if(channel<.5)return vec3(.24,.18,.62);if(channel<1.5)return vec3(.94,.25,.19);return vec3(.95,.72,.35);}
 if(channel<.5)return vec3(.13,.36,.28);if(channel<1.5)return vec3(.96,.36,.56);return vec3(.98,.73,.19);
}
vec3 riso(vec2 p){
 vec2 delta=vec2(2.0+uSeparation*9.,1.0+uSeparation*6.)/uResolution;
 float a=inkBase(p+delta),b=inkBase(p-delta),c=inkBase(p);
 float n=paper(p),grain=(n-.5)*.1;
 vec3 one=mix(inkColor(0.),vec3(1.),smoothstep(.05,.88,a+grain));
 vec3 two=mix(inkColor(1.),vec3(1.),smoothstep(.12,.94,b-grain));
 vec3 three=mix(inkColor(2.),vec3(1.),smoothstep(.0,.8,c+grain));
 vec3 color=one*two*three;
 color=mix(vec3(lum(color)),color,1.23);
 // Conventional quadratic Freeze: the TD docs name it but omit its formula.
 // White paper leaves the print nearly unchanged; darker fibers roughen ink.
 vec3 stock=vec3(.91+n*.085,.90+n*.083,.86+n*.085);
 vec3 frozen=1.-min(vec3(1.),pow(1.-stock,vec3(2.))/max(color,vec3(.005)));
 return clamp(mix(color,frozen,.075)*vec3(.99,.975,.93),0.,1.);
}
float bayer(vec2 pixel){
 vec2 p=mod(floor(pixel),4.);
 float x=p.x,y=p.y;
 if(y<1.){if(x<1.)return .5/16.;if(x<2.)return 8.5/16.;if(x<3.)return 2.5/16.;return 10.5/16.;}
 if(y<2.){if(x<1.)return 12.5/16.;if(x<2.)return 4.5/16.;if(x<3.)return 14.5/16.;return 6.5/16.;}
 if(y<3.){if(x<1.)return 3.5/16.;if(x<2.)return 11.5/16.;if(x<3.)return 1.5/16.;return 9.5/16.;}
 if(x<1.)return 15.5/16.;if(x<2.)return 7.5/16.;if(x<3.)return 13.5/16.;return 5.5/16.;
}
float box(vec2 p,vec2 center,vec2 halfSize){vec2 d=abs(p-center)-halfSize;return max(d.x,d.y);}
vec3 cover(vec2 p){
 vec3 background=camera(p);
 vec2 center=uWindow.xy,size=uWindow.zw;
 vec2 q=(p-center)/size+.5;
 float inside=step(0.,q.x)*step(q.x,1.)*step(0.,q.y)*step(q.y,1.);
 float n=paper(p),g=inkBase(p);
 vec3 ink=inkColor(1.);
 if(uPalette<.5)ink=vec3(.17,.24,.18);
 if(uPalette>1.5)ink=vec3(.22,.15,.38);
 vec3 print=mix(ink,vec3(.97,.96,.91),smoothstep(.24,.76,g));
 if(uPalette>.5&&uPalette<1.5){
   float stripe=step(.53,fract(q.x*41.));
   print=mix(print,mix(vec3(.96,.94,.88),vec3(.10,.13,.15),stripe),.23*(1.-g));
 }
 print+=(n-.5)*.07;
 vec4 title=texture2D(uCover,vec2(q.x,1.-q.y));
 print=mix(print,title.rgb,title.a);
 vec3 color=mix(background,print,inside);
 vec2 px=vec2(1.)/uResolution;
 float border=1.-smoothstep(0.,max(px.x,px.y)*1.4,abs(box(p,center,size*.5)));
 color=mix(color,vec3(.98,.97,.9),border*.88);
 for(int i=0;i<4;i++){
   vec2 signCorner=vec2(i==0||i==2?-1.:1.,i<2?-1.:1.);
   vec2 d=(p-(center+signCorner*size*.5))*uResolution;
   float dotCorner=1.-smoothstep(3.,4.5,length(d));
   color=mix(color,vec3(.99),dotCorner);
 }
 return color;
}
vec2 displacement(vec2 p){
 vec2 total=vec2(0.);
 float aspect=uResolution.x/uResolution.y;
 for(int i=0;i<12;i++){
  vec4 t=uTrails[i];vec2 d=p-t.xy;d.x*=aspect;
  float falloff=exp(-dot(d,d)*32.);
  vec2 velocity=t.zw;
  total+=velocity*falloff*.017;
  float strength=length(velocity);
  total+=vec2(-d.y,d.x/aspect)*falloff*strength*.035;
 }
 return clamp(total,vec2(-.075),vec2(.075));
}
void main(){
 vec2 p=vec2(vUv.x,1.-vUv.y);
 if(uConnected<.5){gl_FragColor=vec4(.941,.914,.871,1.);return;}
 vec3 color=camera(p);
 if(uMode==0){color=cover(p);}
 else if(uMode==1){color=riso(p);}
 else if(uMode==2){
  vec2 q=p*2.-1.;
  q*=1.+dot(q,q)*.035;
  vec2 screen=q*.5+.5;
  if(uReduced<.5)screen+=displacement(screen)*.28;
  float split=(1.1+uSeparation*.7)/uResolution.x;
  color=vec3(camera(screen+vec2(split,0.)).r,camera(screen).g,camera(screen-vec2(split,0.)).b);
  float scan=.89+.11*sin(p.y*uResolution.y*3.14159265);
  float mask=.95+.05*cos(p.x*uResolution.x*2.0943951);
  color=pow(max(color,vec3(0.)),vec3(.92))*vec3(.87,1.,.94)*scan*mask;
  float vignette=clamp(1.-dot(q*.36,q*.36),.4,1.);
  color*=vignette;
  float edge=step(abs(q.x),1.)*step(abs(q.y),1.);
  color*=edge;
 }
 else if(uMode==3){
  float dotSize=1.2+uSeparation*3.8;
  vec2 pixel=floor(p*uResolution/dotSize);
  vec2 samplePoint=(pixel+.5)*dotSize/uResolution;
  float g=clamp((lum(camera(samplePoint))-.48)*1.38+.5,0.,1.);
  float bw=step(bayer(pixel),g);
  if(mod(uPalette,2.)>.5)bw=1.-bw;
  color=mix(vec3(.055,.07,.065),vec3(.97,.95,.89),bw);
  vec2 edge=min(p,1.-p)*uResolution;
  if(min(edge.x,edge.y)<12.)color=vec3(.97,.95,.89);
 }
 else if(uMode==4){
  vec2 offset=uReduced>.5?vec2(0.):displacement(p);
  vec2 q=p+offset;
  float fringe=length(offset)*.13;
  color=vec3(camera(q+vec2(fringe,0.)).r,camera(q).g,camera(q-vec2(fringe,0.)).b);
  color+=min(.12,length(offset)*1.4)*vec3(.45,.62,.7);
 }
 gl_FragColor=vec4(clamp(color,0.,1.),1.);
}`;

const particleVertex = `
precision highp float;
attribute vec3 targetPosition,targetColor,scatterDirection;
attribute float seed;
uniform float uMorph,uScatter,uTime,uReduced,uPixelRatio;
varying vec3 vColor;
void main(){
 float m=uMorph*uMorph*(3.-2.*uMorph);
 vec3 p=mix(position,targetPosition,m);
 vColor=mix(color,targetColor,m);
 float drift=uReduced>.5?0.:.016;
 p+=vec3(sin(uTime*.6+seed*60.),cos(uTime*.7+seed*50.),sin(uTime*.5+seed*80.))*drift;
 if(uReduced<.5)p+=scatterDirection*uScatter*(.55+.25*sin(seed*23.+uTime*.6));
 vec4 mv=modelViewMatrix*vec4(p,1.);
 gl_Position=projectionMatrix*mv;
 gl_PointSize=clamp((2.9+seed*1.5)*uPixelRatio*(4.7/max(1.,-mv.z)),1.4,8.);
}`;
const particleFragment = `precision highp float;varying vec3 vColor;
void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;
float a=1.-smoothstep(.24,.5,d);gl_FragColor=vec4(vColor,a*.86);}`;

function paperTexture() {
 const size=256,data=new Uint8Array(size*size*4);
 let seed=90210;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=(y*size+x)*4;
  const fiber=Math.sin(x*.48+Math.sin(y*.09)*2)*.06;
  const n=clamp(.54+(random()-.5)*.42+fiber,.1,.95)*255;
  data[i]=data[i+1]=data[i+2]=n;data[i+3]=255;
 }
 const texture=new THREE.DataTexture(data,size,size);
 texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
 texture.magFilter=texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
 return texture;
}

function coverTexture(index) {
 const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
 const c=canvas.getContext('2d'),titles=['HAND STUDIES','AFTER IMAGE','SLOW SIGNAL'];
 c.fillStyle='#f4f0df';c.fillRect(0,0,1024,148);c.fillRect(0,914,1024,110);
 c.fillStyle='#14231e';c.font='700 74px Arial';c.fillText(titles[index],42,92);
 c.font='24px Arial';c.fillText('GESTURES     /     CAMERA EDITION',44,132);
 c.font='700 26px Arial';c.fillText('VOL. 0'+(index+1)+'     —     LIVE / IN MOTION',44,966);
 c.fillStyle=['#c9ed5b','#ef693b','#bba2e8'][index];c.fillRect(934,0,90,148);
 c.strokeStyle='#14231e';c.lineWidth=2;c.beginPath();c.moveTo(42,987);c.lineTo(982,987);c.stroke();
 const texture=new THREE.CanvasTexture(canvas);texture.generateMipmaps=false;
 texture.minFilter=THREE.LinearFilter;return texture;
}

// Equal-count original procedural forms retain point correspondence through a
// morph. No reference model, artwork or paid creator asset is embedded here.
function particleForms(count) {
 const forms=Array.from({length:4},()=>({positions:new Float32Array(count*3),colors:new Float32Array(count*3)}));
 const tau=Math.PI*2,color=new THREE.Color();
 for(let i=0;i<count;i++){
  const a=(i*.61803398875%1)*tau,b=(i*.7548776662%1)*tau,t=i/count;
  const theta=Math.acos(1-2*t),radius=.95;
  const points=[
   [Math.sin(theta)*Math.cos(a)*radius,Math.cos(theta)*radius,Math.sin(theta)*Math.sin(a)*radius],
   [(1+.3*Math.cos(b))*Math.cos(a),(1+.3*Math.cos(b))*Math.sin(a),.3*Math.sin(b)],
   [Math.sin(a)*(1.05+.25*Math.cos(5*a))*Math.sin(theta),Math.cos(theta)*1.28,Math.sin(theta)*Math.cos(a)*.35],
   [Math.cos(a)*Math.sin(b)*(.55+.4*Math.cos(3*a)),Math.cos(b)*1.1,Math.sin(a)*Math.sin(b)*(.55+.4*Math.cos(3*a))]
  ];
  for(let j=0;j<forms.length;j++){
   forms[j].positions.set(points[j],i*3);
   color.setHSL((j*.18+t*.35+.03*Math.sin(a))%1,.66,.55);
   forms[j].colors.set([color.r,color.g,color.b],i*3);
  }
 }
 return forms;
}

function cameraTexture() {
 const texture=new THREE.Texture();
 texture.generateMipmaps=false;
 texture.magFilter=texture.minFilter=THREE.LinearFilter;
 texture.colorSpace=THREE.NoColorSpace;
 return texture;
}

export class CameraEffects {
 constructor(canvas) {
  this.canvas=canvas;
  this.renderer=new THREE.WebGLRenderer({canvas,alpha:false,antialias:false});
  this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.5));
  this.renderer.setClearColor('#f0e9de');this.renderer.autoClear=false;
  this.scene=new THREE.Scene();
  this.camera=new THREE.OrthographicCamera(-1,1,1,-1,0,2);this.camera.position.z=1;
  this.videoTexture=cameraTexture();this.frameWidth=0;this.frameHeight=0;
  this.paper=paperTexture();this.covers=[0,1,2].map(coverTexture);
  this.uniforms={
   uVideo:{value:this.videoTexture},uPaper:{value:this.paper},uCover:{value:this.covers[0]},
   uResolution:{value:new THREE.Vector2(1,1)},uSource:{value:new THREE.Vector2(1,1)},
   uMode:{value:0},uConnected:{value:0},uTime:{value:0},uSeparation:{value:.4},uPalette:{value:0},
   uReduced:{value:0},uWindow:{value:new THREE.Vector4(.5,.53,.55,.64)},
   uTrails:{value:Array.from({length:12},()=>new THREE.Vector4(-10,-10,0,0))}
  };
  this.material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms:this.uniforms,depthTest:false,depthWrite:false});
  this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);this.scene.add(this.quad);
  this.particleScene=new THREE.Scene();this.particleCamera=new THREE.PerspectiveCamera(40,1,.1,40);this.particleCamera.position.z=5;
  this.particleCount=14000;this.forms=particleForms(this.particleCount);this.particleIndex=0;this.morph=1;
  const g=new THREE.BufferGeometry(),first=this.forms[0];
  g.setAttribute('position',new THREE.BufferAttribute(first.positions.slice(),3));
  g.setAttribute('color',new THREE.BufferAttribute(first.colors.slice(),3));
  g.setAttribute('targetPosition',new THREE.BufferAttribute(first.positions.slice(),3));
  g.setAttribute('targetColor',new THREE.BufferAttribute(first.colors.slice(),3));
  const scatter=new Float32Array(this.particleCount*3),seeds=new Float32Array(this.particleCount);
  for(let i=0;i<this.particleCount;i++){
   seeds[i]=(i*.61803398875)%1;
   const a=i*2.39996323,z=1-2*seeds[i],r=Math.sqrt(1-z*z);
   scatter.set([Math.cos(a)*r*1.8,z*1.8,Math.sin(a)*r*1.8],i*3);
  }
  g.setAttribute('scatterDirection',new THREE.BufferAttribute(scatter,3));g.setAttribute('seed',new THREE.BufferAttribute(seeds,1));
  this.particleUniforms={uMorph:{value:1},uScatter:{value:0},uTime:{value:0},uReduced:{value:0},uPixelRatio:{value:this.renderer.getPixelRatio()}};
  this.particleMaterial=new THREE.ShaderMaterial({vertexShader:particleVertex,fragmentShader:particleFragment,uniforms:this.particleUniforms,transparent:true,vertexColors:true,depthWrite:false,blending:THREE.NormalBlending});
  this.particles=new THREE.Points(g,this.particleMaterial);this.particles.frustumCulled=false;
  this.group=new THREE.Group();this.group.add(this.particles);
  this.cage=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.9,2.9,2.9)),new THREE.LineBasicMaterial({color:'#e6f0dd',transparent:true,opacity:.44,depthWrite:false}));
  this.group.add(this.cage);this.particleScene.add(this.group);
  const corners=[];for(const x of [-1.45,1.45])for(const y of [-1.45,1.45])for(const z of [-1.45,1.45])corners.push(x,y,z);
  const cornerGeometry=new THREE.BufferGeometry();cornerGeometry.setAttribute('position',new THREE.Float32BufferAttribute(corners,3));
  this.corners=new THREE.Points(cornerGeometry,new THREE.PointsMaterial({color:'#f5ffe8',size:.055,sizeAttenuation:true,depthWrite:false}));this.group.add(this.corners);
  this.lastMode=null;this.lastPalette=-1;this.lastFrame=null;this.trailCursor=0;this.trailClock=0;
  this.diagnostics={mode:'cover',hasFrame:false,particleCount:this.particleCount,morphIndex:0,morphProgress:1,scatter:0,activePasses:0,textureUploads:0};
  this.resize();
 }

 resize() {
  const rect=this.canvas.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height);
  this.renderer.setSize(width,height,false);this.uniforms.uResolution.value.set(width,height);
  this.particleCamera.aspect=width/height;this.particleCamera.position.z=5/Math.min(1,this.particleCamera.aspect*1.3);
  this.particleCamera.updateProjectionMatrix();
 }

 setFrame(bitmap) {
  if(!bitmap||bitmap===this.lastFrame)return;
  const width=Math.max(1,bitmap.width),height=Math.max(1,bitmap.height);
  // Three's GPU storage cannot be resized by assigning a differently sized image.
  // Reconnects and source changes must allocate a fresh texture, not reuse it.
  if(this.frameWidth&&this.frameHeight&&(width!==this.frameWidth||height!==this.frameHeight)){
   this.videoTexture.dispose();
   this.videoTexture=cameraTexture();
   this.uniforms.uVideo.value=this.videoTexture;
  }
  this.frameWidth=width;this.frameHeight=height;
  this.lastFrame=bitmap;this.videoTexture.image=bitmap;this.videoTexture.needsUpdate=true;
  this.uniforms.uSource.value.set(width,height);
  this.uniforms.uConnected.value=1;this.diagnostics.hasFrame=true;this.diagnostics.textureUploads++;
 }

 clearFrame() {
  this.lastFrame=null;this.frameWidth=0;this.frameHeight=0;
  this.videoTexture.dispose();
  this.videoTexture=cameraTexture();
  this.uniforms.uVideo.value=this.videoTexture;
  this.uniforms.uSource.value.set(1,1);this.uniforms.uConnected.value=0;
  this.diagnostics.hasFrame=false;
  this.clearTrails();this.renderer.clear();
 }

 clearTrails() {
  for(const trail of this.uniforms.uTrails.value)trail.set(-10,-10,0,0);
  this.trailCursor=0;this.trailClock=0;
 }

 updateTrails(dt,state,reduced) {
  for(const t of this.uniforms.uTrails.value){t.z*=Math.exp(-dt*3.8);t.w*=Math.exp(-dt*3.8);}
  if(reduced)return;
  this.trailClock+=dt;
  if(this.trailClock<1/45)return;
  this.trailClock=0;
  for(const hand of (state.hands||[]).slice(0,2)){
   const vx=clamp(Number(hand.vx)||0,-3,3),vy=clamp(Number(hand.vy)||0,-3,3);
   if(Math.hypot(vx,vy)<.025)continue;
   this.uniforms.uTrails.value[this.trailCursor].set(hand.x,hand.y,vx,vy);
   this.trailCursor=(this.trailCursor+1)%12;
  }
 }

 targetForm(index) {
  index=((Math.trunc(index)||0)%this.forms.length+this.forms.length)%this.forms.length;
  if(index===this.particleIndex)return;
  const g=this.particles.geometry,m=this.morph*this.morph*(3-2*this.morph);
  const position=g.attributes.position.array,color=g.attributes.color.array;
  const oldTarget=g.attributes.targetPosition.array,oldColor=g.attributes.targetColor.array;
  // Re-grabbing or cycling mid-morph starts at the displayed form, avoiding jumps.
  for(let i=0;i<position.length;i++){position[i]+=(oldTarget[i]-position[i])*m;color[i]+=(oldColor[i]-color[i])*m;}
  oldTarget.set(this.forms[index].positions);oldColor.set(this.forms[index].colors);
  for(const key of ['position','color','targetPosition','targetColor'])g.attributes[key].needsUpdate=true;
  this.particleIndex=index;this.morph=0;
 }

 render(dt,time,state={},reducedMotion=false) {
  dt=clamp(Number(dt)||0,0,.05);
  const mode=MODES.includes(state.mode)?state.mode:'cover';
  if(mode!==this.lastMode){this.clearTrails();this.lastMode=mode;}
  const u=this.uniforms,paletteCount=mode==='dither'?2:3,palette=((Math.trunc(state.palette)||0)%paletteCount+paletteCount)%paletteCount;
  u.uMode.value=MODES.indexOf(mode);u.uTime.value=time*.001;u.uPalette.value=palette;
  u.uReduced.value=reducedMotion?1:0;u.uSeparation.value=clamp(state.separation??.4,0,1);
  if(palette!==this.lastPalette){u.uCover.value=this.covers[palette];this.lastPalette=palette;}
  const w=state.window||{};
  u.uWindow.value.set(clamp(w.cx??.5,.12,.88),clamp(w.cy??.53,.18,.82),clamp(w.width??.55,.18,.94),clamp(w.height??.64,.2,.85));
  if(mode==='crt'||mode==='liquid')this.updateTrails(dt,state,reducedMotion);
  this.renderer.clear();this.renderer.render(this.scene,this.camera);
  let passes=1;
  if(mode==='particles'&&u.uConnected.value>.5){
   this.targetForm(state.morphIndex||0);
   this.morph=reducedMotion?1:Math.min(1,this.morph+dt*1.7);
   const pu=this.particleUniforms;
   pu.uMorph.value=this.morph;pu.uScatter.value=reducedMotion?0:clamp(state.scatter||0,0,1);
   pu.uTime.value=time*.001;pu.uReduced.value=reducedMotion?1:0;
   this.group.rotation.set(reducedMotion ? 0 : .08,reducedMotion ? .16 : Math.sin(time*.00009)*.2+.16,0);
   this.renderer.clearDepth();this.renderer.render(this.particleScene,this.particleCamera);passes++;
  }
  this.diagnostics.mode=mode;this.diagnostics.morphIndex=this.particleIndex;
  this.diagnostics.morphProgress=this.morph;this.diagnostics.scatter=reducedMotion?0:clamp(state.scatter||0,0,1);
  this.diagnostics.activePasses=passes;
 }

 dispose() {
  this.clearFrame();this.videoTexture.dispose();this.paper.dispose();this.covers.forEach(t=>t.dispose());
  this.quad.geometry.dispose();this.material.dispose();this.particles.geometry.dispose();this.particleMaterial.dispose();
  this.cage.geometry.dispose();this.cage.material.dispose();this.corners.geometry.dispose();this.corners.material.dispose();this.renderer.dispose();
 }
}
