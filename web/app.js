import {BrowserCamera} from './webcam-source.js';
import {HandTracker} from './workbench-hands.js';
import {ARScene} from './ar-scene.js';
const $=id=>document.getElementById(id);
const cameraCanvas=$('camera'),context=cameraCanvas.getContext('2d');
const field=new ARScene($('fx'));
const tracker=new HandTracker();
const metrics={inferenceMs:0,resultAgeMs:0,renderMs:0,frames:0,inferences:0,inferenceTotal:0,ageTotal:0};
let connected=false,connecting=false,ready=false,paused=false,latest=null,pending=null;
let generation=0,frameId=0,aspect=16/9,fps=0,lastCameraAt=0,lastHandAt=0,handCount=0;
let trackerMessage='Loading tracker',cameraName='',lastTime=performance.now();
const active=()=>!document.hidden&&document.hasFocus();
const worker=new Worker('/tracker-worker.js',{type:'module'});
function resetInput(){generation++;lastHandAt=0;handCount=0;field.events(tracker.reset(performance.now()));field.cancel();}
function status(message){$('status').title=`Camera ${Math.round(fps)} FPS; render CPU ${metrics.renderMs.toFixed(1)} ms; inference ${metrics.inferences?(metrics.inferenceTotal/metrics.inferences).toFixed(1):0} ms mean; result age ${metrics.inferences?(metrics.ageTotal/metrics.inferences).toFixed(1):0} ms mean; samples ${metrics.inferences}`;$('status').textContent=message||(!connected?'Camera off':!ready?trackerMessage:paused?'Frozen':handCount+' HAND'+(handCount===1?'':'S')+' · '+Math.round(fps)+' FPS');}
function fit(width,height){aspect=width/height;tracker.aspect=aspect;cameraCanvas.width=width;cameraCanvas.height=height;document.documentElement.style.setProperty('--aspect',String(aspect));field.resize();resetInput();}
function paintCamera(){context.clearRect(0,0,cameraCanvas.width,cameraCanvas.height);if(!latest)return;context.save();if($('mirror').checked){context.translate(cameraCanvas.width,0);context.scale(-1,1);}context.drawImage(latest,0,0,cameraCanvas.width,cameraCanvas.height);context.restore();}
async function submit(bitmap,timestamp){
  if(!ready||pending||!active())return;
  const currentGeneration=generation,copy=await createImageBitmap(bitmap);
  if(!connected||!active()||currentGeneration!==generation||pending){copy.close();return;}
  pending={frame:++frameId,generation};
  worker.postMessage({type:'frame',bitmap:copy,timestamp,id:pending},[copy]);
}
const camera=new BrowserCamera({
  onFrame:async(bitmap,timestamp)=>{
    if(!connected){bitmap.close();return;}
    if(lastCameraAt){const current=1000/(timestamp-lastCameraAt);fps=fps?fps*.85+current*.15:current;}lastCameraAt=timestamp;
    latest?.close();latest=bitmap;paintCamera();await submit(bitmap,timestamp);
  },
  onEnded:()=>{connected=false;resetInput();latest?.close();latest=null;paintCamera();$('connect').textContent='Connect camera';status('Camera disconnected');},
  onError:error=>{resetInput();status('Camera error: '+error.message);}
});
worker.onmessage=({data})=>{
  if(data.type==='ready'){ready=true;trackerMessage='Ready';status();return;}
  if(data.type==='error'){ready=false;resetInput();status(data.message);return;}
  if(data.type!=='result'&&data.type!=='frame-error')return;
  if(!pending||pending.frame!==data.id.frame||pending.generation!==data.id.generation)return;
  pending=null;
  if(data.type==='frame-error'){resetInput();status('Tracking error');return;}
  if(data.id.generation!==generation||!connected||!active())return;
  const now=performance.now();
  if(now-data.timestamp>700){resetInput();return;}
  const hands=data.hands.map(hand=>({...hand,landmarks:hand.landmarks.map(p=>({...p,x:$('mirror').checked?1-p.x:p.x}))}));
  const events=tracker.update(hands,now);field.setTrackingComplete(tracker.active.every(t=>t.lastSeen===now));field.events(events);handCount=tracker.count;lastHandAt=now;metrics.inferenceMs=data.inferenceMs;metrics.resultAgeMs=now-data.timestamp;metrics.inferences++;metrics.inferenceTotal+=data.inferenceMs;metrics.ageTotal+=now-data.timestamp;status();
};
worker.onerror=()=>{ready=false;pending=null;resetInput();status('Tracker failed. Reload to retry.');};
worker.postMessage({type:'init'});
async function devices(){
  try{const list=(await navigator.mediaDevices?.enumerateDevices()||[]).filter(d=>d.kind==='videoinput'),selected=$('device').value;
    $('device').replaceChildren(new Option('Default camera',''));
    list.forEach((d,i)=>$('device').add(new Option(d.label||'Camera '+(i+1),d.deviceId)));
    const preferred=list.find(d=>d.deviceId===selected)||list.find(d=>/Brio|Logitech/i.test(d.label));if(preferred)$('device').value=preferred.deviceId;
  }catch(error){status('Camera list unavailable');}
}
function disconnect(){camera.stop();connected=false;connecting=false;resetInput();latest?.close();latest=null;paintCamera();$('connect').textContent='Connect camera';fps=0;lastCameraAt=0;status();}
$('connect').onclick=async()=>{
  if(connected||connecting){disconnect();return;}
  connecting=true;$('connect').textContent='Cancel';status('Requesting camera…');
  try{
    const info=await camera.start($('device').value);if(!info)return;
    connected=true;connecting=false;cameraName=info.label;fit(info.width,info.height);
    $('connect').textContent='Disconnect';await devices();status();
  }catch(error){disconnect();status(error.name==='NotAllowedError'?'Camera permission denied':error.message);}
};
$('device').onchange=()=>{if(connected)disconnect();};
$('add').onclick=()=>{field.add($('object').value);syncInputs();};
$('gravity').onchange=()=>{field.model.gravity=$('gravity').checked;};
$('depth').oninput=()=>field.setDepth(Number($('depth').value));
$('detach').onclick=()=>{resetInput();field.detach();syncInputs();};
$('delete').onclick=()=>{resetInput();field.delete();syncInputs();};
$('mirror').onchange=()=>{resetInput();paintCamera();};
$('pause').onclick=()=>{paused=!paused;field.model.frozen=paused;resetInput();$('pause').textContent=paused?'Resume':'Freeze';$('pause').setAttribute('aria-pressed',String(paused));document.body.classList.toggle('paused',paused);status();};
$('reset').onclick=()=>{resetInput();field.reset();syncInputs();};
function syncInputs(){const part=field.model.parts.get(field.selected);$('detach').disabled=!part;$('delete').disabled=!part;$('depth').disabled=!part;$('add').disabled=field.model.parts.size>=12;if(part)$('depth').value=field.model.assemblyFor(part.id).body.position.z;}
$('tutorial').onclick=()=>$('guide').showModal();$('close-guide').onclick=()=>$('guide').close();
$('guide').addEventListener('click',event=>{if(event.target===$('guide')){const r=$('guide').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('guide').close();}});
$('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen().catch(()=>status('Fullscreen unavailable'));};
window.addEventListener('resize',()=>field.resize());
window.addEventListener('blur',resetInput);document.addEventListener('visibilitychange',resetInput);
window.addEventListener('beforeunload',()=>{camera.stop();worker.terminate();latest?.close();field.dispose();});
document.addEventListener('keydown',event=>{if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;if(event.code==='Space'){event.preventDefault();$('pause').click();}else if(event.key.toLowerCase()==='r')$('reset').click();else if(event.key==='Delete')$('delete').click();});
function animate(now){const dt=(now-lastTime)/1000;lastTime=now;field.events(tracker.tick(now));const started=performance.now();field.render(dt);metrics.renderMs=metrics.renderMs*.9+(performance.now()-started)*.1;metrics.frames++;syncInputs();requestAnimationFrame(animate);}
requestAnimationFrame(animate);setInterval(()=>{if(!connecting)status();},700);devices();

// Local diagnostics for local verification; no remote telemetry.
window.workbench={field,tracker,metrics,get camera(){return camera;}};
