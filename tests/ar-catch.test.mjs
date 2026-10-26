import test from 'node:test';
import assert from 'node:assert/strict';
import {ARCatch} from '../web/ar-catch.js';
const near=(a,b,epsilon=1e-7)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} != ${b}`);
function hand(x=.5,y=.45,ratio=.2,label='Left'){
 const landmarks=Array.from({length:21},()=>({x,y,z:0}));landmarks[0]={x,y:y+.12};landmarks[9]={x,y:y-.08};landmarks[5]={x:x-.1,y};landmarks[17]={x:x+.1,y};landmarks[4]={x:x-ratio*.1,y};landmarks[8]={x:x+ratio*.1,y};return{landmarks,handedness:label};
}
function fixture(){const events=[],game=new ARCatch({aspect:1,onEvent:e=>events.push(e)});return{game,events};}
function grab(game,x=.5,y=.45){game.update([hand(x,y)],0);game.update([hand(x,y)],100);assert.equal(game.state.phase,'held');}
function pointerThrow(game,{x=.5,y=.45}={},velocity={x:1,y:-.5},start=0){game.pointerGrab(game.state.position,start);for(let i=1;i<=4;i++)game.pointerMove({x:x+velocity.x*.025*i,y:y+velocity.y*.025*i},start+i*25);game.pointerRelease(start+110);return start+110;}

test('idle donut stays put and stable pinch acquisition preserves grab offset',()=>{
 const {game}=fixture();game.tick(0);game.tick(1000);assert.equal(game.state.phase,'idle');assert.deepEqual(game.state.position,{x:.5,y:.45});game.reset();game.update([hand(.55,.45)],1100);game.update([hand(.55,.45)],1200);near(game.state.position.x,.5);game.update([hand(.6,.45)],1280);assert.ok(game.state.position.x>.54);assert.equal(game.state.owner,1);
});

test('release debounce freezes a buffered throw vector before opening fingertips move',()=>{
 const {game,events}=fixture();grab(game);for(const [t,x]of[[140,.53],[180,.57],[220,.62]])game.update([hand(x,.45)],t);const open=hand(.62,.45,.6);open.landmarks[4]={x:.74,y:.2};open.landmarks[8]={x:.86,y:.2};game.update([open],240);const held=game.state.position;assert.equal(game.state.phase,'held');assert.equal(game.state.paused,false);game.tick(275);assert.ok(game.state.position.x>held.x);assert.ok(Math.abs(game.state.position.y-held.y)<.001);game.update([open],310);assert.equal(game.state.phase,'flying');assert.ok(game.state.position.x>held.x);assert.ok(game.state.velocity.x>.5&&game.state.velocity.x<1.5);assert.ok(Math.abs(game.state.velocity.y)<.05);assert.equal(game.state.throws,1);assert.equal(events.filter(e=>e.type==='throw').length,1);
});

test('short loss holds position and recovery rebases without jumping or throwing',()=>{
 const {game}=fixture();grab(game);game.update([hand(.58,.4)],170);const held=game.state.position;game.update([],210);assert.equal(game.state.paused,true);game.update([hand(.75,.2)],260);assert.deepEqual(game.state.position,held);assert.equal(game.state.phase,'held');assert.equal(game.state.throws,0);
});

test('continued tracking loss safely releases without launching',()=>{
 const {game,events}=fixture();grab(game);game.update([hand(.6,.4)],180);const position=game.state.position;game.update([],220);game.tick(440);assert.equal(game.state.phase,'idle');assert.deepEqual(game.state.position,position);assert.deepEqual(game.state.velocity,{x:0,y:0});assert.equal(game.state.throws,0);assert.equal(events.filter(e=>e.type==='throw').length,0);
});

test('a disappearing owner cannot accidentally throw while another hand remains',()=>{
 const {game}=fixture();game.update([hand(.5,.45,.2,'Left'),hand(.8,.45,.2,'Right')],0);game.update([hand(.5,.45,.2,'Left'),hand(.8,.45,.2,'Right')],100);game.update([hand(.8,.45,.2,'Right')],150);game.tick(360);assert.equal(game.state.phase,'idle');assert.equal(game.state.throws,0);assert.deepEqual(game.state.velocity,{x:0,y:0});
});

test('pointer release derives bounded velocity; cancellation and reset never throw',()=>{
 const {game}=fixture();game.pointerGrab({x:.5,y:.45},0);game.pointerMove({x:.9,y:.1},40);game.pointerRelease(50);near(Math.hypot(game.state.velocity.x,game.state.velocity.y),2.4);assert.equal(game.state.throws,1);game.reset({center:false});assert.equal(game.state.throws,1);assert.equal(game.state.phase,'idle');assert.deepEqual(game.state.velocity,{x:0,y:0});game.pointerGrab(game.state.position,100);game.pointerMove({x:.5,y:.4},150);game.pointerRelease(160,{cancel:true});assert.equal(game.state.throws,1);assert.equal(game.state.phase,'idle');game.reset({center:true});assert.equal(game.state.throws,0);assert.deepEqual(game.state.position,{x:.5,y:.45});
});

test('a receiving pinch catches actual flight and increases catch/streak once',()=>{
 const {game,events}=fixture();const released=pointerThrow(game,{x:.5,y:.45},{x:1,y:0});game.update([hand(.82,.46,.2,'Right')],released+10);game.update([hand(.82,.46,.2,'Right')],released+110);for(let t=released+127;t<released+700&&game.state.phase==='flying';t+=17)game.tick(t);assert.equal(game.state.phase,'held');assert.equal(typeof game.state.owner,'number');assert.equal(game.state.catches,1);assert.equal(game.state.streak,1);game.tick(released+750);assert.equal(game.state.catches,1);assert.equal(events.filter(e=>e.type==='catch').length,1);
});

test('same hand cannot immediately recatch its own throw or earn a handoff score',()=>{
 const {game}=fixture();grab(game);game.update([hand(.55,.45)],150);game.update([hand(.6,.45)],200);game.update([hand(.6,.45,.6)],220);game.update([hand(.6,.45,.6)],290);assert.equal(game.state.phase,'flying');game.update([hand(.63,.45)],300);game.update([hand(.63,.45)],400);assert.equal(game.state.phase,'flying');assert.equal(game.state.catches,0);
});

test('swept path catches fast passes rather than testing only the final point',()=>{
 const {game}=fixture();pointerThrow(game,{x:.5,y:.45},{x:2,y:0});game.position={x:.5,y:.45};game.velocity={x:0,y:0};game.segments=[];game.update([hand(.9,.45,.2,'Right')],120);game.update([hand(.9,.45,.2,'Right')],220);assert.equal(game.state.phase,'flying');game.position={x:.5,y:.45};game.velocity={x:2.4,y:0};game.segments=[{a:{x:.8,y:.45},b:{x:.99,y:.45},timestamp:220}];game.tryHands(230,true);assert.equal(game.state.phase,'held');assert.equal(game.state.catches,1);const receiver=game.tracker.active.find(t=>t.id===game.state.owner);assert.ok(game.distance(game.state.position,receiver.point)<=.1);
});

test('detector ordering keeps the held owner stable',()=>{
 const {game}=fixture();game.update([hand(.5,.45,.2,'Left'),hand(.8,.6,.2,'Right')],0);game.update([hand(.5,.45,.2,'Left'),hand(.8,.6,.2,'Right')],100);const owner=game.state.owner;game.update([hand(.82,.6,.2,'Right'),hand(.52,.45,.2,'Left')],160);assert.equal(game.state.owner,owner);assert.ok(game.state.position.x>.5&&game.state.position.x<.55);
});

test('fixed-step flight is consistent at normal rendering rates and rebounds inside bounds',()=>{
 const run=dt=>{const {game}=fixture();const start=pointerThrow(game,{x:.5,y:.45},{x:1,y:-.5});for(let t=start+dt;t<start+1000-1e-5;t+=dt)game.tick(t);game.tick(start+1000);return game.state;};const a=run(1000/30),b=run(1000/60),c=run(1000/144);for(const state of[b,c]){near(state.position.x,a.position.x,.025);near(state.position.y,a.position.y,.025);}const {game}=fixture();pointerThrow(game,{x:.5,y:.45},{x:2,y:2});for(let t=130;t<=1500;t+=17){game.tick(t);assert.ok(game.state.position.x>=.065&&game.state.position.x<=.935);assert.ok(game.state.position.y>=.065&&game.state.position.y<=.855);}assert.ok(game.state.trail.length<=24);
});

test('miss resets to idle and clears streak but preserves throws; state is defensive',()=>{
 const {game}=fixture();pointerThrow(game);game.streak=3;for(let t=130;t<=3300;t+=17)game.tick(t);assert.equal(game.state.phase,'idle');assert.equal(game.state.streak,0);assert.equal(game.state.throws,1);const state=game.state;state.position.x=99;state.trail.push({x:99,y:99});assert.notEqual(game.state.position.x,99);assert.equal(game.state.trail.length,0);
});

test('stale and invalid input cannot corrupt the game',()=>{
 const {game}=fixture();game.tick(200);const state=game.state;game.update([hand()],100);game.pointerGrab({x:NaN,y:0},210);game.tick(NaN);assert.deepEqual(game.state,state);
});


test('two tracked-hand landmark streams can throw and catch without pointer simulation',()=>{
 const {game}=fixture();const frame=(t,x,ratio=.2)=>game.update([hand(.82,.45,.2,'Right'),hand(x,.45,ratio,'Left')],t);
 frame(0,.5);frame(100,.5);assert.equal(game.state.phase,'held');const thrower=game.state.owner;frame(160,.54);frame(220,.6);frame(240,.6,.6);frame(310,.6,.6);assert.equal(game.state.phase,'flying');assert.equal(game.state.throws,1);
 for(let t=327;t<490&&game.state.phase==='flying';t+=17)game.tick(t);assert.equal(game.state.phase,'held');assert.notEqual(game.state.owner,thrower);assert.equal(game.state.catches,1);const point=game.state.points.find(p=>p.id===game.state.owner);assert.ok(game.distance(game.state.position,point)<=.1);
});


test('a late accelerating flick outweighs the earlier slow drag',()=>{
 const {game}=fixture();game.samples=[{x:.5,y:.45,timestamp:0},{x:.5,y:.45,timestamp:40},{x:.5,y:.45,timestamp:80},{x:.53,y:.45,timestamp:120},{x:.62,y:.45,timestamp:160}];
 const velocity=game.estimateVelocity(160);assert.ok(velocity.x>.9);near(velocity.y,0);assert.ok(velocity.x<=2.4);
});

test('a cancelled opening resumes at the preview position without jumping or throwing',()=>{
 const {game}=fixture();grab(game);game.update([hand(.55,.45)],150);game.update([hand(.62,.45)],200);game.update([hand(.62,.45,.6)],220);game.tick(260);const preview=game.state.position;game.update([hand(.64,.45)],260);assert.equal(game.state.phase,'held');assert.deepEqual(game.state.position,preview);assert.equal(game.state.throws,0);
});

