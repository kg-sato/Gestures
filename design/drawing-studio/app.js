import {GestureEngine, DrawingScene, HAND_CONNECTIONS} from './gesture-engine.js';
import {BrowserCamera} from './webcam-source.js';

const $ = (id) => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d');
const overlay = $('overlay'), overlayCtx = overlay.getContext('2d');
const preview = $('preview'), previewCtx = preview.getContext('2d');
const scene = new DrawingScene();
const engine = new GestureEngine({aspectRatio:4/3});
const STORAGE = 'gestures.document.v1';
let tool = 'draw', color = '#a6f6cf', width = 0.006;
let pointerDown = false, pointerSession = 0, pointer = null;
let latestFrame = null, latestIntent = {kind:'lost',hands:[],cursor:null};
let cameraConnected = false, cameraConnecting = false, paused = false, modelReady = false, pendingFrame = null;
let worker, nextFrameId = 0, sourceGeneration = 0, lastResultAt = 0;
let token = '', frameSequence = -1, frameLoopRunning = false, lastRevision = -1;
let saveTimer, toastTimer, statusTimer;
let hardwareHold = true;
let source='webcam', webcamLabel='USB webcam', webcamFps=0, previousWebcamFrame=0;
const isActive = () => !document.hidden && document.hasFocus();

function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>$('toast').hidden=true, 4500);
}

function stopInteraction() {
  engine.reset(); scene.consume({kind:'lost'}); latestIntent={kind:'lost',hands:[],cursor:null};
  pointerDown=false; pointer=null; sourceGeneration++;
  render();
}

function changed() {
  if (scene.revision === lastRevision) return;
  lastRevision = scene.revision;
  $('stroke-count').textContent = String(scene.strokes.length);
  $('undo').disabled = !scene.canUndo; $('redo').disabled = !scene.canRedo;
  $('empty-state').hidden = scene.strokes.length > 0 || cameraConnected;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{
    try {localStorage.setItem(STORAGE, JSON.stringify(scene.serialize()));}
    catch {toast('Browser storage is full. Save your project to keep this drawing.');}
  }, 350);
}

function strokePath(context, stroke, targetWidth, targetHeight) {
  const points=stroke.points;
  context.beginPath();
  context.strokeStyle=stroke.color; context.fillStyle=stroke.color;
  context.lineWidth=stroke.width*targetHeight; context.lineCap='round'; context.lineJoin='round';
  if(points.length===1){context.arc(points[0].x*targetWidth,points[0].y*targetHeight,context.lineWidth/2,0,Math.PI*2);context.fill();return;}
  context.moveTo(points[0].x*targetWidth,points[0].y*targetHeight);
  // Quadratic midpoints keep short camera samples from looking angular.
  for(let i=1;i<points.length-1;i++){
    const p=points[i],n=points[i+1];
    context.quadraticCurveTo(p.x*targetWidth,p.y*targetHeight,(p.x+n.x)*targetWidth/2,(p.y+n.y)*targetHeight/2);
  }
  const last=points.at(-1);context.lineTo(last.x*targetWidth,last.y*targetHeight);context.stroke();
}

function drawFrame(context,w,h) {
  if(!latestFrame)return;
  context.save();
  if($('mirror').checked){context.translate(w,0);context.scale(-1,1);}
  context.drawImage(latestFrame,0,0,w,h);context.restore();
}

function drawHands(context,hands,w,h,opacity=1) {
  if(!$('show-landmarks').checked)return;
  context.save();context.globalAlpha=opacity;context.lineWidth=1.4;
  for(const hand of hands){
    const points=hand.landmarks;
    context.strokeStyle='#a6f6cf88';context.beginPath();
    for(const [a,b] of HAND_CONNECTIONS){context.moveTo(points[a].x*w,points[a].y*h);context.lineTo(points[b].x*w,points[b].y*h);}
    context.stroke();
    points.forEach((p,i)=>{context.fillStyle=[4,8,12].includes(i)?'#f4dc8b':'#a6f6cf';context.beginPath();context.arc(p.x*w,p.y*h,[4,8,12].includes(i)?3.3:1.9,0,Math.PI*2);context.fill();});
  }
  context.restore();
}

