import test from 'node:test';
import assert from 'node:assert/strict';
import {DonutGestures} from '../web/donut-gestures.js';
function hand(x=.3,y=.5,ratio=.2,label=''){
 const landmarks=Array.from({length:21},()=>({x,y,z:0}));landmarks[0]={x,y:y+.12};landmarks[9]={x,y:y-.08};landmarks[5]={x:x-.1,y};landmarks[17]={x:x+.1,y};landmarks[4]={x:x-ratio*.1,y};landmarks[8]={x:x+ratio*.1,y};return{landmarks,handedness:label};
}
function fixture(){let shape={radius:1,tube:.28,twist:0,ripple:0,detail:'medium'};const starts=[],changes=[],ends=[];const c=new DonutGestures({aspect:1,getShape:()=>shape,onStart:e=>starts.push(e),onChange:(next,event)=>{shape=next;changes.push({shape:{...next},event});},onEnd:e=>ends.push(e)});return{c,starts,changes,ends,get shape(){return shape;},setShape(next){shape={...shape,...next};}};}
const near=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
function acquire(f,hands){f.c.update(hands,0);f.c.update(hands,100);}

test('stable acquisition and debounced release prevent transient open/reacquire flicker',()=>{
 const f=fixture();f.c.update([hand()],0);f.c.update([hand()],99);assert.equal(f.starts.length,0);f.c.update([hand()],100);assert.equal(f.starts.length,1);assert.equal(f.c.status.pinching,1);
 f.c.update([hand(.3,.5,.5)],120);assert.equal(f.c.status.paused,true);f.c.update([hand(.3,.5,.37)],160);assert.equal(f.ends.length,0);assert.equal(f.c.status.paused,false);
 f.c.update([hand(.3,.5,.5)],200);f.c.update([hand(.3,.5,.5)],269);assert.equal(f.ends.length,0);f.c.update([hand(.3,.5,.5)],270);assert.equal(f.ends.length,1);assert.equal(f.ends[0].reason,'released');assert.equal(f.starts.length,1);
});
test('one pinch sculpts thickness, and switching tools rebases ripple without a jump',()=>{
 const f=fixture();acquire(f,[hand()]);f.c.update([hand(.3,.4)],180);assert.ok(f.shape.tube>.36);const before={...f.shape};f.c.tool='ripple';f.c.update([hand(.3,.4)],200);assert.deepEqual(f.shape,before);f.c.update([hand(.3,.3)],280);assert.ok(f.shape.ripple>.15);near(f.shape.tube,before.tube);assert.equal(f.shape.detail,'medium');assert.equal(f.starts.length,1);
});
test('stationary landmark noise is filtered and meaningful slow movement remains responsive',()=>{
 const f=fixture();acquire(f,[hand()]);for(let i=1;i<=30;i++)f.c.update([hand(.3,.5+(i%2?.004:-.004))],100+i*16);assert.ok(Math.abs(f.shape.tube-.28)<.006);assert.ok(f.changes.length<10);
 for(let i=1;i<=30;i++)f.c.update([hand(.3,.5-i*.003)],580+i*16);assert.ok(f.shape.tube>.35);
});
test('detector reordering preserves identities and applies a two-hand update only once per frame',()=>{
 const f=fixture();acquire(f,[hand(.3,.5,.2,'Left'),hand(.7,.5,.2,'Right')]);const ids=f.c.status.points.map(p=>p.id);f.c.update([hand(.72,.5,.2,'Right'),hand(.28,.5,.2,'Left')],180);assert.equal(f.changes.length,1);assert.ok(f.shape.radius>1.07);assert.equal(f.c.status.points.find(p=>p.id===ids[0]).x<.4,true);assert.equal(f.c.status.points.find(p=>p.id===ids[1]).x>.6,true);near(f.shape.twist,0);
 f.c.update([hand(.28,.5,.2,'Left'),hand(.72,.5,.2,'Right')],200);assert.ok(f.shape.radius<1.12);assert.equal(f.starts.length,1);
});
test('one/two-hand joins and releases preserve the current surface instead of jumping',()=>{
 const f=fixture();acquire(f,[hand(.3,.5,.2,'Left')]);f.c.update([hand(.3,.45,.2,'Left'),hand(.7,.45,.2,'Right')],160);f.c.update([hand(.3,.45,.2,'Left'),hand(.7,.45,.2,'Right')],210);const beforeJoin={...f.shape};f.c.update([hand(.3,.45,.2,'Left'),hand(.7,.45,.2,'Right')],260);assert.deepEqual(f.shape,beforeJoin);
 f.c.update([hand(.25,.45,.2,'Left'),hand(.75,.4,.2,'Right')],340);assert.ok(f.shape.radius>1.2);const beforeEnd={...f.shape};f.c.update([hand(.25,.45,.2,'Left'),hand(.75,.4,.6,'Right')],360);f.c.update([hand(.25,.45,.2,'Left'),hand(.75,.4,.6,'Right')],430);assert.deepEqual(f.shape,beforeEnd);f.c.update([hand(.25,.45,.2,'Left')],450);assert.deepEqual(f.shape,beforeEnd);assert.equal(f.starts.length,1);assert.equal(f.ends.length,0);
});
test('losing one participant pauses the entire surface and recovery rebases both points',()=>{
 const f=fixture();acquire(f,[hand(.3,.5,.2,'Left'),hand(.7,.5,.2,'Right')]);f.c.update([hand(.28,.5,.2,'Left'),hand(.72,.5,.2,'Right')],180);const before={...f.shape};f.c.update([hand(.2,.4,.2,'Left')],220);assert.equal(f.c.status.paused,true);assert.deepEqual(f.shape,before);f.c.update([hand(.18,.35,.2,'Left')],270);assert.deepEqual(f.shape,before);
 f.c.update([hand(.18,.35,.2,'Left'),hand(.8,.45,.2,'Right')],320);assert.equal(f.c.status.paused,false);assert.deepEqual(f.shape,before);assert.equal(f.ends.length,0);f.c.update([hand(.17,.35,.2,'Left'),hand(.81,.45,.2,'Right')],380);assert.ok(f.shape.radius>before.radius);
});
test('continued loss ends once at 260 ms and a survivor cannot silently reacquire while pinched',()=>{
 const f=fixture();acquire(f,[hand(.3,.5,.2,'Left'),hand(.7,.5,.2,'Right')]);f.c.update([hand(.3,.5,.2,'Left')],180);f.c.tick(359);assert.equal(f.ends.length,0);f.c.tick(360);assert.equal(f.ends.length,1);assert.equal(f.ends[0].reason,'tracking-lost');const before={...f.shape};f.c.update([hand(.3,.3,.2,'Left')],400);f.c.update([hand(.3,.2,.2,'Left')],510);assert.deepEqual(f.shape,before);assert.equal(f.starts.length,1);f.c.reset(520);assert.equal(f.ends.length,1);
});
test('reset and invalid detections are safe and do not mutate the sculpture',()=>{
 const f=fixture();acquire(f,[hand()]);f.c.update([{landmarks:[]}],150);assert.equal(f.c.status.paused,true);const before={...f.shape};f.c.reset(160);assert.deepEqual(f.shape,before);assert.equal(f.ends[0].reason,'reset');assert.equal(f.c.status.handCount,0);f.c.reset(170);assert.equal(f.ends.length,1);
});
test('two-hand angle crossing the -pi/pi seam changes twist continuously',()=>{
 const f=fixture();acquire(f,[hand(.6,.5,.2,'Left'),hand(.4,.495,.2,'Right')]);f.c.update([hand(.6,.5,.2,'Left'),hand(.4,.505,.2,'Right')],180);assert.ok(f.shape.twist>0);assert.ok(f.shape.twist<.3);
});
test('time-based filtering gives comparable sculpting at different frame rates',()=>{
 const run=dt=>{const f=fixture();acquire(f,[hand()]);for(let t=100+dt;t<=1100;t+=dt)f.c.update([hand(.3,.5-(t-100)*.0001)],t);return f.shape.tube;};near(run(20),run(50),.012);
});
test('absolute baselines keep clamped controls stable on overshoot and return',()=>{
 const f=fixture();acquire(f,[hand()]);let t=100;for(const y of [.4,.3,.2,.1,0,-.1,-.2])f.c.update([hand(.3,y)],t+=80);near(f.shape.tube,.6);f.c.update([hand(.3,-.1)],t+=80);near(f.shape.tube,.6);f.c.update([hand(.3,0)],t+=80);near(f.shape.tube,.6);f.c.update([hand(.3,.3)],t+=80);assert.ok(f.shape.tube>.48&&f.shape.tube<.53);
});
test('a prolonged frame stall holds and rebases instead of mapping unseen movement',()=>{
 const f=fixture();acquire(f,[hand()]);f.c.tick(290);assert.equal(f.c.status.paused,true);const before={...f.shape};f.c.update([hand(.3,.3)],300);assert.deepEqual(f.shape,before);assert.equal(f.c.status.paused,false);
});
test('external slider edits are respected by rebasing the next gesture frame',()=>{
 const f=fixture();acquire(f,[hand()]);f.setShape({tube:.4});f.c.update([hand(.3,.4)],180);near(f.shape.tube,.4);f.c.update([hand(.3,.3)],260);assert.ok(f.shape.tube>.48);
});

