/** Curated, editable compositions. All geometry is generated in this project. */
export function createPreset(name='orbit') {
  const part=(id,type,position,scale,color,finish='clay',stretch={x:1,y:1,z:1},quaternion={x:0,y:0,z:0,w:1})=>({id:'part-'+id,type,position,scale,color,finish,stretch,quaternion});
  const tilt=angle=>({x:0,y:0,z:Math.sin(angle/2),w:Math.cos(angle/2)});
  const palettes={orbit:['#a5e3ca','#ed9b86','#ddd5c5','#9caae2'],bloom:['#e991b5','#b7a0e8','#f5bc79','#a8d8c7'],balance:['#e3b37e','#adcbbc','#ded9c8','#a4b7db']};
  const c=palettes[name]||palettes.orbit;
  let parts;
  if(name==='bloom')parts=[part(1,'core',{x:0,y:.15,z:0},1.8,c[2],'chrome'),...Array.from({length:5},(_,i)=>{const a=i*Math.PI*2/5;return part(i+2,'crystal',{x:Math.sin(a)*.78,y:.15+Math.cos(a)*.78,z:0},1.4,c[i%4],'clay',{x:.65,y:1.65,z:.8},tilt(-a));}),part(7,'ring',{x:0,y:.15,z:-.25},2,c[3],'chrome',{x:1.7,y:1.7,z:1})];
  else if(name==='balance')parts=[part(1,'block',{x:-.65,y:-.65,z:0},1.8,c[0],'clay',{x:1.5,y:.6,z:1}),part(2,'column',{x:-.65,y:-.05,z:0},1.6,c[1],'clay',{x:1.4,y:1.2,z:1.4}),part(3,'core',{x:-.65,y:.78,z:0},1.8,c[2],'chrome'),part(4,'ring',{x:.65,y:.18,z:0},2,c[3],'clay',{x:1.7,y:1.7,z:1},tilt(.3)),part(5,'crystal',{x:.65,y:.18,z:0},1.3,c[0],'glass'),part(6,'block',{x:.65,y:-.65,z:0},1.4,c[2],'clay',{x:1.5,y:.5,z:1})];
  else parts=[part(1,'ring',{x:-.25,y:.25,z:0},2,c[0],'chrome',{x:1.8,y:1.8,z:1.1},tilt(-.35)),part(2,'core',{x:-.25,y:.25,z:.1},1.7,c[1],'clay'),part(3,'crystal',{x:.95,y:.02,z:.15},1.8,c[2],'clay',{x:.75,y:1.75,z:.8},tilt(-.3)),part(4,'column',{x:-1.15,y:-.6,z:.1},1.8,c[3],'clay',{x:1.7,y:.75,z:1.7}),part(5,'core',{x:-1.15,y:.02,z:.1},1,c[2],'chrome'),part(6,'block',{x:.9,y:-.9,z:.05},1.3,c[1],'clay',{x:1.8,y:.5,z:1.4})];
  return {version:1,parts,links:[],gravity:false,frozen:true};
}
