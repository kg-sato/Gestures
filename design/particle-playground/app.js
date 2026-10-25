import {BrowserCamera} from './webcam-source.js';
import {analyseHands} from './ar-controls.js';
import {ARScene} from './ar-scene.js';
const $=id=>document.getElementById(id);
const cameraCanvas=$('camera'),context=cameraCanvas.getContext('2d');
const field=new ARScene($('fx'));
let connected=false,connecting=false,ready=false,paused=false,latest=null,pending=null;
let generation=0,frameId=0,aspect=16/9,fps=0,lastCameraAt=0,lastHandAt=0,handCount=0;
let trackerMessage='Loading tracker',cameraName='',lastTime=performance.now();
const active=()=>!document.hidden&&document.hasFocus();
const worker=new Worker('/tracker-worker.js',{type:'module'});
function resetInput(){generation++;lastHandAt=0;handCount=0;field.setInput(analyseHands([],aspect));}
function status(message){$('status').textContent=message||(!connected?'Camera off':!ready?trackerMessage:paused?'Frozen':handCount+' HAND'+(handCount===1?'':'S')+' · '+Math.round(fps)+' FPS');}
function fit(width,height){aspect=width/height;cameraCanvas.width=width;cameraCanvas.height=height;document.documentElement.style.setProperty('--aspect',String(aspect));field.resize();resetInput();}
function paintCamera(){context.clearRect(0,0,cameraCanvas.width,cameraCanvas.height);if(!latest)return;context.save();if($('mirror').checked){context.translate(cameraCanvas.width,0);context.scale(-1,1);}context.drawImage(latest,0,0,cameraCanvas.width,cameraCanvas.height);context.restore();}
async function submit(bitmap,timestamp){
  if(!ready||pending||paused||!active())return;
  const currentGeneration=generation,copy=await createImageBitmap(bitmap);
  if(!connected||paused||!active()||currentGeneration!==generation||pending){copy.close();return;}
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
  onError:error=>status('Camera error: '+error.message)
});
worker.onmessage=({data})=>{
  if(data.type==='ready'){ready=true;trackerMessage='Ready';status();return;}
  if(data.type==='error'){ready=false;status(data.message);return;}
  if(data.type!=='result'&&data.type!=='frame-error')return;
  if(!pending||pending.frame!==data.id.frame||pending.generation!==data.id.generation)return;
  pending=null;
  if(data.type==='frame-error'){resetInput();status('Tracking error');return;}
  if(data.id.generation!==generation||!connected||paused||!active())return;
  const now=performance.now();
  if(now-data.timestamp>700){resetInput();return;}
  const hands=data.hands.map(hand=>({...hand,landmarks:hand.landmarks.map(p=>({...p,x:$('mirror').checked?1-p.x:p.x}))}));
  const state=analyseHands(hands,aspect);field.setInput(state);handCount=state.count;lastHandAt=now;status();
};
worker.onerror=()=>{ready=false;pending=null;status('Tracker failed. Reload to retry.');};
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
for(const button of document.querySelectorAll('[data-shape]'))button.onclick=()=>{
  field.kind=button.dataset.shape;
  document.querySelectorAll('[data-shape]').forEach(item=>{const selected=item===button;item.classList.toggle('active',selected);item.setAttribute('aria-pressed',String(selected));});
};
$('color').oninput=()=>field.color($('color').value);
$('energy').oninput=()=>field.intensity=Number($('energy').value);
$('mirror').onchange=()=>{resetInput();paintCamera();};
$('pause').onclick=()=>{paused=!paused;field.paused=paused;resetInput();$('pause').textContent=paused?'Resume':'Freeze';$('pause').setAttribute('aria-pressed',String(paused));document.body.classList.toggle('paused',paused);status();};
$('reset').onclick=()=>{resetInput();field.reset();};
$('tutorial').onclick=()=>$('guide').showModal();$('close-guide').onclick=()=>$('guide').close();
$('guide').addEventListener('click',event=>{if(event.target===$('guide')){const r=$('guide').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('guide').close();}});
$('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen().catch(()=>status('Fullscreen unavailable'));};
window.addEventListener('resize',()=>field.resize());
window.addEventListener('blur',resetInput);document.addEventListener('visibilitychange',resetInput);
window.addEventListener('beforeunload',()=>{camera.stop();worker.terminate();latest?.close();field.dispose();});
$('fx').addEventListener('pointermove',event=>{if(connected&&handCount)return;const box=$('fx').getBoundingClientRect();field.setInput({tracked:false,count:0,center:{x:(event.clientX-box.left)/box.width,y:(event.clientY-box.top)/box.height},scale:1,spread:1,rotation:0,gesture:'mouse',burst:false});});
document.addEventListener('keydown',event=>{if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;if(event.code==='Space'){event.preventDefault();$('pause').click();}else if(event.key.toLowerCase()==='r')$('reset').click();else if(['1','2','3'].includes(event.key))document.querySelectorAll('[data-shape]')[Number(event.key)-1].click();});
function animate(now){const dt=(now-lastTime)/1000;lastTime=now;if(lastHandAt&&now-lastHandAt>500){resetInput();}field.render(dt);requestAnimationFrame(animate);}
requestAnimationFrame(animate);setInterval(()=>{if(!connecting)status();},700);devices();
