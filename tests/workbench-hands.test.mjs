import test from 'node:test';
import assert from 'node:assert/strict';
import {HandTracker} from '../web/workbench-hands.js';

function hand(x=.3,ratio=.2){
  const landmarks=Array.from({length:21},()=>({x,y:.5,z:0}));
  landmarks[0]={x,y:.6};landmarks[9]={x,y:.4};
  landmarks[5]={x:x-.1,y:.5};landmarks[17]={x:x+.1,y:.5};
  landmarks[4]={x:x-ratio*.1,y:.3};landmarks[8]={x:x+ratio*.1,y:.3};
  return {landmarks};
}
test('requires 80 ms then emits movement, hysteresis and deliberate release',()=>{
  const tracker=new HandTracker({aspect:1});
  assert.deepEqual(tracker.update([hand()],0),[]);
  assert.deepEqual(tracker.update([hand()],79),[]);
  const [start]=tracker.update([hand()],80);assert.equal(start.type,'start');
  assert.equal(tracker.update([hand(.3,.37)],100)[0].type,'move');
  assert.equal(tracker.update([hand(.3,.44)],120)[0].type,'move');
  const [end]=tracker.update([hand(.3,.45)],130);assert.equal(end.type,'end');assert.equal(end.throwAllowed,true);
  assert.deepEqual(tracker.update([hand(.3,.35)],140),[]);
});
test('detector reordering preserves both hand identities',()=>{
  const tracker=new HandTracker({aspect:1});
  tracker.update([hand(.2),hand(.8)],0);
  const starts=tracker.update([hand(.2),hand(.8)],80);
  const moved=tracker.update([hand(.78),hand(.22)],100);
  assert.equal(moved[0].id,starts[1].id);assert.equal(moved[1].id,starts[0].id);
});
test('brief loss holds, continued loss releases without throwing',()=>{
  const tracker=new HandTracker({aspect:1});tracker.update([hand()],0);tracker.update([hand()],80);
  assert.deepEqual(tracker.update([],100),[]);assert.equal(tracker.active.length,1);
  assert.deepEqual(tracker.tick(229),[]);
  const [end]=tracker.tick(230);assert.equal(end.type,'end');assert.equal(end.throwAllowed,false);assert.equal(tracker.active.length,0);
});
test('returning hand within grace resumes identity; reset cannot throw',()=>{
  const tracker=new HandTracker({aspect:1});tracker.update([hand()],0);const [start]=tracker.update([hand()],80);
  tracker.update([],100);assert.equal(tracker.update([hand(.31)],200)[0].id,start.id);
  const [end]=tracker.reset(210);assert.equal(end.id,start.id);assert.equal(end.throwAllowed,false);assert.equal(tracker.tracks.size,0);
});
test('interrupted acquisition restarts stability interval and malformed inputs are ignored',()=>{
  const tracker=new HandTracker({aspect:1});tracker.update([hand()],0);tracker.update([],50);
  assert.deepEqual(tracker.update([hand()],100),[]);
  assert.deepEqual(tracker.update([hand()],179),[]);
  assert.equal(tracker.update([hand()],180)[0].type,'start');
  assert.deepEqual(tracker.update([{landmarks:[]}],200),[]);
});
