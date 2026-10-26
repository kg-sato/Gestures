import {DonutGestures} from './donut-gestures.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const copy=point=>({x:point.x,y:point.y});
const finite=point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.y);
const fixedStep=1/120;

/** Camera-plane catch game. Hand identity/filtering is shared with sculpt mode. */
export class ARCatch {
  constructor({aspect=16/9,onEvent=()=>{}}={}) {
    this.aspect=Number.isFinite(aspect)&&aspect>0?aspect:16/9;
    this.onEvent=onEvent;
    this.tracker=new DonutGestures({aspect:this.aspect,getShape:()=>({radius:1,tube:.28,twist:0,ripple:0}),onChange:()=>{}});
    this.radius=.065;this.phase='idle';this.position={x:.5,y:.45};this.velocity={x:0,y:0};this.owner=null;
    this.throws=0;this.catches=0;this.streak=0;this.trail=[];this.samples=[];
    this.clock=null;this.accumulator=0;this.lastThrowAt=-Infinity;this.thrower=null;this.throwerLabel='';this.offset={x:0,y:0};
    this.pendingRelease=null;this.heldPaused=false;this.segments=[];this.lastCatchAt=-Infinity;
  }
  get state() {
    let label=this.phase==='idle'?'Pinch the donut to pick it up':this.phase==='held'?'Flick, then open to throw':'Pinch with your other hand to catch';
    if(this.phase==='held'&&this.heldPaused)label='Tracking paused';
    if(this.phase==='idle'&&[...this.tracker.tracks.values()].some(t=>t.visible&&t.blocked))label='Open pinch, then grab the donut';
    return{phase:this.phase,position:copy(this.position),velocity:copy(this.velocity),owner:this.owner,throws:this.throws,catches:this.catches,streak:this.streak,label,points:this.tracker.status.points.map(p=>({...p})),trail:this.trail.map(copy),radius:this.radius,paused:this.heldPaused};
  }
  emit(type,extra={}) {this.onEvent({type,timestamp:this.clock??0,owner:this.owner,...extra});}
  bounds(point) {
    const edge=Math.max(.06,this.radius/this.aspect);
    return{x:clamp(point.x,edge,1-edge),y:clamp(point.y,this.radius,.92-this.radius)};
  }
  distance(a,b) {return Math.hypot((a.x-b.x)*this.aspect,a.y-b.y);}
  segmentDistance(point,a,b) {
    const dx=(b.x-a.x)*this.aspect,dy=b.y-a.y,px=(point.x-a.x)*this.aspect,py=point.y-a.y;
    const along=clamp((px*dx+py*dy)/(dx*dx+dy*dy||1),0,1);
    return Math.hypot(px-dx*along,py-dy*along);
  }
  estimateVelocity(timestamp) {
    const samples=this.samples.filter(p=>timestamp-p.timestamp<=160&&p.timestamp<=timestamp);
    if(samples.length<2||samples.at(-1).timestamp-samples[0].timestamp<30)return{x:0,y:0};
    // Favor the final wrist motion without relying on a noisy last-frame delta.
    const weights=samples.map(p=>Math.exp((p.timestamp-timestamp)/45));
    const total=weights.reduce((sum,w)=>sum+w,0);
    const mean=samples.reduce((sum,p,i)=>sum+p.timestamp*weights[i],0)/total;
    const x=samples.reduce((sum,p,i)=>sum+p.x*weights[i],0)/total,y=samples.reduce((sum,p,i)=>sum+p.y*weights[i],0)/total;
    let denominator=0,vx=0,vy=0;
    for(const [i,p] of samples.entries()){const dt=(p.timestamp-mean)/1000,w=weights[i];denominator+=w*dt*dt;vx+=w*dt*(p.x-x);vy+=w*dt*(p.y-y);}
    if(denominator<1e-9)return{x:0,y:0};vx/=denominator;vy/=denominator;
    const speed=Math.hypot(vx*this.aspect,vy),factor=speed>2.4?2.4/speed:1;
    return{x:vx*factor,y:vy*factor};
  }
  sample(timestamp) {
    if(this.samples.at(-1)?.timestamp===timestamp)this.samples.pop();
    this.samples.push({...copy(this.position),timestamp});this.samples=this.samples.filter(p=>timestamp-p.timestamp<=180);
  }
  grab(owner,point,timestamp,label='',wasFlight=false) {
    const otherHand=typeof owner==='number'&&owner!==this.thrower&&(!label||!this.throwerLabel||label!==this.throwerLabel);
    const scored=wasFlight&&timestamp-this.lastThrowAt>=80&&otherHand;
    if(wasFlight){
      const delta={x:this.position.x-point.x,y:this.position.y-point.y},distance=Math.hypot(delta.x*this.aspect,delta.y),factor=distance>.075?.075/distance:1;
      this.position=this.bounds({x:point.x+delta.x*factor,y:point.y+delta.y*factor});
      if(this.distance(this.position,point)>.10)this.position=this.bounds(point);
    }
    this.phase='held';this.owner=owner;this.offset={x:this.position.x-point.x,y:this.position.y-point.y};
    this.velocity={x:0,y:0};this.samples=[];this.sample(timestamp);this.pendingRelease=null;this.heldPaused=false;this.trail=[];this.segments=[];
    if(scored){this.catches++;this.streak++;this.lastCatchAt=timestamp;this.emit('catch',{catches:this.catches,streak:this.streak});}
    else this.emit('grab');
  }
  launch(timestamp,velocity) {
    this.thrower=this.owner;this.throwerLabel=this.tracker.tracks.get(this.owner)?.label||'';this.owner=null;
    this.phase='flying';this.velocity=copy(velocity);this.lastThrowAt=timestamp;this.throws++;this.samples=[];this.pendingRelease=null;this.heldPaused=false;this.accumulator=0;
    this.trail=[copy(this.position)];this.segments=[];this.emit('throw',{velocity:copy(this.velocity),throws:this.throws});
  }
  safelyRelease(reason='tracking-lost') {
    if(this.phase!=='held')return;this.owner=null;this.phase='idle';this.velocity={x:0,y:0};this.samples=[];this.pendingRelease=null;this.heldPaused=false;this.accumulator=0;this.trail=[];this.segments=[];
    if(reason==='tracking-lost')this.streak=0;this.emit(reason);
  }
  syncHeld(timestamp,record=false) {
    if(this.phase!=='held'||this.owner==='mouse')return;
    const track=this.tracker.tracks.get(this.owner);
    if(!track||track.blocked||timestamp-track.lastSeen>=260){this.safelyRelease();return;}
    if(!track.active){
      if(this.pendingRelease&&track.visible&&timestamp-track.lastSeen<180)this.launch(timestamp,this.pendingRelease.velocity);
      else this.safelyRelease();
      return;
    }
    if(!track.visible||timestamp-track.lastSeen>180){this.heldPaused=true;this.pendingRelease=null;return;}
    if(track.releaseSince!==null){
      if(!this.pendingRelease)this.pendingRelease={timestamp:track.releaseSince,velocity:this.estimateVelocity(track.releaseSince),origin:copy(this.position)};
      // Preview the buffered motion while confirming release. Never follow the
      // opening fingertips, which can jump away from the actual flick path.
      const dt=Math.min(.12,Math.max(0,(timestamp-this.pendingRelease.timestamp)/1000));
      this.position=this.bounds({x:this.pendingRelease.origin.x+this.pendingRelease.velocity.x*dt,y:this.pendingRelease.origin.y+this.pendingRelease.velocity.y*dt});
      this.heldPaused=false;return;
    }
    if(this.heldPaused||this.pendingRelease){this.offset={x:this.position.x-track.point.x,y:this.position.y-track.point.y};this.samples=[];this.heldPaused=false;}
    this.pendingRelease=null;this.position=this.bounds({x:track.point.x+this.offset.x,y:track.point.y+this.offset.y});if(record)this.sample(timestamp);
  }
  tryHands(timestamp,swept=false) {
    if(this.phase==='held')return;
    const flight=this.phase==='flying';
    if(flight&&timestamp-this.lastThrowAt<80)return;
    const tracks=this.tracker.active.filter(t=>t.visible&&t.releaseSince===null&&!t.blocked&&timestamp-t.lastSeen<=180);
    let nearest=null,closest=Infinity;
    for(const t of tracks){
      if(flight&&this.distance(t.point,this.bounds(t.point))>.10)continue;
      if(flight&&timestamp-this.lastThrowAt<250&&(t.id===this.thrower||(t.label&&t.label===this.throwerLabel)))continue;
      let d=this.distance(t.point,this.position);
      if(flight&&swept)for(const s of this.segments)if(timestamp-s.timestamp<=100)d=Math.min(d,this.segmentDistance(t.point,s.a,s.b));
      if(d<=.12&&d<closest){nearest=t;closest=d;}
    }
    if(nearest)this.grab(nearest.id,nearest.point,timestamp,nearest.label,flight);
  }
  physics(dt,timestamp) {
    const previous=copy(this.position);this.velocity.y+=.85*dt;
    const damping=Math.exp(-.08*dt);this.velocity.x*=damping;this.velocity.y*=damping;
    this.position.x+=this.velocity.x*dt;this.position.y+=this.velocity.y*dt;
    const edge=Math.max(.06,this.radius/this.aspect),floor=.92-this.radius;
    if(this.position.x<edge){this.position.x=edge;this.velocity.x=Math.abs(this.velocity.x)*.6;}
    if(this.position.x>1-edge){this.position.x=1-edge;this.velocity.x=-Math.abs(this.velocity.x)*.6;}
    if(this.position.y<this.radius){this.position.y=this.radius;this.velocity.y=Math.abs(this.velocity.y)*.6;}
    if(this.position.y>floor){this.position.y=floor;this.velocity.y=-Math.abs(this.velocity.y)*.6;this.velocity.x*=.9;if(Math.abs(this.velocity.y)<.055)this.velocity.y=0;}
    this.segments.push({a:previous,b:copy(this.position),timestamp});this.segments=this.segments.filter(s=>timestamp-s.timestamp<=120);
    this.trail.push(copy(this.position));if(this.trail.length>24)this.trail.shift();
    this.tryHands(timestamp,true);
    if(this.phase==='flying'&&(timestamp-this.lastThrowAt>=3000||(this.position.y>=floor-.002&&Math.hypot(this.velocity.x*this.aspect,this.velocity.y)<.06&&timestamp-this.lastThrowAt>500))){
      this.phase='idle';this.position={x:.5,y:.45};this.velocity={x:0,y:0};this.owner=null;this.streak=0;this.trail=[];this.segments=[];this.emit('miss');
    }
  }
  tick(timestamp) {
    if(!Number.isFinite(timestamp)||(this.clock!==null&&timestamp<this.clock))return this.state;
    const elapsed=this.clock===null?0:(timestamp-this.clock)/1000;this.clock=timestamp;this.tracker.aspect=this.aspect;this.tracker.tick(timestamp);this.syncHeld(timestamp);
    if(this.phase==='flying'){
      this.accumulator+=Math.min(elapsed,8*fixedStep);
      for(let substeps=0;this.accumulator+1e-9>=fixedStep&&substeps<8&&this.phase==='flying';substeps++){this.accumulator-=fixedStep;this.physics(fixedStep,timestamp);}
    }else this.accumulator=0;
    return this.state;
  }
  update(hands,timestamp) {
    if(!Number.isFinite(timestamp)||(this.clock!==null&&timestamp<this.clock))return this.state;
    this.tick(timestamp);this.tracker.update(hands,timestamp);this.syncHeld(timestamp,true);this.tryHands(timestamp,true);return this.state;
  }
  reset({center=true}={}) {
    this.tracker.reset(this.clock??0,'reset');this.phase='idle';this.owner=null;this.velocity={x:0,y:0};this.samples=[];this.pendingRelease=null;this.heldPaused=false;this.accumulator=0;this.trail=[];this.segments=[];this.thrower=null;this.throwerLabel='';this.lastThrowAt=-Infinity;
    if(center){this.position={x:.5,y:.45};this.throws=0;this.catches=0;this.streak=0;}this.emit('reset');return this.state;
  }
  pointerGrab(point,timestamp) {
    if(!finite(point)||!Number.isFinite(timestamp)||(this.clock!==null&&timestamp<this.clock))return false;
    this.tick(timestamp);if(this.phase==='held'||this.distance(point,this.position)>.12)return false;
    this.grab('mouse',point,timestamp,'',this.phase==='flying');return true;
  }
  pointerMove(point,timestamp) {
    if(this.owner!=='mouse'||this.phase!=='held'||!finite(point)||!Number.isFinite(timestamp)||(this.clock!==null&&timestamp<this.clock))return false;
    this.tick(timestamp);this.position=this.bounds({x:point.x+this.offset.x,y:point.y+this.offset.y});this.sample(timestamp);return true;
  }
  pointerRelease(timestamp,{cancel=false}={}) {
    if(this.owner!=='mouse'||this.phase!=='held'||!Number.isFinite(timestamp)||(this.clock!==null&&timestamp<this.clock))return false;
    this.tick(timestamp);if(cancel)this.safelyRelease('cancelled');else this.launch(timestamp,this.estimateVelocity(timestamp));return true;
  }
}
