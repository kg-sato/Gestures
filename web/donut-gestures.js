/** Stable, camera-independent sculpting gestures. Coordinates are already mirrored. */
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const geometryKeys=['radius','tube','twist','ripple'];
const distance=(a,b,aspect)=>Math.hypot((a.x-b.x)*aspect,a.y-b.y);
const mean=points=>({x:points.reduce((sum,p)=>sum+p.x,0)/points.length,y:points.reduce((sum,p)=>sum+p.y,0)/points.length});
const valid=hand=>hand?.landmarks?.length===21&&hand.landmarks.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
const wrapped=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
const shapeValues=shape=>({radius:clamp(shape.radius??1,.6,1.55),tube:clamp(shape.tube??.28,.1,.6),twist:clamp(shape.twist??0,-Math.PI,Math.PI),ripple:clamp(shape.ripple??0,0,1)});

export class DonutGestures {
  constructor({onStart=()=>{},onChange=()=>{},onEnd=()=>{},aspect=16/9,getShape=()=>({radius:1,tube:.28,twist:0,ripple:0}),tool='tube'}={}){
    this.onStart=onStart;this.onChange=onChange;this.onEnd=onEnd;this.aspect=aspect;this.getShape=getShape;
    this.tracks=new Map();this.nextId=1;this.session=false;this.baseline=null;this.needsRebase=false;this.suspended=false;this.now=0;this.lastUpdate=-Infinity;this._tool='tube';this.lastOutput=null;this.tool=tool;
  }
  get tool(){return this._tool;}
  set tool(value){if(!['tube','ripple'].includes(value))throw new Error('Unknown donut sculpt tool');if(value!==this._tool){this._tool=value;this.needsRebase=true;}}
  get active(){return [...this.tracks.values()].filter(t=>t.active).sort((a,b)=>a.id-b.id);}
  get status(){
    const visible=[...this.tracks.values()].filter(t=>t.visible&&this.now-t.lastSeen<260),active=this.active;
    const paused=this.session&&(this.suspended||active.some(t=>!t.visible||t.releaseSince!==null||this.now-t.lastSeen>180));
    let label=visible.length?'Pinch to sculpt':'Show your hand';
    if(visible.some(t=>t.pinching&&!t.active))label='Hold pinch to sculpt';
    if(active.length===1)label=this.tool==='ripple'?'Pinch · sculpt ripple':'Pinch · sculpt thickness';
    if(active.length===2)label='Spread · hole / tilt · twist';
    if(visible.some(t=>t.blocked))label='Open pinch to continue';
    if(paused)label='Tracking paused';
    return{label,handCount:visible.length,pinching:active.length,paused,points:visible.map(t=>({id:t.id,x:t.point.x,y:t.point.y,pinching:t.active}))};
  }
  finish(reason,timestamp){
    const ended=this.session;this.session=false;this.baseline=null;this.needsRebase=true;this.suspended=false;this.lastOutput=null;
    if(ended)this.onEnd({reason,timestamp});
  }
  tick(timestamp){
    if(!Number.isFinite(timestamp))return this.status;
    this.now=Math.max(this.now,timestamp);
    const expired=[...this.tracks.values()].filter(t=>timestamp-t.lastSeen>=260);
    if(expired.some(t=>t.active)){
      this.finish('tracking-lost',timestamp);
      // A still-pinched survivor must open once before starting a fresh edit.
      for(const t of this.tracks.values()){t.blocked=t.active||t.pinching;t.active=false;t.since=null;t.releaseSince=null;}
    }
    for(const t of expired)this.tracks.delete(t.id);
    if(this.session&&this.active.some(t=>timestamp-t.lastSeen>180)){this.suspended=true;this.needsRebase=true;}
    return this.status;
  }
  reset(timestamp=this.now,reason='reset'){
    this.finish(reason,timestamp);this.tracks.clear();this.now=Math.max(this.now,timestamp);this.lastUpdate=-Infinity;return this.status;
  }
  detections(input){return(Array.isArray(input)?input:[]).filter(valid).slice(0,2).map(hand=>{
    const p=hand.landmarks,palm=Math.max(.015,(distance(p[5],p[17],this.aspect)+distance(p[0],p[9],this.aspect))/2);
    return{center:mean([p[0],p[5],p[9],p[13],p[17]]),point:mean([p[4],p[8]]),ratio:distance(p[4],p[8],this.aspect)/palm,label:hand.handedness||''};
  });}
  match(hands,timestamp){
    const tracks=[...this.tracks.values()];let best={cost:Infinity,matches:[]};
    const assign=(i,used,matches,cost)=>{
      if(i===hands.length){if(cost<best.cost)best={cost,matches};return;}
      assign(i+1,used,[...matches,null],cost+.65);
      for(const t of tracks){if(used.has(t.id))continue;const dt=clamp(timestamp-t.lastSeen,0,100),predicted={x:t.center.x+t.velocity.x*dt,y:t.center.y+t.velocity.y*dt};let d=distance(hands[i].center,predicted,this.aspect);if(d>.65)continue;if(t.label&&hands[i].label&&t.label!==hands[i].label)d+=.15;assign(i+1,new Set([...used,t.id]),[...matches,t],cost+d);}
    };
    assign(0,new Set(),[],0);return best.matches;
  }
  filter(track,raw,timestamp,recovering){
    const dt=timestamp-track.lastSeen;if(recovering||dt<=0){track.point={...raw};track.raw={...raw};return;}
    const speed=distance(raw,track.raw,this.aspect)/(dt/1000),halfLife=50/(1+Math.min(4,speed*2)),alpha=1-Math.exp(-Math.LN2*dt/halfLife);
    const next={x:track.point.x+(raw.x-track.point.x)*alpha,y:track.point.y+(raw.y-track.point.y)*alpha};
    if(distance(next,track.point,this.aspect)>=.003)track.point=next;track.raw={...raw};
  }
  rebase(active){
    const shape=shapeValues(this.getShape());this.baseline={ids:active.map(t=>t.id).join(','),shape,point:{...active[0].point}};
    if(active.length===2){const [a,b]=active.map(t=>t.point);this.baseline.distance=Math.max(.05,distance(a,b,this.aspect));this.baseline.lastAngle=Math.atan2(-(b.y-a.y),(b.x-a.x)*this.aspect);this.baseline.angleDelta=0;}
    this.lastOutput={...shape};this.needsRebase=false;
  }
  apply(active,timestamp){
    const b=this.baseline,shape={...b.shape};
    if(active.length===1){const dy=b.point.y-active[0].point.y;if(this.tool==='ripple')shape.ripple=clamp(b.shape.ripple+dy*2,0,1);else shape.tube=b.shape.tube+dy*1.1;}
    else{
      const [a,c]=active.map(t=>t.point),angle=Math.atan2(-(c.y-a.y),(c.x-a.x)*this.aspect);
      b.angleDelta+=wrapped(angle-b.lastAngle);b.lastAngle=angle;shape.radius=clamp(b.shape.radius*distance(a,c,this.aspect)/b.distance,.6,1.55);shape.twist=clamp(b.shape.twist+b.angleDelta*2,-Math.PI,Math.PI);
    }
    shape.tube=clamp(shape.tube,.1,Math.min(.6,.6*shape.radius));
    if(geometryKeys.some(k=>Math.abs(shape[k]-(this.lastOutput?.[k]??b.shape[k]))>1e-5)){
      this.lastOutput={...shape};this.onChange({...this.getShape(),...shape},{timestamp,mode:active.length===2?'two-hand':this.tool,ids:active.map(t=>t.id)});
    }
  }
  update(input,timestamp){
    if(!Number.isFinite(timestamp)||timestamp<this.lastUpdate)return this.status;
    this.tick(timestamp);this.lastUpdate=timestamp;this.now=timestamp;
    const hands=this.detections(input),matches=this.match(hands,timestamp),previousVisible=new Map([...this.tracks.values()].map(t=>[t.id,t.visible]));
    for(const t of this.tracks.values())t.visible=false;
    for(let i=0;i<hands.length;i++){
      const hand=hands[i];let t=matches[i];
      if(!t){t={id:this.nextId++,center:hand.center,point:{...hand.point},raw:{...hand.point},velocity:{x:0,y:0},label:hand.label,lastSeen:timestamp,visible:true,active:false,pinching:false,since:null,releaseSince:null,blocked:false};this.tracks.set(t.id,t);}
      else{const dt=timestamp-t.lastSeen,recovering=!previousVisible.get(t.id)||dt>180;this.filter(t,hand.point,timestamp,recovering);if(dt>0)t.velocity={x:(hand.center.x-t.center.x)/dt,y:(hand.center.y-t.center.y)/dt};}
      t.center=hand.center;t.label=hand.label||t.label;t.lastSeen=timestamp;t.visible=true;
      const pinching=t.pinching?hand.ratio<=.44:hand.ratio<.30;
      if(t.blocked){if(hand.ratio>.44){t.blocked=false;t.pinching=false;t.since=null;}continue;}
      if(pinching){if(!t.pinching)t.since=timestamp;t.pinching=true;t.releaseSince=null;if(!t.active&&timestamp-t.since>=100)t.active=true;}
      else if(t.active){t.releaseSince??=timestamp;if(timestamp-t.releaseSince>=70){t.active=false;t.pinching=false;t.since=null;t.releaseSince=null;}}
      else{t.pinching=false;t.since=null;t.releaseSince=null;}
    }
    for(const t of this.tracks.values())if(!t.visible&&!t.active){t.pinching=false;t.since=null;t.releaseSince=null;}
    const active=this.active;
    if(!active.length){if(this.session)this.finish('released',timestamp);this.suspended=false;return this.status;}
    if(!this.session){this.session=true;this.onStart({timestamp});this.rebase(active);}
    const paused=active.some(t=>!t.visible||t.releaseSince!==null);
    if(paused){this.suspended=true;this.needsRebase=true;return this.status;}
    if(this.suspended){this.needsRebase=true;this.suspended=false;}
    const external=shapeValues(this.getShape());
    if(this.lastOutput&&geometryKeys.some(k=>Math.abs(external[k]-this.lastOutput[k])>1e-5))this.needsRebase=true;
    if(this.needsRebase||this.baseline.ids!==active.map(t=>t.id).join(',')){this.rebase(active);return this.status;}
    this.apply(active,timestamp);return this.status;
  }
}
