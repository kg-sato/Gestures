export function hand(x=.5,y=.52,pose='open',label='Left'){
 const p=Array.from({length:21},()=>({x,y,z:0}));p[0]={x,y:y+.12};const offsets=[-.06,-.02,.025,.065];
 for(let f=0;f<4;f++){const m=5+f*4,dx=offsets[f];p[m]={x:x+dx,y:y+f*.005};p[m+1]={x:x+dx,y:y-.08};p[m+2]={x:x+dx,y:y-.14};p[m+3]={x:x+dx,y:y-.22};if(pose==='fist'||(pose==='index'&&f>0)||(pose.startsWith('scissors')&&f>1))p[m+3]={x:x+dx*.4,y:y+.025};}
 p[4]={x:x-.15,y:y+.04};if(pose==='pinch'){p[4]={x:x-.065,y:y-.19};p[8]={x:x-.055,y:y-.19};}
 if(pose.startsWith('scissors')){const gap=pose==='scissors-open'?.12:.025;p[8]={x:x-gap/2,y:y-.22};p[12]={x:x+gap/2,y:y-.22};}return{landmarks:p,handedness:label};
}
