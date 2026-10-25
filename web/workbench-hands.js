/** Stable, camera-independent pinch events. Coordinates are already mirrored. */
const mean = points => ({x: points.reduce((s,p)=>s+p.x,0)/points.length, y: points.reduce((s,p)=>s+p.y,0)/points.length});
const distance = (a,b,aspect) => Math.hypot((a.x-b.x)*aspect,a.y-b.y);
const valid = hand => hand?.landmarks?.length === 21 && hand.landmarks.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));

export class HandTracker {
  constructor({aspect=16/9}={}) {
    this.aspect=aspect;
    this.tracks=new Map();
    this.nextId=1;
    this.count=0;
  }
  get active() { return [...this.tracks.values()].filter(t=>t.active); }
  event(type,track,timestamp,throwAllowed=false) {
    return {type,id:track.id,point:{...track.point},timestamp,throwAllowed};
  }
  tick(timestamp) {
    const events=[];
    for (const [id,track] of this.tracks) {
      if (timestamp-track.lastSeen >= 150) {
        if(track.active) events.push(this.event('end',track,timestamp,false));
        this.tracks.delete(id);
      }
    }
    return events;
  }
  reset(timestamp=0) {
    const events=this.active.map(track=>this.event('end',track,timestamp,false));
    this.tracks.clear();this.count=0;
    return events;
  }
  update(input,timestamp) {
    const events=this.tick(timestamp);
    const hands=(Array.isArray(input)?input:[]).filter(valid).slice(0,2).map(hand=>{
      const p=hand.landmarks;
      const palm=Math.max(.015,(distance(p[5],p[17],this.aspect)+distance(p[0],p[9],this.aspect))/2);
      return {center:mean([p[0],p[5],p[9],p[13],p[17]]),point:mean([p[4],p[8]]),ratio:distance(p[4],p[8],this.aspect)/palm};
    });
    this.count=hands.length;
    const tracks=[...this.tracks.values()];
    // Exhaustively match the two-hand case. Greedy nearest matching can swap
    // identities when one detection is closer to both previous palms.
    let best={cost:Infinity,matches:[]};
    const assign=(index,used,matches,cost)=>{
      if(index===hands.length){if(cost<best.cost)best={cost,matches:[...matches]};return;}
      assign(index+1,used,[...matches,null],cost+.6);
      for(const track of tracks){
        if(used.has(track.id))continue;
        const dt=Math.min(100,timestamp-track.lastSeen);
        const predicted={x:track.center.x+track.velocity.x*dt,y:track.center.y+track.velocity.y*dt};
        const d=distance(hands[index].center,predicted,this.aspect);
        if(d>.6)continue;
        assign(index+1,new Set([...used,track.id]),[...matches,track],cost+d);
      }
    };
    assign(0,new Set(),[],0);
    hands.forEach((hand,index)=>{
      let track=best.matches[index];
      if(!track){
        track={id:this.nextId++,center:hand.center,point:hand.point,velocity:{x:0,y:0},lastSeen:timestamp,active:false,pinching:false,since:null};
        this.tracks.set(track.id,track);
      }else{
        const dt=timestamp-track.lastSeen;
        if(dt>0) track.velocity={x:(hand.center.x-track.center.x)/dt,y:(hand.center.y-track.center.y)/dt};
      }
      track.center=hand.center;track.point=hand.point;track.lastSeen=timestamp;
      const pinching=track.pinching?hand.ratio<=.44:hand.ratio<.30;
      if(pinching){
        if(!track.pinching)track.since=timestamp;
        track.pinching=true;
        if(!track.active && timestamp-track.since>=80){track.active=true;events.push(this.event('start',track,timestamp));}
        else if(track.active)events.push(this.event('move',track,timestamp));
      }else{
        if(track.active)events.push(this.event('end',track,timestamp,true));
        track.active=false;track.pinching=false;track.since=null;
      }
    });
    // An interrupted acquisition must establish a new continuous 80 ms pinch.
    for(const track of this.tracks.values())if(track.lastSeen!==timestamp&&!track.active){track.pinching=false;track.since=null;}
    return events;
  }
}