function render() {
  $('empty-state').hidden=scene.strokes.length>0||cameraConnected;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if($('show-camera').checked && cameraConnected)drawFrame(ctx,canvas.width,canvas.height);
  for(const stroke of scene.strokes)strokePath(ctx,stroke,canvas.width,canvas.height);
  overlayCtx.clearRect(0,0,overlay.width,overlay.height);
  if(cameraConnected&&!paused)drawHands(overlayCtx,latestIntent.hands||[],overlay.width,overlay.height,.55);
  if(tool==='select'&&scene.selectedId){
    const bounds=scene.bounds({selectedOnly:true});
    if(bounds){overlayCtx.strokeStyle='#c3afff';overlayCtx.lineWidth=1.5;overlayCtx.setLineDash([7,6]);overlayCtx.strokeRect(bounds.x*overlay.width-8,bounds.y*overlay.height-8,bounds.width*overlay.width+16,bounds.height*overlay.height+16);overlayCtx.setLineDash([]);}
  }
  const cursor=pointer||latestIntent.cursor;
  if(cursor){
    const erasing=tool==='erase'||latestIntent.kind==='erase';
    overlayCtx.beginPath();overlayCtx.strokeStyle=erasing?'#ffab96':color;overlayCtx.lineWidth=2;
    overlayCtx.arc(cursor.x*overlay.width,cursor.y*overlay.height,erasing?28:10,0,Math.PI*2);overlayCtx.stroke();
  }
  previewCtx.clearRect(0,0,preview.width,preview.height);
  if(cameraConnected){drawFrame(previewCtx,preview.width,preview.height);drawHands(previewCtx,latestIntent.hands||[],preview.width,preview.height);}
  changed();
}

function setTool(value) {
  stopInteraction(); tool=value;
  document.querySelectorAll('[data-tool]').forEach(button=>{const selected=button.dataset.tool===tool;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});
  render();
}

function consume(intent) {
  latestIntent=intent;
  scene.consume(intent,{tool,color,width});
  const labels={draw:tool==='select'?'Moving stroke':tool==='erase'?'Erasing':'Drawing',erase:'Erasing',transform:'Stretch · move · rotate',hover:'Release to hover',lost:'Hand out of view'};
  $('gesture-pill').textContent=intent.ambiguous&&intent.kind==='hover'?'Pinch unclear · separate fingertips':labels[intent.kind]||'Hover';
  $('gesture-pill').hidden=!cameraConnected||paused||intent.kind==='lost';
  $('hands').textContent=String(intent.hands?.length||0);
  render();
}

function setupWorker() {
  worker=new Worker('/tracker-worker.js',{type:'module'});
  worker.onmessage=({data})=>{
    if(data.type==='ready'){
      modelReady=true;$('model-status').textContent='Hand tracker ready · '+data.delegate;$('pause').disabled=false;return;
    }
    if(data.type==='error'){
      modelReady=false;pendingFrame=null;$('model-status').textContent='Tracker unavailable';toast(data.message);return;
    }
    if(data.type==='result'||data.type==='frame-error'){
      if(!pendingFrame||data.id.frame!==pendingFrame.frame||data.id.generation!==pendingFrame.generation)return;
      pendingFrame=null;
    }
    if(data.type==='frame-error'){stopInteraction();$('model-status').textContent='Tracking error';return;}
    if(data.type!=='result'||data.id.generation!==sourceGeneration||paused||!cameraConnected||pointerDown||!isActive())return;
    const now=performance.now();
    if(now-data.timestamp+(data.sourceAgeMs||0)>700){consume(engine.update([],now));$('model-status').textContent='Tracking delayed — holding pen';return;}
    lastResultAt=now;
    $('latency').textContent=String(Math.round(data.inferenceMs));
    $('model-status').textContent=data.hands.length?'Tracking '+data.hands.length+' hand'+(data.hands.length===1?'':'s'):'Ready · show your hand';
    const hands=data.hands.map(hand=>({...hand,landmarks:hand.landmarks.map(p=>({...p,x:$('mirror').checked?1-p.x:p.x}))}));
    for(const track of engine.tracks)track.filter.minCutoff=7-Number($('smoothing').value);
    consume(engine.update(hands,data.timestamp));
  };
  worker.onerror=()=>{pendingFrame=null;modelReady=false;$('model-status').textContent='Tracker could not start';toast('Hand tracker could not start. Check local model setup and reload.');};
  worker.postMessage({type:'init'});
}

