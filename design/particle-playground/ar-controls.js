/** Geometry-only inputs for the AR toy. No finger-direction/y-axis assumptions. */
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const distance=(a,b,aspect)=>Math.hypot((a.x-b.x)*aspect,a.y-b.y);
const valid=hand=>Array.isArray(hand?.landmarks)&&hand.landmarks.length===21&&hand.landmarks.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
const mean=points=>({x:points.reduce((sum,p)=>sum+p.x,0)/points.length,y:points.reduce((sum,p)=>sum+p.y,0)/points.length});

export function analyseHands(input,aspect=16/9){
  const hands=(Array.isArray(input)?input:[]).filter(valid).slice(0,2).map(hand=>{
    const p=hand.landmarks;
    const palm=Math.max(.035,(distance(p[5],p[17],aspect)+distance(p[0],p[9],aspect))/2);
    const pinch=distance(p[4],p[8],aspect)/palm<.32;
    const extended=[[8,6],[12,10],[16,14],[20,18]].filter(([tip,joint])=>distance(p[tip],p[0],aspect)>distance(p[joint],p[0],aspect)*1.18).length;
    return {center:mean([p[0],p[5],p[9],p[13],p[17]]),pinch,
      point:mean([p[4],p[8]]),open:!pinch&&extended>=3,fist:!pinch&&extended<=1,palm};
  });
  if(!hands.length)return {tracked:false,count:0,center:{x:.5,y:.5},scale:1,spread:1,rotation:0,gesture:'idle',burst:false};
  const points=hands.map(hand=>hand.pinch?hand.point:hand.center);
  const center=mean(points);
  let scale=clamp(hands[0].palm*3.5,.55,1.7),rotation=0,gesture='hold';
  if(hands.length===2){
    points.sort((a,b)=>a.x-b.x);
    scale=clamp(distance(points[0],points[1],aspect)*1.8,.35,3);
    rotation=-Math.atan2(points[1].y-points[0].y,(points[1].x-points[0].x)*aspect);
    gesture='stretch';
  }else if(hands[0].pinch)gesture='pinch';
  else if(hands[0].open)gesture='open';
  else if(hands[0].fist)gesture='fist';
  const spread=gesture==='pinch'?.48:gesture==='open'?1.9:gesture==='fist'?.7:1;
  return {tracked:true,count:hands.length,center,scale,spread,rotation,gesture,burst:hands.some(hand=>hand.open)};
}

/** Deterministic formations make switching effects a smooth morph, not a reset. */
export function formationPoint(kind,index,total,time=0){
  const fraction=(index+.5)/total;
  const angle=index*2.399963229728653;
  if(kind==='galaxy'){
    const radius=Math.sqrt(fraction)*.62;
    const theta=angle+radius*6;
    return {x:Math.cos(theta)*radius,y:Math.sin(theta)*radius,z:Math.sin(index*7.31)*.045*(1-fraction)};
  }
  if(kind==='portal'){
    const theta=fraction*Math.PI*2*13;
    const minor=.04+.045*Math.sin(index*3.17);
    return {x:Math.cos(theta)*(.47+minor*Math.cos(angle)),y:Math.sin(theta)*(.47+minor*Math.cos(angle)),z:minor*Math.sin(angle)};
  }
  const y=1-2*fraction,radius=Math.sqrt(Math.max(0,1-y*y));
  const shell=.24+.045*Math.sin(index*2.31);
  return {x:Math.cos(angle)*radius*shell,y:y*shell,z:Math.sin(angle)*radius*shell};
}
