import * as THREE from './vendor/three/three.module.js';
import {BrowserCamera} from './webcam-source.js';
import {HandTracker} from './workbench-hands.js';
import {ARScene} from './ar-scene.js';
import {StudioEditor} from './studio-editor.js';
import {createPreset} from './art-presets.js';
const $=id=>document.getElementById(id),cameraCanvas=$('camera'),context=cameraCanvas.getContext('2d');
const field=new ARScene($('fx')),tracker=new HandTracker();
const metrics={inferenceMs:0,resultAgeMs:0,renderMs:0,frames:0,inferences:0,inferenceTotal:0,ageTotal:0};
let connected=false,connecting=false,ready=false,latest=null,pending=null,worker=null;
let trackerLabel='Loading tracker';
let generation=0,frameId=0,aspect=16/9,fps=0,lastCameraAt=0,handCount=0,lastTime=performance.now(),noticeTimer;
const active=()=>!document.hidden&&document.hasFocus();
const editor=new StudioEditor(field,{onChange:()=>syncInputs(),onMessage:message});
field.model.restore(createPreset('orbit'));field.sync();
if(matchMedia('(max-width:800px)').matches)$('inspector').open=false;
function message(text){$('notice').textContent=text;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').textContent='',4500);}
function resetInput(){generation++;handCount=0;field.events(tracker.reset(performance.now()));field.cancel();editor.cancelTransform();}
function status(text){$('status').title=`Camera ${Math.round(fps)} FPS; render CPU ${metrics.renderMs.toFixed(1)} ms; inference ${metrics.inferences?(metrics.inferenceTotal/metrics.inferences).toFixed(1):0} ms mean; result age ${metrics.inferences?(metrics.ageTotal/metrics.inferences).toFixed(1):0} ms mean; samples ${metrics.inferences}`;$('status').textContent=text||(!connected?'Camera off':!ready?trackerLabel:handCount+' HAND'+(handCount===1?'':'S')+' · '+Math.round(fps)+' FPS');}
function fit(width,height){aspect=width/height;tracker.aspect=aspect;cameraCanvas.width=width;cameraCanvas.height=height;document.documentElement.style.setProperty('--aspect',String(aspect));field.resize();resetInput();}
function paintCamera(){context.clearRect(0,0,cameraCanvas.width,cameraCanvas.height);if(!latest)return;context.save();if($('mirror').checked){context.translate(cameraCanvas.width,0);context.scale(-1,1);}context.drawImage(latest,0,0,cameraCanvas.width,cameraCanvas.height);context.restore();}
async function submit(bitmap,timestamp){if(!ready||pending||!active())return;const currentGeneration=generation,copy=await createImageBitmap(bitmap);if(!connected||!active()||generation!==currentGeneration||pending){copy.close();return;}pending={frame:++frameId,generation};worker.postMessage({type:'frame',bitmap:copy,timestamp,id:pending},[copy]);}
function initializeTracker(){if(worker)return;worker=new Worker('./tracker-worker.js',{type:'module'});worker.onmessage=({data})=>{
 if(data.type==='ready'){ready=true;status();return;}if(data.type==='error'){ready=false;trackerLabel=data.message;resetInput();status(data.message);return;}
 if(data.type!=='result'&&data.type!=='frame-error')return;if(!pending||pending.frame!==data.id.frame||pending.generation!==data.id.generation)return;pending=null;
 if(data.type==='frame-error'){resetInput();status('Tracking error');return;}if(data.id.generation!==generation||!connected||!active())return;const now=performance.now();if(now-data.timestamp>700){resetInput();return;}
 const hands=data.hands.map(hand=>({...hand,landmarks:hand.landmarks.map(p=>({...p,x:$('mirror').checked?1-p.x:p.x}))}));const events=tracker.update(hands,now);field.setTrackingComplete(tracker.active.every(t=>t.lastSeen===now));field.events(events);handCount=tracker.count;metrics.inferenceMs=data.inferenceMs;metrics.resultAgeMs=now-data.timestamp;metrics.inferences++;metrics.inferenceTotal+=data.inferenceMs;metrics.ageTotal+=now-data.timestamp;status();
 };worker.onerror=()=>{ready=false;pending=null;resetInput();status('Tracker failed. Reload to retry.');};worker.postMessage({type:'init'});}
const camera=new BrowserCamera({onFrame:async(bitmap,timestamp)=>{if(!connected){bitmap.close();return;}if(lastCameraAt){const current=1000/(timestamp-lastCameraAt);fps=fps?fps*.85+current*.15:current;}lastCameraAt=timestamp;latest?.close();latest=bitmap;paintCamera();await submit(bitmap,timestamp);},onEnded:()=>{disconnect();status('Camera disconnected');},onError:error=>{resetInput();status('Camera error: '+error.message);}});
async function devices(){try{const list=(await navigator.mediaDevices?.enumerateDevices()||[]).filter(d=>d.kind==='videoinput'),selected=$('device').value;$('device').replaceChildren(new Option('Default camera',''));list.forEach((d,i)=>$('device').add(new Option(d.label||'Camera '+(i+1),d.deviceId)));const preferred=list.find(d=>d.deviceId===selected)||list.find(d=>/Brio|Logitech/i.test(d.label));if(preferred)$('device').value=preferred.deviceId;}catch{status('Camera list unavailable');}}
function disconnect(){camera.stop();connected=false;connecting=false;resetInput();latest?.close();latest=null;paintCamera();$('connect').textContent='Connect camera';fps=0;lastCameraAt=0;status();}
function view(cameraMode){if(!cameraMode)disconnect();resetInput();document.body.classList.toggle('camera-mode',cameraMode);document.body.classList.toggle('studio-mode',!cameraMode);$('studio').classList.toggle('active',!cameraMode);$('studio').setAttribute('aria-pressed',String(!cameraMode));$('camera-view').classList.toggle('active',cameraMode);$('camera-view').setAttribute('aria-pressed',String(cameraMode));document.querySelector('.camera-inputs').hidden=!cameraMode;document.querySelector('.camera-depth').hidden=!cameraMode;editor.setCameraMode(cameraMode);$('turntable').checked=false;syncInputs();}
$('studio').onclick=()=>view(false);$('camera-view').onclick=()=>{view(true);devices();};
$('connect').onclick=async()=>{if(connected||connecting){disconnect();return;}connecting=true;$('connect').textContent='Cancel';status('Requesting camera…');initializeTracker();try{const info=await camera.start($('device').value);if(!info)return;connected=true;connecting=false;fit(info.width,info.height);$('connect').textContent='Disconnect';await devices();status();}catch(error){disconnect();status(error.name==='NotAllowedError'?'Camera permission denied':error.message);}};
$('device').onchange=()=>{if(connected)disconnect();};$('mirror').onchange=()=>{resetInput();paintCamera();};
$('preset').onchange=()=>{resetInput();editor.preset($('preset').value);};$('home').onclick=()=>{editor.home();$('turntable').checked=false;editor.orbit.autoRotate=false;};
$('turntable').onchange=()=>{editor.orbit.autoRotate=$('turntable').checked&&!field.cameraMode;};
for(const button of document.querySelectorAll('[data-tool]'))button.onclick=()=>{editor.setMode(button.dataset.tool);};
$('selection').onchange=()=>{resetInput();field.selected=$('selection').value||null;syncInputs();};
$('add').onclick=()=>editor.change(()=>{field.add($('object').value);field.model.editPart(field.selected,{color:'#b6d8c6',finish:'clay'});});
$('duplicate').onclick=()=>editor.duplicate();$('detach').onclick=()=>editor.change(()=>field.detach());$('delete').onclick=()=>editor.change(()=>field.delete());
$('shape').onchange=()=>editor.editSelected({type:$('shape').value});$('finish').onchange=()=>editor.editSelected({finish:$('finish').value});
function continuous(input,action){input.oninput=()=>{input.beforeEdit??=field.model.snapshot();try{field.cancel();action();field.sync();syncInputs();}catch(error){message(error.message);}};input.onchange=()=>{if(input.beforeEdit){editor.history.checkpoint(input.beforeEdit);input.beforeEdit=null;}syncInputs();};}
continuous($('color'),()=>field.model.editPart(field.selected,{color:$('color').value}));continuous($('scale'),()=>{const part=field.model.parts.get(field.selected);field.model.transform(part.id,{scaleFactor:Number($('scale').value)/part.scale});});
const axes=['x','y','z'];
function values(prefix){return axes.map(axis=>Number($(prefix+'-'+axis).value));}
for(const axis of axes){$('stretch-'+axis).onchange=()=>editor.editSelected({stretch:Object.fromEntries(axes.map(a=>[a,Number($('stretch-'+a).value)]))});$('pos-'+axis).onchange=()=>editor.setTransform({position:Object.fromEntries(axes.map(a=>[a,Number($('pos-'+a).value)]))});$('rot-'+axis).onchange=()=>editor.setTransform({rotation:values('rot')});}
$('gravity').onchange=()=>{const enabled=$('gravity').checked;editor.change(()=>field.model.gravity=enabled);};$('grid').onchange=()=>field.grid.visible=$('grid').checked;
$('pause').onclick=()=>{resetInput();editor.change(()=>field.model.frozen=!field.model.frozen);};continuous($('depth'),()=>field.setDepth(Number($('depth').value)));
$('reset').onclick=()=>{resetInput();editor.preset($('preset').value);};$('undo').onclick=()=>{resetInput();editor.undo();};$('redo').onclick=()=>{resetInput();editor.redo();};
let listKey='';
function syncInputs(){
 const parts=[...field.model.parts.values()],part=field.model.parts.get(field.selected),key=parts.map(p=>p.id+':'+p.type).join('|');
 if(key!==listKey){listKey=key;$('selection').replaceChildren(new Option('Select an object',''),...parts.map((p,i)=>new Option((i+1).toString().padStart(2,'0')+' / '+({core:'Sphere',block:'Box',ring:'Torus',module:'Step',column:'Column',crystal:'Crystal'}[p.type]),p.id)));}
 $('selection').value=part?.id||'';$('properties').disabled=!part;for(const id of ['duplicate','delete','detach','depth'])$(id).disabled=!part;$('duplicate').disabled=!part||parts.length>=12;$('add').disabled=parts.length>=12;$('part-count').value=parts.length+' / 12';$('undo').disabled=!editor.history.canUndo;$('redo').disabled=!editor.history.canRedo;
 $('turntable').checked=editor.orbit.autoRotate;$('gravity').checked=field.model.gravity;$('pause').textContent=field.model.frozen?'▶ Play physics':'Ⅱ Pause physics';$('pause').setAttribute('aria-pressed',String(field.model.frozen));
 document.querySelectorAll('[data-tool]').forEach(b=>{const selected=b.dataset.tool===editor.mode;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});
 const set=(id,value)=>{if(document.activeElement!==$(id))$(id).value=value;};
 if(part){set('shape',part.type);set('color',part.color);set('finish',part.finish);set('scale',part.scale);$('scale-value').value=part.scale.toFixed(2);const a=field.model.assemblyFor(part.id),rotation=new THREE.Euler().setFromQuaternion(new THREE.Quaternion(part.quaternion.x,part.quaternion.y,part.quaternion.z,part.quaternion.w));for(const axis of axes){set('stretch-'+axis,part.stretch[axis].toFixed(2));set('pos-'+axis,a.body.position[axis].toFixed(2));set('rot-'+axis,THREE.MathUtils.radToDeg(rotation[axis]).toFixed(1));}set('depth',a.body.position.z);}
}
function download(data,name,type){const url=URL.createObjectURL(data instanceof Blob?data:new Blob([data],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
$('tutorial').onclick=()=>$('guide').showModal();$('close-guide').onclick=()=>$('guide').close();$('export').onclick=()=>$('export-guide').showModal();$('close-export').onclick=()=>$('export-guide').close();
$('save-scene').onclick=()=>download(JSON.stringify(field.model.snapshot(),null,2),'gestures-sculpture.json','application/json');
$('load-scene').onclick=()=>$('scene-file').click();$('scene-file').onchange=async()=>{const file=$('scene-file').files[0];if(!file)return;try{if(file.size>1024*1024)throw Error('Choose a scene smaller than 1 MB.');const scene=JSON.parse(await file.text());if(editor.restore(scene))$('export-guide').close();}catch(error){message('Cannot open scene: '+error.message);}$('scene-file').value='';};
$('save-glb').onclick=async()=>{const button=$('save-glb');button.disabled=true;try{download(await editor.exportGLB(),'gestures-sculpture.glb','model/gltf-binary');}catch(error){message('Cannot export model: '+error.message);}finally{button.disabled=false;}};
$('save-image').onclick=()=>{const selected=field.selected;field.selected=null;editor.presentation=true;field.render(0);const canvas=document.createElement('canvas');canvas.width=$('fx').width;canvas.height=$('fx').height;const ctx=canvas.getContext('2d');const gradient=ctx.createRadialGradient(canvas.width*.4,canvas.height*.4,0,canvas.width*.4,canvas.height*.4,canvas.width);gradient.addColorStop(0,'#263735');gradient.addColorStop(1,'#101619');ctx.fillStyle=gradient;ctx.fillRect(0,0,canvas.width,canvas.height);if(connected)ctx.drawImage(cameraCanvas,0,0,canvas.width,canvas.height);ctx.drawImage($('fx'),0,0);field.selected=selected;editor.presentation=false;field.render(0);canvas.toBlob(blob=>{if(blob)download(blob,'gestures-artwork.png','image/png');});};
$('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen().catch(()=>message('Fullscreen unavailable'));};
window.addEventListener('resize',()=>field.resize());window.addEventListener('blur',resetInput);document.addEventListener('visibilitychange',resetInput);
window.addEventListener('beforeunload',()=>{camera.stop();worker?.terminate();latest?.close();field.dispose();});
document.addEventListener('keydown',event=>{if(document.querySelector('dialog[open]')||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;const key=event.key.toLowerCase();if((event.ctrlKey||event.metaKey)&&key==='z'){event.preventDefault();event.shiftKey?$('redo').click():$('undo').click();}else if((event.ctrlKey||event.metaKey)&&key==='y'){event.preventDefault();$('redo').click();}else if(event.code==='Space'){event.preventDefault();$('pause').click();}else if(key==='delete'||key==='backspace'){event.preventDefault();$('delete').click();}else if(['w','e','r'].includes(key))editor.setMode({w:'translate',e:'rotate',r:'scale'}[key]);});
function animate(now){const dt=(now-lastTime)/1000;lastTime=now;field.events(tracker.tick(now));const started=performance.now();field.render(dt);metrics.renderMs=metrics.renderMs*.9+(performance.now()-started)*.1;metrics.frames++;syncInputs();requestAnimationFrame(animate);}
requestAnimationFrame(animate);setInterval(()=>{if(!connecting)status();},700);syncInputs();
window.workbench={field,editor,tracker,metrics,get camera(){return camera;}};