test('two-hand radius limits do not reverse prematurely after overshooting',()=>{
 const f=fixture();acquire(f,[hand(.3,.5,.2,'Left'),hand(.7,.5,.2,'Right')]);let t=100;
 for(const span of [.6,.8,1,1.2])f.c.update([hand(.5-span/2,.5,.2,'Left'),hand(.5+span/2,.5,.2,'Right')],t+=80);
 near(f.shape.radius,1.55);f.c.update([hand(.05,.5,.2,'Left'),hand(.95,.5,.2,'Right')],t+=80);near(f.shape.radius,1.55);
 f.c.update([hand(.2,.5,.2,'Left'),hand(.8,.5,.2,'Right')],t+=80);assert.ok(f.shape.radius>1.45&&f.shape.radius<1.53);assert.ok(f.shape.tube<=.6*f.shape.radius);
});
test('controller accepts an initial ripple tool and stale frames cannot mutate an edit',()=>{
 const f=fixture();f.c.tool='ripple';acquire(f,[hand()]);f.c.update([hand(.3,.4)],180);const before={...f.shape};f.c.update([hand(.3,.1)],170);assert.deepEqual(f.shape,before);assert.throws(()=>{f.c.tool='unknown';});
 const direct=new DonutGestures({tool:'ripple'});assert.equal(direct.tool,'ripple');
});


test('normal 8 FPS camera delivery still sculpts instead of rebasing every frame',()=>{
 const f=fixture();acquire(f,[hand()]);for(let frame=1;frame<=5;frame++){const t=100+frame*125;for(let dt=16;dt<125;dt+=16)f.c.tick(t-125+dt);f.c.update([hand(.3,.5-frame*.02)],t);}assert.ok(f.shape.tube>.36);assert.equal(f.starts.length,1);assert.equal(f.c.status.paused,false);
});
