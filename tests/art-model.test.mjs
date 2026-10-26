import test from 'node:test';
import assert from 'node:assert/strict';
import {WorkbenchModel,PART_TYPES} from '../web/workbench-model.js';
import {SceneHistory,validateSceneDocument} from '../web/scene-document.js';
const near=(a,b,t=.002)=>assert.ok(Math.abs(a-b)<t,`${a} ~= ${b}`);
const empty=()=>{const m=new WorkbenchModel();for(const id of [...m.parts.keys()])m.deletePart(id);m.gravity=false;return m;};
const frames=(m,n=600)=>{for(let i=0;i<n;i++)m.step(1/120);};

test('dimension edits update collision bounds, connectors and volume-based mass',()=>{
 const m=empty(),p=m.add('block');m.editPart(p.id,{stretch:{x:2,y:.5,z:1.5},color:'#F0ABCD',finish:'chrome'});
 const body=m.assemblyFor(p.id).body,shape=body.shapes[0];near(shape.halfExtents.x,.48);near(shape.halfExtents.y,.1);near(shape.halfExtents.z,.3);near(body.mass,1.2*2*.5*1.5);near(m.connectors(p.id)[0].position.x,p.position.x+.48);assert.equal(p.color,'#f0abcd');assert.equal(p.finish,'chrome');
});

test('crystal collision vertices and column vertical extent match rendered dimensions',()=>{
 const m=empty(),crystal=m.add('crystal',{x:-1,y:.5,z:0}),column=m.add('column',{x:1,y:.5,z:0});
 m.editPart(crystal.id,{stretch:{x:1,y:2,z:1}});m.editPart(column.id,{stretch:{x:.5,y:1.5,z:2}});
 const cv=m.assemblyFor(crystal.id).body.shapes[0].vertices,yv=m.assemblyFor(column.id).body.shapes[0].vertices;
 near(Math.max(...cv.map(v=>v.y)),.6);near(Math.max(...yv.map(v=>v.y)),.4125);near(Math.max(...yv.map(v=>v.x)),.09);near(Math.max(...yv.map(v=>v.z)),.36);
 m.gravity=true;frames(m);near(crystal.position.y,m.floorY+.6,.04);assert.ok(column.position.y>m.floorY+.07);assert.ok([...m.parts.values()].every(p=>Number.isFinite(p.position.y)));
});

test('stretched ellipsoid and torus retain finite convex collisions and snap candidates',()=>{
 const m=empty(),core=m.add('core',{x:0,y:0,z:0}),ring=m.add('ring',{x:1,y:0,z:0});
 m.editPart(core.id,{stretch:{x:2,y:.5,z:1}});m.editPart(ring.id,{stretch:{x:1,y:2,z:.5}});
 const coreShape=m.assemblyFor(core.id).body.shapes[0];near(Math.max(...coreShape.vertices.map(v=>v.x)),.44);near(Math.max(...coreShape.vertices.map(v=>v.y)),.11);assert.equal(m.assemblyFor(ring.id).body.shapes.length,16);
 assert.doesNotThrow(()=>m.preview(core.id));assert.doesNotThrow(()=>m.preview(ring.id));m.gravity=true;frames(m);assert.ok(Number.isFinite(core.position.y)&&Number.isFinite(ring.position.y));
});

test('connected part shape edits require detach while materials remain editable',()=>{
 const m=empty(),a=m.add('block',{x:0,y:0,z:0}),b=m.add('block',{x:.5,y:0,z:0});assert.ok(m.release(a.id));
 const before=m.snapshot();assert.throws(()=>m.editPart(a.id,{type:'crystal'}),/Detach/);assert.deepEqual(m.snapshot(),before);
 m.editPart(a.id,{color:'#ff9944',finish:'glass'});assert.equal(m.links.length,1);m.detach(a.id);m.editPart(a.id,{type:'crystal'});assert.equal(a.type,'crystal');
});

test('invalid edits preserve part and physics state',()=>{
 const m=empty(),p=m.add('core'),before=m.snapshot();
 for(const patch of [{type:'__proto__'},{color:'url(x)'},{finish:'unrecognised'},{stretch:{x:NaN,y:1,z:1}},{stretch:{x:.1,y:1,z:1}}])assert.throws(()=>m.editPart(p.id,patch));assert.deepEqual(m.snapshot(),before);
});

