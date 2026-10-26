/** Pure, deterministic torus surface data; no renderer or detector state lives here. */
export const DEFAULT_DONUT = Object.freeze({radius:1,tube:.28,twist:0,ripple:0,detail:'medium'});
const DETAIL = Object.freeze({low:[72,28],medium:[112,40],high:[160,56]});
const TAU = Math.PI*2;
const clamp = (value,min,max)=>Math.max(min,Math.min(max,value));

/** Keep a positive hole and a bounded, continuous deformation surface. */
export function sanitizeDonut(input={}) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Expected donut settings');
  const number=key=>{
    const value=Object.hasOwn(input,key)?input[key]:DEFAULT_DONUT[key];
    if(typeof value!=='number'||!Number.isFinite(value))throw new Error(`Donut ${key} must be a finite number`);
    return value;
  };
  const radius=clamp(number('radius'),.6,1.55);
  const detail=Object.hasOwn(input,'detail')?input.detail:DEFAULT_DONUT.detail;
  if(!Object.hasOwn(DETAIL,detail))throw new Error('Donut detail must be low, medium or high');
  return {
    radius,
    tube:clamp(number('tube'),.10,Math.min(.6,.6*radius)),
    twist:clamp(number('twist'),-Math.PI,Math.PI),
    ripple:clamp(number('ripple'),0,1),
    detail,
  };
}

function surface(u,v,settings) {
  const {radius,tube,twist,ripple}=settings;
  const section=v+twist*Math.sin(u);
  const centerRadius=radius*(1+.12*ripple*Math.cos(3*u));
  const radial=centerRadius+tube*Math.cos(section)*(1+.1*ripple*Math.cos(5*u));
  return {
    x:radial*Math.cos(u),
    y:radial*Math.sin(u),
    z:.72*tube*Math.sin(section)+.18*ripple*Math.sin(3*u),
  };
}

/** u travels around the ring; v travels around its oval tube, both in radians. */
export function evaluateDonutPoint(u,v,settings={}) {
  if(!Number.isFinite(u)||!Number.isFinite(v))throw new Error('Donut surface angles must be finite numbers');
  return surface(u,v,sanitizeDonut(settings));
}

function fillPositions(settings,positions,tubularSegments,radialSegments) {
  const {radius,tube,twist,ripple}=settings,stride=tubularSegments+1;
  // Ring-column order reuses trigonometry and creates no temporary vertex objects.
  for(let i=0;i<=tubularSegments;i++) {
    const u=i===tubularSegments?0:i/tubularSegments*TAU;
    const cosU=Math.cos(u),sinU=Math.sin(u),shift=twist*sinU;
    const centerRadius=radius*(1+.12*ripple*Math.cos(3*u));
    const tubeProfile=1+.1*ripple*Math.cos(5*u),centerZ=.18*ripple*Math.sin(3*u);
    for(let j=0;j<=radialSegments;j++) {
      const v=j===radialSegments?0:j/radialSegments*TAU;
      const section=v+shift,radial=centerRadius+tube*Math.cos(section)*tubeProfile;
      const offset=(j*stride+i)*3;
      positions[offset]=radial*cosU;
      positions[offset+1]=radial*sinU;
      positions[offset+2]=.72*tube*Math.sin(section)+centerZ;
    }
  }
  return positions;
}

/** Refill an existing geometry attribute without allocating index, UV or position arrays. */
export function updateDonutPositions(input,positions) {
  const settings=sanitizeDonut(input),[tubularSegments,radialSegments]=DETAIL[settings.detail];
  const required=(tubularSegments+1)*(radialSegments+1)*3;
  if(!(positions instanceof Float32Array)||positions.length!==required)throw new Error(`Donut position buffer must be a Float32Array of length ${required} for ${settings.detail} detail`);
  return fillPositions(settings,positions,tubularSegments,radialSegments);
}

/**
 * UV seam vertices are deliberately duplicated, as in Three.TorusGeometry.
 * The ending row/column evaluate exactly at zero so positions coincide exactly.
 * Winding faces outwards; normals can be recomputed and averaged across seams.
 */
export function generateDonut(input={}) {
  const settings=sanitizeDonut(input);
  const [tubularSegments,radialSegments]=DETAIL[settings.detail];
  const vertexCount=(tubularSegments+1)*(radialSegments+1);
  const triangleCount=2*tubularSegments*radialSegments;
  const positions=new Float32Array(vertexCount*3),uvs=new Float32Array(vertexCount*2),indices=new Uint32Array(triangleCount*3);
  fillPositions(settings,positions,tubularSegments,radialSegments);
  let vertex=0;
  for(let j=0;j<=radialSegments;j++)for(let i=0;i<=tubularSegments;i++) {
    uvs.set([i/tubularSegments,j/radialSegments],vertex*2);
    vertex++;
  }
  let index=0;
  const stride=tubularSegments+1;
  for(let j=1;j<=radialSegments;j++)for(let i=1;i<=tubularSegments;i++) {
    const a=stride*j+i-1,b=stride*(j-1)+i-1,c=stride*(j-1)+i,d=stride*j+i;
    indices.set([a,b,d,b,c,d],index);index+=6;
  }
  return {positions,uvs,indices,radialSegments,tubularSegments,vertexCount,triangleCount};
}