async function api(path,body) {
  const response=await fetch(path,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json','X-Gestures-Token':token},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'Request failed');
  return data;
}

async function refreshPorts() {
  try{
    if(source==='webcam'){
      const devices=(await navigator.mediaDevices?.enumerateDevices()||[]).filter(item=>item.kind==='videoinput');
      const selected=$('ports').value;
      $('ports').replaceChildren(new Option(devices.length?'Default webcam':'Connect to request camera access',''));
      devices.forEach((item,index)=>$('ports').add(new Option(item.label||'USB camera '+(index+1),item.deviceId)));
      if(devices.some(item=>item.deviceId===selected))$('ports').value=selected;
      else {const preferred=devices.find(item=>/Brio|Logitech/i.test(item.label));if(preferred)$('ports').value=preferred.deviceId;}
      return;
    }
    const {ports}=await api('/api/ports');const selected=$('ports').value;
    $('ports').replaceChildren(new Option(ports.length?'Choose camera port':'No USB serial camera found',''));
    for(const item of ports)$('ports').add(new Option(item.port+' · '+item.name,item.port));
    if(ports.some(p=>p.port===selected))$('ports').value=selected;
    else if(ports.length===1)$('ports').value=ports[0].port;
  }catch(error){toast(error.message);}
}

async function pollStatus() {
  try{
    const data=await api('/api/status');token=data.token;hardwareHold=data.hardware_hold;
    if(source==='webcam'){updateWebcamUI();return;}
    const previous=cameraConnected;cameraConnected=data.connected;cameraConnecting=data.connecting;
    $('camera-badge').textContent=data.connecting?'Connecting':cameraConnected?'Live':'Disconnected';
    $('camera-badge').classList.toggle('live',cameraConnected);
    $('camera-placeholder').hidden=cameraConnected;
    $('connect').textContent=cameraConnected||data.connecting?'Disconnect':'Connect';
    $('connect').disabled=hardwareHold;
    $('fps').textContent=cameraConnected?String(data.fps):'—';
    $('camera-message').textContent=data.error||(cameraConnected?'Keep your whole hand in view.':'Select the USB port after flashing the camera firmware.');
    $('input-label').textContent=cameraConnected?(paused?'Hand tracking paused':'ESP32-CAM · live hand input'):'Mouse preview · camera disconnected';
    $('input-dot').classList.toggle('live',cameraConnected&&!paused);
    if(!cameraConnected&&previous){stopInteraction();latestFrame?.close();latestFrame=null;$('hands').textContent='0';$('latency').textContent='—';}
    if(cameraConnected&&!frameLoopRunning)frameLoop();
    render();
  }catch(error){
    if(cameraConnected){cameraConnected=false;stopInteraction();}
    $('camera-message').textContent='Local server unavailable. Restart Gestures.';
  }finally{statusTimer=setTimeout(pollStatus,1200);}
}

async function frameLoop() {
  frameLoopRunning=true;
  try{
    while(cameraConnected&&source==='esp32'){
      const requestedAt=performance.now();
      const response=await fetch('/api/frame.jpg?after='+frameSequence,{cache:'no-store',signal:AbortSignal.timeout(3000)});
      const receivedAt=performance.now();
      if(!response.ok)throw Error('Waiting for fresh camera frames');
      const sequence=Number(response.headers.get('X-Frame-Sequence'));
      if(sequence===frameSequence){await new Promise(resolve=>setTimeout(resolve,30));continue;}
      frameSequence=sequence;
      const bitmap=await createImageBitmap(await response.blob());
      if(!cameraConnected||source!=='esp32'){bitmap.close();break;}
      latestFrame?.close();latestFrame=bitmap;render();
      const sourceAgeMs=Number(response.headers.get('X-Frame-Age-Ms')||0)+(receivedAt-requestedAt)+(performance.now()-receivedAt);
      if(sourceAgeMs>500){consume(engine.update([],performance.now()));continue;}
      await submitFrame(bitmap,sourceAgeMs);
    }
  }catch(error){
    if(source==='esp32'){
      consume(engine.update([],performance.now()));
      $('camera-message').textContent=error.message;
    }
  }finally{frameLoopRunning=false;}
}

async function submitFrame(bitmap,sourceAgeMs=0) {
  if(!modelReady||paused||pendingFrame||pointerDown||!isActive())return;
  const generation=sourceGeneration;
  const copy=await createImageBitmap(bitmap),timestamp=performance.now();
  if(generation!==sourceGeneration||!cameraConnected||paused||pointerDown||!isActive()||pendingFrame){copy.close();return;}
  pendingFrame={frame:++nextFrameId,generation};
  worker.postMessage({type:'frame',bitmap:copy,timestamp,sourceAgeMs,id:pendingFrame},[copy]);
}

function fitCamera(width,height) {
  const aspect=width/height;
  if(!Number.isFinite(aspect)||aspect<=0)return;
  engine.aspectRatio=aspect;
  canvas.width=overlay.width=1200;canvas.height=overlay.height=Math.round(1200/aspect);
  preview.width=480;preview.height=Math.round(480/aspect);
  $('stage').style.aspectRatio=String(aspect);
  $('stage').style.setProperty('--camera-aspect',String(aspect));
  preview.parentElement.style.aspectRatio=String(aspect);
  stopInteraction();
}

function updateWebcamUI(message) {
  $('connect').disabled=cameraConnecting;
  $('connect').textContent=cameraConnected?'Disconnect':cameraConnecting?'Connecting…':'Connect';
  $('camera-badge').textContent=cameraConnected?'Live':cameraConnecting?'Connecting':'Disconnected';
  $('camera-badge').classList.toggle('live',cameraConnected);
  $('camera-placeholder').hidden=cameraConnected;
  $('fps').textContent=cameraConnected?webcamFps.toFixed(1):'—';
  $('input-label').textContent=cameraConnected?(paused?'Hand tracking paused':webcamLabel+' · live hand input'):'Mouse preview · webcam disconnected';
  $('input-dot').classList.toggle('live',cameraConnected&&!paused);
  if(message)$('camera-message').textContent=message;
  render();
}

const webcam=new BrowserCamera({
  onFrame:async(bitmap,timestamp)=>{
    if(source!=='webcam'||!cameraConnected){bitmap.close();return;}
    if(previousWebcamFrame){const fps=1000/(timestamp-previousWebcamFrame);webcamFps=webcamFps?webcamFps*.85+fps*.15:fps;}
    previousWebcamFrame=timestamp;
    latestFrame?.close();latestFrame=bitmap;render();
    await submitFrame(bitmap,performance.now()-timestamp);
  },
  onEnded:()=>{cameraConnected=false;cameraConnecting=false;stopInteraction();updateWebcamUI('Webcam disconnected. Reconnect it and try again.');},
  onError:error=>{stopInteraction();$('camera-message').textContent='Webcam frame error: '+error.message;}
});

async function disconnectSource() {
  stopInteraction();
  if(source==='webcam')webcam.stop();
  else await api('/api/disconnect',{});
  cameraConnected=false;cameraConnecting=false;previousWebcamFrame=0;webcamFps=0;
  latestFrame?.close();latestFrame=null;
  $('hands').textContent='0';$('latency').textContent='—';render();
}

function pointerPosition(event) {
  const rect=canvas.getBoundingClientRect();
  return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};
}
canvas.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  event.preventDefault();canvas.focus();canvas.setPointerCapture(event.pointerId);
  stopInteraction();pointerDown=true;pointerSession++;pointer=pointerPosition(event);
  scene.consume({kind:'draw',session:'mouse-'+pointerSession,point:pointer},{tool,color,width});render();
});
canvas.addEventListener('pointermove',event=>{
  pointer=pointerPosition(event);
  if(pointerDown)scene.consume({kind:'draw',session:'mouse-'+pointerSession,point:pointer},{tool,color,width});
  render();
});
function pointerUp(){pointerDown=false;scene.consume({kind:'hover'});engine.reset();render();}
canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',pointerUp);
canvas.addEventListener('lostpointercapture',pointerUp);
canvas.addEventListener('pointerleave',()=>{if(!pointerDown){pointer=null;render();}});
canvas.addEventListener('wheel',event=>{
  if(!event.ctrlKey)return;
  event.preventDefault();stopInteraction();
  const bounds=scene.bounds();if(bounds)scene.transform({scale:event.deltaY<0?1.08:1/1.08,center:bounds.center});render();
},{passive:false});
document.querySelectorAll('[data-tool]').forEach(button=>button.addEventListener('click',()=>setTool(button.dataset.tool)));
document.querySelectorAll('[data-color]').forEach(button=>button.addEventListener('click',()=>{
  stopInteraction();color=button.dataset.color;
  document.querySelectorAll('[data-color]').forEach(item=>{const active=item===button;item.classList.toggle('selected',active);item.setAttribute('aria-pressed',String(active));});render();
}));
$('brush').addEventListener('input',()=>{width=Number($('brush').value)/1000;$('brush-value').textContent=$('brush').value;scene.endStroke();});
$('sensitivity').addEventListener('input',()=>{stopInteraction();engine.pinchOn=Number($('sensitivity').value);engine.pinchOff=engine.pinchOn+.14;});
$('smoothing').addEventListener('input',()=>stopInteraction());
for(const id of ['mirror','show-camera','show-landmarks'])$(id).addEventListener('change',()=>{stopInteraction();render();});
$('undo').onclick=()=>{stopInteraction();scene.undo();render();};
$('redo').onclick=()=>{stopInteraction();scene.redo();render();};
$('clear').onclick=()=>{stopInteraction();if(scene.clear())toast('Canvas cleared. Undo brings it back.');render();};
$('pause').onclick=()=>{paused=!paused;stopInteraction();$('pause').textContent=paused?'Resume tracking':'Pause tracking';$('input-label').textContent=paused?'Hand tracking paused':cameraConnected?(source==='webcam'?webcamLabel:'ESP32-CAM')+' · live hand input':'Mouse preview · camera disconnected';$('input-dot').classList.toggle('live',cameraConnected&&!paused);};
$('refresh-ports').onclick=refreshPorts;
$('source').onchange=async()=>{
  const selected=$('source').value;
  try{await disconnectSource();}catch(error){toast(error.message);}
  source=selected;
  $('source-name').textContent=source==='webcam'?'USB webcam':'ESP32-CAM';
  $('camera-message').textContent=source==='webcam'?'Choose your Logitech webcam and click Connect.':hardwareHold?'ESP32 access is held; webcam access is available.':'Choose the ESP32-CAM serial port.';
  if(source==='esp32')fitCamera(4,3);
  updateWebcamUI();$('connect').disabled=source==='esp32'&&hardwareHold;
  await refreshPorts();
};
$('connect').onclick=async()=>{
  $('connect').disabled=true;
  try{
    stopInteraction();
    if(cameraConnected||cameraConnecting){await disconnectSource();if(source==='webcam')updateWebcamUI('Webcam disconnected.');}
    else if(source==='webcam'){
      cameraConnecting=true;updateWebcamUI('Allow camera access if your browser asks. Microphone access is not requested.');
      if(!token){const status=await api('/api/status');token=status.token;}
      await api('/api/disconnect',{}); // Release an ESP32 connection from a previous page/session.
      const info=await webcam.start($('ports').value);
      if(!info||source!=='webcam')return;
      webcamLabel=info.label||'USB webcam';cameraConnected=true;cameraConnecting=false;
      fitCamera(info.width,info.height);await refreshPorts();
      updateWebcamUI(webcamLabel+' · '+info.width+' × '+info.height+' · keep your full hand in view.');
    }else{
      if(!$('ports').value)throw Error('Choose the camera’s USB serial port first.');
      await api('/api/connect',{port:$('ports').value});frameSequence=-1;
    }
  }
  catch(error){toast(error.message);$('camera-message').textContent=error.message;}
  finally{cameraConnecting=false;$('connect').disabled=source==='esp32'&&hardwareHold;if(source==='webcam')updateWebcamUI();}
};
$('help-toggle').onclick=()=>{const hidden=!$('gesture-guide').hidden;$('gesture-guide').hidden=hidden;$('help-toggle').setAttribute('aria-expanded',String(!hidden));};
$('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else $('stage').requestFullscreen().catch(()=>toast('Fullscreen is unavailable in this browser.'));};
function download(blob,name){const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}
$('save-project').onclick=()=>{stopInteraction();download(new Blob([JSON.stringify(scene.serialize(),null,2)],{type:'application/json'}),'gestures-project.json');toast('Saved an editable project.');};
$('export').onclick=()=>{
  stopInteraction();const output=document.createElement('canvas');output.width=1600;output.height=Math.round(1600*canvas.height/canvas.width);const context=output.getContext('2d');context.fillStyle='#122c27';context.fillRect(0,0,output.width,output.height);for(const stroke of scene.strokes)strokePath(context,stroke,output.width,output.height);output.toBlob(blob=>{if(blob)download(blob,'gestures-artwork.png');},'image/png');
};
$('import-file').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;
  try{if(file.size>12000000)throw Error('Project is too large (12 MB maximum).');const value=JSON.parse(await file.text());stopInteraction();scene.restore(value);render();toast('Project opened. Undo restores your previous drawing.');}
  catch(error){toast('Could not open project: '+error.message);}finally{event.target.value='';}
};
document.addEventListener('keydown',event=>{
  if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;
  const key=event.key.toLowerCase();
  if((event.ctrlKey||event.metaKey)&&key==='z'){event.preventDefault();stopInteraction();event.shiftKey?scene.redo():scene.undo();render();}
  else if((event.ctrlKey||event.metaKey)&&key==='s'){event.preventDefault();$('save-project').click();}
  else if(!event.ctrlKey&&!event.metaKey&&['d','e','v'].includes(key))setTool({d:'draw',e:'erase',v:'select'}[key]);
  else if(key==='delete'||key==='backspace'){event.preventDefault();stopInteraction();scene.deleteSelected();render();}
  else if(key==='escape'){stopInteraction();scene.selectedId=null;render();}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopInteraction();});
window.addEventListener('blur',()=>stopInteraction());
window.addEventListener('focus',()=>stopInteraction());
window.addEventListener('beforeunload',()=>{try{localStorage.setItem(STORAGE,JSON.stringify(scene.serialize()));}catch{}webcam.stop();worker?.terminate();});
setInterval(()=>{if(cameraConnected&&!paused&&lastResultAt&&performance.now()-lastResultAt>500&&latestIntent.kind!=='lost'){consume(engine.update([],performance.now()));}},150);
try{const saved=localStorage.getItem(STORAGE);if(saved)scene.restore(saved,{checkpoint:false});}catch{toast('Saved drawing could not be read. Your browser copy was not imported.');}
render();setupWorker();refreshPorts();pollStatus();
