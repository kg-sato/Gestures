/** Portable sculpture documents. This schema contains data, never executable content. */
export const FINISHES = Object.freeze(['hologram','clay','chrome','glass']);
const defaults={core:[.22,.22,.22],block:[.24,.20,.20],ring:[.305,.305,.065],module:[.28,.16,.20],crystal:[.30,.30,.30],column:[.18,.275,.18]};
const finite=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
const fail=message=>{throw new Error(message);};
const point=(value,label,min,max)=>{if(!value||!['x','y','z'].every(k=>finite(value[k],min,max)))fail(`Invalid ${label}`);return{x:value.x,y:value.y,z:value.z};};
const clone=value=>JSON.parse(JSON.stringify(value));
export function validateSceneDocument(input){
 if(!input||input.version!==1||!Array.isArray(input.parts)||input.parts.length>12||!Array.isArray(input.links))fail('Expected a version 1 Gestures scene with at most 12 parts');
 if(typeof input.gravity!=='boolean'||typeof input.frozen!=='boolean')fail('Invalid scene physics settings');
 const ids=new Set();
 const parts=input.parts.map(item=>{
  if(!item||typeof item.id!=='string'||!/^part-[1-9]\d{0,11}$/.test(item.id)||ids.has(item.id))fail('Invalid or duplicate part identity');
  ids.add(item.id);if(!Object.hasOwn(defaults,item.type))fail('Unknown shape');
  if(!finite(item.scale,.6,2))fail('Scale must be between 0.6 and 2');
  const position=point(item.position,'position',-20,20),stretch=point(item.stretch||{x:1,y:1,z:1},'dimensions',.5,2);
  const q=item.quaternion;if(!q||!['x','y','z','w'].every(k=>finite(q[k],-1,1)))fail('Invalid orientation');
  const length=Math.hypot(q.x,q.y,q.z,q.w);if(Math.abs(length-1)>.001)fail('Orientation must be normalized');
  const color=item.color??'#75e8ec',finish=item.finish??'hologram';if(typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color))fail('Invalid object colour');if(!FINISHES.includes(finish))fail('Unknown material');
  return{id:item.id,type:item.type,position,quaternion:{x:q.x/length,y:q.y/length,z:q.z/length,w:q.w/length},scale:item.scale,stretch,color:color.toLowerCase(),finish};
 });
 const byId=new Map(parts.map(p=>[p.id,p])),occupied=new Set(),parents=new Map(parts.map(p=>[p.id,p.id]));
 const root=id=>{while(parents.get(id)!==id)id=parents.get(id);return id;};
 if(input.links.length>Math.max(0,parts.length-1))fail('Assemblies cannot contain cycles');
 const links=input.links.map(link=>{
  const endpoints=['a','b'].map(key=>{const p=link?.[key],part=byId.get(p?.partId);if(!part||!Number.isInteger(p.index)||p.index<0||p.index>=(part.type==='ring'?2:6))fail('Invalid connector');const port=`${p.partId}:${p.index}`;if(occupied.has(port))fail('A connector can only be used once');occupied.add(port);return{partId:p.partId,index:p.index};});
  const [a,b]=endpoints,ra=root(a.partId),rb=root(b.partId);if(ra===rb)fail('Assemblies cannot contain cycles');parents.set(ra,rb);return{a,b};
 });
 return{version:1,parts,links,gravity:input.gravity,frozen:input.frozen};
}

/** Keep explicit edits in history; physics frames do not create undo entries. */
export class SceneHistory{
 constructor(limit=40){this.limit=Math.max(1,Math.floor(limit));this.past=[];this.future=[];}
 get canUndo(){return this.past.length>0;} get canRedo(){return this.future.length>0;}
 checkpoint(document){const snapshot=clone(document);if(JSON.stringify(this.past.at(-1))!==JSON.stringify(snapshot)){this.past.push(snapshot);if(this.past.length>this.limit)this.past.shift();}this.future=[];}
 undo(current){if(!this.canUndo)return null;this.future.push(clone(current));return clone(this.past.pop());}
 redo(current){if(!this.canRedo)return null;this.past.push(clone(current));return clone(this.future.pop());}
 clear(){this.past=[];this.future=[];}
}