test('duplicates preserve appearance, shape, orientation and scale without copying links',()=>{
 const m=empty(),p=m.add('crystal');m.editPart(p.id,{stretch:{x:1.5,y:.6,z:2},color:'#ff44aa',finish:'clay'});m.transform(p.id,{quaternion:{x:0,y:0,z:Math.sin(.2),w:Math.cos(.2)},scaleFactor:1.3});const duplicate=m.duplicatePart(p.id);
 assert.notEqual(duplicate.id,p.id);assert.deepEqual(duplicate.stretch,p.stretch);near(duplicate.scale,p.scale);near(duplicate.quaternion.z,p.quaternion.z);assert.equal(duplicate.finish,'clay');assert.equal(duplicate.color,p.color);assert.equal(m.assemblyFor(duplicate.id).partIds.length,1);for(let i=0;i<10;i++)m.add('core');assert.equal(m.parts.size,12);assert.equal(m.duplicatePart(p.id),null);
});

test('scene round-trip preserves connected poses, appearance and physics flags',()=>{
 const m=empty(),a=m.add('block',{x:0,y:0,z:0}),b=m.add('core',{x:.5,y:0,z:0});m.release(a.id);m.editPart(a.id,{color:'#ee77aa',finish:'chrome'});m.frozen=true;const document=m.snapshot(),restored=new WorkbenchModel();restored.restore(JSON.parse(JSON.stringify(document)));assert.deepEqual(restored.snapshot(),document);assert.equal(restored.assemblyFor(b.id).body.type,1);assert.equal(restored.parts.size,2);assert.equal(restored.assemblies.size,1);assert.notEqual(restored.add('column').id,b.id);
});

test('invalid scene imports reject before any live state is changed',()=>{
 const m=new WorkbenchModel(),before=m.snapshot(),clone=()=>JSON.parse(JSON.stringify(before));
 const cases=[d=>d.version=2,d=>d.parts[0].position.x=Infinity,d=>d.parts[0].quaternion.w=0,d=>d.parts[0].color='#xxzz00',d=>d.parts[0].stretch.x=4,d=>d.parts[1].id=d.parts[0].id,d=>d.parts[0].type='constructor',d=>d.links=[{a:{partId:d.parts[0].id,index:8},b:{partId:d.parts[1].id,index:0}}],d=>d.links=[{a:{partId:d.parts[0].id,index:0},b:{partId:d.parts[1].id,index:0}},{a:{partId:d.parts[0].id,index:0},b:{partId:d.parts[2].id,index:0}}],d=>d.links=[{a:{partId:d.parts[0].id,index:0},b:{partId:d.parts[1].id,index:0}},{a:{partId:d.parts[1].id,index:1},b:{partId:d.parts[0].id,index:1}}]];
 for(const mutate of cases){const d=clone();mutate(d);assert.throws(()=>m.restore(d));assert.deepEqual(m.snapshot(),before);}assert.throws(()=>validateSceneDocument(null));
});

test('scene history undoes/redoes explicit snapshots and bounds memory',()=>{
 const m=empty(),history=new SceneHistory(2),start=m.snapshot();history.checkpoint(start);const p=m.add('core'),added=m.snapshot();history.checkpoint(added);m.editPart(p.id,{finish:'chrome'});const painted=m.snapshot();assert.deepEqual(history.undo(painted),added);assert.equal(history.canRedo,true);assert.deepEqual(history.redo(added),painted);history.checkpoint(painted);m.add('ring');history.checkpoint(m.snapshot());assert.equal(history.past.length,2);assert.equal(history.canRedo,false);history.clear();assert.equal(history.canUndo,false);
});


test('numeric transform and movement reject invalid values without corrupting poses',()=>{
 const m=empty(),p=m.add('block'),before=m.snapshot();
 const cases=[{position:{x:NaN,y:0,z:0}},{position:{x:0,y:Infinity,z:0}},{quaternion:{x:0,y:0,z:NaN,w:1}},{quaternion:{x:0,y:0,z:0,w:0}},{scaleFactor:NaN},{scaleFactor:Infinity},{scaleFactor:0},{scaleFactor:-1}];
 for(const options of cases){assert.throws(()=>m.transform(p.id,options));assert.deepEqual(m.snapshot(),before);}
 assert.throws(()=>m.move(p.id,{x:NaN,y:0,z:0}));assert.throws(()=>m.setDepth(p.id,NaN));assert.deepEqual(m.snapshot(),before);
});
