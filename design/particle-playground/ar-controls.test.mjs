import test from 'node:test';
import assert from 'node:assert/strict';
import {analyseHands,formationPoint} from '../web/ar-controls.js';

function hand({x=0,y=0,pose='open'}={}){
  const landmarks=Array.from({length:21},()=>({x:.5+x,y:.6+y,z:0}));
  const values=[[0,.5,.8],[5,.42,.6],[9,.5,.58],[13,.57,.6],[17,.63,.64],
    [6,.42,.43],[10,.5,.4],[14,.57,.43],[18,.63,.48],
    [8,.42,.25],[12,.5,.2],[16,.57,.25],[20,.63,.32],[4,.3,.5]];
  for(const [index,px,py] of values)landmarks[index]={x:px+x,y:py+y,z:0};
  if(pose==='pinch')landmarks[4]={...landmarks[8],x:landmarks[8].x+.01};
  if(pose==='fist'){for(const [tip,base] of [[8,5],[12,9],[16,13],[20,17]])landmarks[tip]={x:landmarks[base].x,y:.7+y,z:0};landmarks[4]={x:.25+x,y:.7+y,z:0};}
  return {landmarks};
}

test('missing/invalid tracking resets AR input without synthetic hand actions',()=>{
  assert.equal(analyseHands([]).tracked,false);
  const broken=hand();broken.landmarks[8].x=NaN;
  assert.equal(analyseHands([broken]).count,0);
  assert.equal(analyseHands(null).gesture,'idle');
});
test('open palm disperses and pulses, index pinch gathers at contact',()=>{
  const open=analyseHands([hand()]);assert.equal(open.gesture,'open');assert.equal(open.burst,true);assert.ok(open.spread>1);
  const input=hand({pose:'pinch'}),pinch=analyseHands([input]);
  assert.equal(pinch.gesture,'pinch');assert.equal(pinch.burst,false);assert.ok(pinch.spread<1);
  assert.ok(Math.abs(pinch.center.x-(input.landmarks[4].x+input.landmarks[8].x)/2)<1e-9);
});
test('fist compresses without confusing folded tips with an open palm',()=>{
  const state=analyseHands([hand({pose:'fist'})]);assert.equal(state.gesture,'fist');assert.ok(state.spread<1);
});
test('two hands change scale with distance and survive detector reorder',()=>{
  const near=[hand({x:-.1}),hand({x:.1})],far=[hand({x:-.25}),hand({x:.25})];
  assert.ok(analyseHands(far).scale>analyseHands(near).scale);
  assert.deepEqual(analyseHands(near),analyseHands([...near].reverse()));
});
test('hand tilt rotates field, movement steers it and scale is bounded',()=>{
  const state=analyseHands([hand({x:-.2,y:-.1}),hand({x:.2,y:.1})]);
  assert.ok(Math.abs(state.rotation)>.1);assert.equal(state.gesture,'stretch');
  assert.ok(analyseHands([hand({x:.1,pose:'pinch'})]).center.x>analyseHands([hand({pose:'pinch'})]).center.x);
  assert.ok(analyseHands([hand({x:-100}),hand({x:100})]).scale<=3);
});
test('formation coordinates stay finite and shapes have different geometry',()=>{
  const shapes=['orb','galaxy','portal'];
  for(const kind of shapes)for(let i=0;i<6500;i++){
    const p=formationPoint(kind,i,6500);assert.ok(Object.values(p).every(Number.isFinite));assert.ok(Math.hypot(p.x,p.y,p.z)<1);
  }
  assert.notDeepEqual(formationPoint('orb',22,6500),formationPoint('portal',22,6500));
  assert.notDeepEqual(formationPoint('galaxy',22,6500),formationPoint('portal',22,6500));
});
