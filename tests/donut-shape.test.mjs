import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_DONUT,sanitizeDonut,generateDonut,evaluateDonutPoint,updateDonutPositions} from '../web/donut-shape.js';
const point=(buffer,index)=>Array.from(buffer.subarray(index*3,index*3+3));
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const vec=p=>[p.x,p.y,p.z];

test('default donut and detail levels produce the expected finite indexed mesh',()=>{
  assert.deepEqual(sanitizeDonut(),DEFAULT_DONUT);
  for(const [detail,[t,r]] of Object.entries({low:[72,28],medium:[112,40],high:[160,56]})) {
    const mesh=generateDonut({detail});
    assert.equal(mesh.tubularSegments,t);assert.equal(mesh.radialSegments,r);
    assert.equal(mesh.vertexCount,(t+1)*(r+1));assert.equal(mesh.triangleCount,2*t*r);
    assert.ok(mesh.positions instanceof Float32Array);assert.ok(mesh.uvs instanceof Float32Array);assert.ok(mesh.indices instanceof Uint32Array);
    assert.equal(mesh.positions.length,mesh.vertexCount*3);assert.equal(mesh.indices.length,mesh.triangleCount*3);
    assert.ok(mesh.positions.every(Number.isFinite));assert.ok(mesh.indices.every(i=>i<mesh.vertexCount));
  }
});

test('both UV seams close exactly even at maximum twist and ripple',()=>{
  const mesh=generateDonut({radius:.6,tube:.36,twist:Math.PI,ripple:1,detail:'high'}),stride=mesh.tubularSegments+1;
  for(let row=0;row<=mesh.radialSegments;row++)assert.deepEqual(point(mesh.positions,row*stride),point(mesh.positions,row*stride+mesh.tubularSegments));
  for(let col=0;col<=mesh.tubularSegments;col++)assert.deepEqual(point(mesh.positions,col),point(mesh.positions,mesh.radialSegments*stride+col));
  assert.deepEqual(Array.from(mesh.uvs.subarray(0,2)),[0,0]);assert.deepEqual(Array.from(mesh.uvs.subarray(-2)),[1,1]);
});

test('gesture parameters change actual vertex positions deterministically',()=>{
  const base=generateDonut();
  for(const patch of [{radius:1.4},{tube:.45},{twist:1},{ripple:.8}]) {
    const altered=generateDonut(patch);
    assert.notDeepEqual(altered.positions,base.positions);
    assert.deepEqual(altered.positions,generateDonut(patch).positions);
    assert.deepEqual(altered.indices,base.indices);
  }
});

test('triangles face outwards on the base and deformed surface',()=>{
  for(const settings of [{},{twist:2.3,ripple:.9,radius:.6,tube:.35}]) {
    const mesh=generateDonut({...settings,detail:'low'}),stride=mesh.tubularSegments+1;
    for(let offset=0;offset<mesh.indices.length;offset+=6) {
      const indices=Array.from(mesh.indices.subarray(offset,offset+3));
      const [a,b,d]=indices.map(i=>point(mesh.positions,i));
      const col=(indices[1]%stride)+.5,row=Math.floor(indices[1]/stride)+.5;
      const u=col/mesh.tubularSegments*Math.PI*2,v=row/mesh.radialSegments*Math.PI*2,e=1e-4;
      const du=sub(vec(evaluateDonutPoint(u+e,v,settings)),vec(evaluateDonutPoint(u-e,v,settings)));
      const dv=sub(vec(evaluateDonutPoint(u,v+e,settings)),vec(evaluateDonutPoint(u,v-e,settings)));
      assert.ok(dot(cross(sub(b,a),sub(d,a)),cross(du,dv))>0,'Triangle must match outward parameter-space winding');
    }
  }
});

test('settings clamp usable ranges and reject invalid numeric data',()=>{
  assert.deepEqual(sanitizeDonut({radius:99,tube:99,twist:99,ripple:99,detail:'low'}),{radius:1.55,tube:.6,twist:Math.PI,ripple:1,detail:'low'});
  const low=sanitizeDonut({radius:-10,tube:4,twist:-99,ripple:-99});assert.equal(low.radius,.6);assert.equal(low.tube,.36);assert.equal(low.twist,-Math.PI);assert.equal(low.ripple,0);
  for(const key of ['radius','tube','twist','ripple'])for(const value of [NaN,Infinity,-Infinity,null,'1',undefined])assert.throws(()=>sanitizeDonut({[key]:value}),new RegExp(key));
  assert.throws(()=>sanitizeDonut({detail:'ultra'}),/detail/);assert.throws(()=>sanitizeDonut(null),/settings/);
  assert.throws(()=>evaluateDonutPoint(NaN,0),/angles/);
});

test('the hole stays open and surfaces remain finite at all deformation limits',()=>{
  for(const radius of [.6,1,1.55])for(const tube of [.1,99])for(const twist of [-Math.PI,0,Math.PI])for(const ripple of [0,1]) {
    const mesh=generateDonut({radius,tube,twist,ripple,detail:'low'});
    let minRadius=Infinity;
    for(let i=0;i<mesh.positions.length;i+=3){minRadius=Math.min(minRadius,Math.hypot(mesh.positions[i],mesh.positions[i+1]));assert.ok(Number.isFinite(mesh.positions[i+2]));}
    assert.ok(minRadius>.12,'Deformation must retain a visible positive hole');
  }
});

test('seam welding leaves a closed genus-one triangle topology at every detail',()=>{
  for(const detail of ['low','medium','high']) {
    const mesh=generateDonut({detail}),stride=mesh.tubularSegments+1,edges=new Map();
    const weld=index=>(Math.floor(index/stride)%mesh.radialSegments)*mesh.tubularSegments+(index%stride)%mesh.tubularSegments;
    for(let i=0;i<mesh.indices.length;i+=3){const triangle=Array.from(mesh.indices.subarray(i,i+3),weld);assert.equal(new Set(triangle).size,3);for(let j=0;j<3;j++){const a=triangle[j],b=triangle[(j+1)%3],key=a<b?a+':'+b:b+':'+a;edges.set(key,(edges.get(key)||0)+1);}}
    assert.ok([...edges.values()].every(count=>count===2),'Every welded edge belongs to two triangles');
    const vertices=mesh.radialSegments*mesh.tubularSegments;
    assert.equal(vertices-edges.size+mesh.triangleCount,0,'Torus Euler characteristic remains zero');
  }
});


test('per-frame deformation refills the existing position buffer and validates before writing',()=>{
  for(const detail of ['low','medium','high']) {
    const mesh=generateDonut({detail}),positions=mesh.positions,indices=mesh.indices,uvs=mesh.uvs;
    const settings={radius:1.3,tube:.4,twist:-1.2,ripple:.8,detail};
    assert.equal(updateDonutPositions(settings,positions),positions);
    assert.deepEqual(positions,generateDonut(settings).positions);
    assert.equal(mesh.indices,indices);assert.equal(mesh.uvs,uvs);
    const before=positions.slice();
    assert.throws(()=>updateDonutPositions({...settings,twist:NaN},positions),/twist/);
    assert.deepEqual(positions,before);
    assert.throws(()=>updateDonutPositions(settings,new Float32Array(positions.length-3)),/position buffer/);
    assert.throws(()=>updateDonutPositions(settings,new Float64Array(positions.length)),/Float32Array/);
  }
});
