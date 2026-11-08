import {BrowserCamera} from './webcam-source.js';
import {EffectInput} from './effect-input.js';
import {CameraEffects} from './camera-effects.js';

const $ = id => document.getElementById(id);
const input = new EffectInput(), effects = new CameraEffects($('fx'));
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const treatments = {
  cover:['Cover Window','Frame the artwork with two hands. Pinch and release to change the cover.'],
  riso:['Risograph','Spread your hands to separate the inks. Pinch and release for a new palette.'],
  crt:['CRT','Move your hands through the picture. The signal settles when you stop.'],
  dither:['One-bit Print','Spread your hands to change the dot size. Pinch and release to reverse the ink.'],
  liquid:['Liquid Motion','Move your hands to stir the picture. Let it settle, then start again.'],
  particles:['Particle Morph','Hold a pinch to scatter the form. Release to gather the next one.'],
};
const metrics = {frames:0,inferences:0,inferenceMs:[],resultAgeMs:[],frameMs:[],captureMs:[],maxPending:0};
let connected=false,connecting=false,ready=false,worker=null,generation=0,connectionAttempt=0,frameId=0,pending=null,latest=null,aspect=16/9;
let introDismissed=false,noticeTimer,last=performance.now(),synthetic=false,syntheticTime=null,sourceStartedAt=0;
const now=()=>Math.max(performance.now(),syntheticTime??0,input.time??0);
function sample(key,value){if(!Number.isFinite(value)||value<0)return;metrics[key].push(value);if(metrics[key].length>240)metrics[key].shift();}
function message(text){$('notice').textContent=text;clearTimeout(noticeTimer);if(text)noticeTimer=setTimeout(()=>{$('notice').textContent='';},8000);}
function cancelInput(){generation++;input.cancel(now());}
function selectMode(mode){
  if(!treatments[mode])return;
  generation++;input.setMode(mode,now());document.body.dataset.activeEffect=mode;
  for(const button of document.querySelectorAll('button[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===mode));
  $('effect-name').textContent=treatments[mode][0];$('effect-hint').textContent=treatments[mode][1];
  $('mode-announcement').textContent=treatments[mode].join('. ');
}
function initializeTracker(){
  if(worker)return;
  worker=new Worker(new URL('./tracker-worker.js',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{
    if(data.type==='ready'){ready=true;return;}
    if(data.type==='error'){ready=false;pending=null;cancelInput();message('Hand tracking could not start. Reload to retry.');return;}
    if(data.id&&pending&&data.id.frame===pending.frame)pending=null;
    if(data.type!=='result'||!data.id||data.id.generation!==generation||!connected||document.hidden)return;
    const age=performance.now()-data.timestamp;
    sample('inferenceMs',data.inferenceMs);sample('resultAgeMs',age);metrics.inferences++;
    if(synthetic)return;
    if(age>250){input.cancel(now());return;}
    const screenAspect=innerWidth/innerHeight,cropX=(1-Math.min(1,screenAspect/aspect))/2,cropY=(1-Math.min(1,aspect/screenAspect))/2;
    const hands=data.hands.map(hand=>({...hand,landmarks:hand.landmarks.map(p=>({...p,x:((1-p.x)-cropX)/(1-2*cropX),y:(p.y-cropY)/(1-2*cropY)}))}));
    input.update(hands,now());
  };
  worker.onerror=()=>{ready=false;pending=null;cancelInput();message('Hand tracking stopped. Reload to retry.');};
  worker.postMessage({type:'init'});
}
const camera=new BrowserCamera({
  onFrame:async(bitmap,timestamp,capture={})=>{
    if(!connected){bitmap.close();return;}
    const previous=latest;latest=bitmap;effects.setFrame(bitmap);previous?.close();sample('captureMs',capture.bitmapMs);
    if(!ready||pending||document.hidden)return;
    const gen=generation,copy=await createImageBitmap(bitmap,{resizeWidth:640,resizeHeight:Math.round(640/aspect)});
    if(!connected||generation!==gen||pending){copy.close();return;}
    pending={frame:++frameId,generation:gen};metrics.maxPending=Math.max(metrics.maxPending,1);
    worker.postMessage({type:'frame',bitmap:copy,timestamp,sourceAgeMs:performance.now()-timestamp,id:pending},[copy]);
  },
  onEnded:()=>{disconnect();message('Camera disconnected. Reconnect it to continue.');},
  onError:()=>{cancelInput();message('Camera frames interrupted. Disconnect and reconnect the camera.');},
});
function disconnect(){
  connectionAttempt++;connected=false;connecting=false;camera.stop();cancelInput();worker?.terminate();worker=null;ready=false;pending=null;
  effects.clearFrame();latest?.close();latest=null;
  document.body.classList.remove('connected','connecting');$('connect').textContent='Connect camera';$('empty').hidden=false;
  $('empty-title').textContent='Make room for a little strange.';$('empty-copy').textContent='Connect your camera. Put your hands in the picture.';
}
async function connect(){
  if(connected||connecting){disconnect();return;}
  connecting=true;const session=++connectionAttempt;generation++;sourceStartedAt=performance.now();
  document.body.classList.add('connecting');$('connect').textContent='Cancel';
  $('empty-title').textContent='Opening your camera…';$('empty-copy').textContent='Allow camera access in your browser to begin.';message('');initializeTracker();
  try{
    const info=await camera.start($('device').value);if(!info||connectionAttempt!==session)return;
    aspect=info.width/info.height;input.aspect=innerWidth/innerHeight;connected=true;connecting=false;
    document.body.classList.remove('connecting');document.body.classList.add('connected');$('empty').hidden=true;$('connect').textContent='Disconnect';await devices();
  }catch(error){
    if(connectionAttempt!==session)return;disconnect();
    message(error.name==='NotAllowedError'?'Allow camera access in your browser, then connect again.':['NotReadableError','AbortError'].includes(error.name)?'Camera busy. Close other camera apps, then connect again.':error.message);
  }
}
async function devices(){
  try{
    const selected=$('device').value,list=(await navigator.mediaDevices?.enumerateDevices()||[]).filter(d=>d.kind==='videoinput');
    $('device').replaceChildren(new Option('Default camera',''));for(const [i,d]of list.entries())$('device').add(new Option(d.label||'Camera '+(i+1),d.deviceId));
    if(list.some(d=>d.deviceId===selected))$('device').value=selected;
  }catch{message('Camera list unavailable. You can still connect the default camera.');}
}
function dismiss(){if(introDismissed)return;introDismissed=true;document.body.classList.add('intro-dismissed');const focused=$('intro').contains(document.activeElement);$('intro').hidden=true;if(focused)$('connect').focus({preventScroll:true});}
for(const button of document.querySelectorAll('button[data-mode]'))button.onclick=()=>selectMode(button.dataset.mode);
$('connect').onclick=connect;$('empty-connect').onclick=connect;$('device').onchange=()=>{if(connected||connecting)disconnect();};
$('dismiss').onclick=dismiss;$('begin').onclick=()=>{dismiss();if(!connected&&!connecting)connect();};
$('fullscreen').onclick=()=>{const action=document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();action.catch(()=>message('Fullscreen is unavailable in this browser.'));};
document.addEventListener('keydown',event=>{if(event.key==='Escape')dismiss();});
navigator.mediaDevices?.addEventListener('devicechange',()=>{if(!connected&&!connecting)devices();});
window.addEventListener('resize',()=>{effects.resize();input.aspect=innerWidth/innerHeight;cancelInput();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelInput();});
window.addEventListener('blur',cancelInput);window.addEventListener('pagehide',disconnect);reduced.addEventListener('change',cancelInput);
function animate(time){
  const elapsed=time-last;last=time;const dt=Math.min(.05,Math.max(0,elapsed/1000));
  if(connected)input.tick(synthetic?(syntheticTime??time):now());effects.render(dt,time,input.state,reduced.matches);
  if(connected&&time-sourceStartedAt>1500)sample('frameMs',elapsed);metrics.frames++;requestAnimationFrame(animate);
}
// Private inspection hooks distinguish generated-camera checks from hardware evidence.
window.effectsLab={input,effects,metrics,camera,selectMode,get connected(){return connected;},get mode(){return input.state.mode;},get pending(){return pending;},
  setSyntheticInput(value){cancelInput();synthetic=Boolean(value);syntheticTime=null;},
  applyHands(hands,time=performance.now()){if(!synthetic)throw Error('Enable synthetic inspection input first');syntheticTime=time;input.update(hands,time);},
};
selectMode('cover');effects.resize();devices();requestAnimationFrame(animate);
