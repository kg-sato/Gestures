import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';

const origin=process.env.GESTURES_TEST_URL||'http://127.0.0.1:8765';
const executable=process.env.GESTURES_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
await mkdir('build',{recursive:true});
const browser=await chromium.launch({executablePath:executable,headless:true,args:['--use-fake-device-for-media-stream']});
const results=[];
const check=(name)=>{results.push(name);console.log('PASS',name);};
try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const external=[];page.on('request',request=>{if(!request.url().startsWith(origin)&&!request.url().startsWith('blob:')&&!request.url().startsWith('data:'))external.push(request.url());});
  await page.goto(origin);await page.bringToFront();
  await page.locator('#source').selectOption('esp32');
  await page.waitForFunction(()=>document.querySelector('#model-status').textContent.includes('ready'),null,{timeout:60000});
  assert.equal(await page.locator('#connect').isDisabled(),true);
  assert.match(await page.locator('#camera-message').textContent(),/hold|overheating/i);
  check('Real local MediaPipe worker/model initializes; hardware hold blocks camera');
  assert.deepEqual(external,[]);check('No external runtime requests');

  const canvas=page.locator('#canvas');const box=await canvas.boundingBox();
  await page.mouse.move(box.x+box.width*.25,box.y+box.height*.35);await page.mouse.down();
  for(let i=0;i<=20;i++)await page.mouse.move(box.x+box.width*(.25+i*.02),box.y+box.height*(.35+Math.sin(i/4)*.12));
  await page.mouse.up();
  assert.equal(await page.locator('#stroke-count').textContent(),'1');
  await page.locator('#undo').click();assert.equal(await page.locator('#stroke-count').textContent(),'0');
  await page.locator('#redo').click();assert.equal(await page.locator('#stroke-count').textContent(),'1');
  check('Canvas drawing and whole-stroke undo/redo');
  await page.waitForFunction(()=>localStorage.getItem('gestures.document.v1')?.includes('stroke-1'));
  await page.reload();await page.locator('#source').selectOption('esp32');assert.equal(await page.locator('#stroke-count').textContent(),'1');
  check('Artwork persists across reload');

  const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();
  const download=await downloadPromise;await download.saveAs('build/export-test.png');
  const png=await readFile('build/export-test.png');assert.equal(png.subarray(1,4).toString(),'PNG');
  assert.equal(png.readUInt32BE(16),1600);assert.equal(png.readUInt32BE(20),1200);
  check('PNG export is a real 1600 × 1200 image');

  await page.locator('#clear').click();assert.equal(await page.locator('#stroke-count').textContent(),'0');
  await page.locator('#undo').click();assert.equal(await page.locator('#stroke-count').textContent(),'1');
  const savedBefore=await page.evaluate(()=>localStorage.getItem('gestures.document.v1'));
  await page.locator('#import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":1,"strokes":[{}]}')});
  assert.equal(await page.locator('#stroke-count').textContent(),'1');check('Clear is undoable; invalid import preserves artwork');
  await page.waitForTimeout(4600);
  await page.screenshot({path:'build/studio-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'build/studio-mobile.png',fullPage:true});check('Mobile layout has no horizontal overflow');
  assert.deepEqual(errors,[]);check('No uncaught browser errors');

  // Run the actual model on Google's published example image. This is a static
  // fixture check, not evidence that the user's ESP32-CAM has been tested.
  const sample=await readFile('build/test-hand.jpg');
  const detection=await page.evaluate(async base64=>{
    const worker=new Worker('/tracker-worker.js',{type:'module'});
    const message=()=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Inference timeout')),60000);worker.onmessage=event=>{clearTimeout(timeout);resolve(event.data);};worker.onerror=e=>reject(Error(e.message));});
    const ready=message();worker.postMessage({type:'init'});const initialized=await ready;if(initialized.type!=='ready')throw Error(initialized.message);
    const bytes=Uint8Array.from(atob(base64),character=>character.charCodeAt(0));
    const times=[];let result;
    for(let i=0;i<4;i++){
      const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));
      const reply=message();worker.postMessage({type:'frame',bitmap,timestamp:1000+i*100,id:i},[bitmap]);result=await reply;times.push(result.inferenceMs);
    }
    worker.terminate();return {...result,times};
  },sample.toString('base64'));
  assert.equal(detection.type,'result');assert.equal(detection.hands.length,2);
  assert.ok(detection.hands.every(hand=>hand.landmarks.length===21));
  check('Actual inference detects both hands and 21 landmarks each in official sample');
  console.log('Static sample inference timings ms:',detection.times.map(Math.round));

  // Browser pipeline integration with synthetic landmarks and a fake camera.
  // The test replaces only acquisition/inference; the shipped app and gesture
  // engine consume the messages and update the real canvas/history.
  const testContext=await browser.newContext({viewport:{width:1280,height:1000}});
  const testPage=await testContext.newPage();
  await testPage.addInitScript(()=>{
    localStorage.removeItem('gestures.document.v1');
    window.__requests=[];window.__latest=null;
    window.Worker=class{
      constructor(){window.__worker=this;}
      postMessage(data){
        if(data.type==='init')setTimeout(()=>this.onmessage?.({data:{type:'ready',delegate:'TEST FIXTURE'}}),0);
        if(data.type==='frame'){data.bitmap.close();window.__requests.push(data);window.__latest=data;}
      }
      terminate(){}
    };
  });
  let sequence=0;
  await testPage.route('**/api/status',route=>route.fulfill({json:{connected:true,connecting:false,hardware_hold:false,fps:15,token:'fixture',error:'',model_ready:true}}));
  await testPage.route('**/api/ports',route=>route.fulfill({json:{ports:[]}}));
  await testPage.route('**/api/frame.jpg*',async route=>{await new Promise(resolve=>setTimeout(resolve,35));await route.fulfill({status:200,body:sample,contentType:'image/jpeg',headers:{'X-Frame-Sequence':String(++sequence),'X-Frame-Age-Ms':'0'}});});
  await testPage.goto(origin);await testPage.locator('#source').selectOption('esp32');await testPage.bringToFront();
  await testPage.waitForFunction(()=>window.__latest);
  async function deliver(hands){
    const previous=await testPage.evaluate(hands=>{
      const request=window.__latest;window.__latest=null;
      window.__worker.onmessage({data:{type:'result',id:request.id,timestamp:performance.now(),sourceAgeMs:0,inferenceMs:12,hands}});
      return window.__requests.length;
    },hands);
    await testPage.waitForFunction(n=>window.__requests.length>n,previous);
  }
  function hand(x,y,pinch='index',label='Right'){
    const landmarks=Array.from({length:21},()=>({x,y:y+.15,z:0}));
    for(const [id,dx,dy] of [[0,0,.4],[5,-.09,.22],[9,0,.2],[17,.12,.25],[8,0,0],[12,.14,-.02],[4,-.2,.15]])landmarks[id]={x:x+dx,y:y+dy,z:0};
    if(pinch==='index')landmarks[4]={x:x+.012,y:y+.006,z:0};
    if(pinch==='middle')landmarks[4]={x:x+.145,y:y-.015,z:0};
    return {landmarks,handedness:label};
  }
  await deliver([hand(.6,.3)]);await deliver([hand(.55,.35)]);await deliver([]);
  assert.equal(await testPage.locator('#stroke-count').textContent(),'1');check('App consumes pinch landmarks into a real stroke and releases safely');
  await testPage.waitForTimeout(400);
  const beforeResize=await testPage.evaluate(()=>JSON.parse(localStorage.getItem('gestures.document.v1')).strokes[0].width);
  await deliver([hand(.3,.3,'index','Left'),hand(.7,.3)]);
  await deliver([hand(.2,.3,'index','Left'),hand(.8,.3)]);await deliver([]);
  await testPage.waitForTimeout(400);
  const afterResize=await testPage.evaluate(()=>JSON.parse(localStorage.getItem('gestures.document.v1')).strokes[0].width);
  assert.ok(afterResize>beforeResize);check('Two-hand pinch grows actual artwork through app pipeline');
  await deliver([hand(.2,.3,'index','Left'),hand(.8,.3)]);
  await deliver([hand(.3,.3,'index','Left'),hand(.7,.3)]);await deliver([]);
  await testPage.waitForTimeout(400);
  const afterShrink=await testPage.evaluate(()=>JSON.parse(localStorage.getItem('gestures.document.v1')).strokes[0].width);
  assert.ok(afterShrink<afterResize);check('Two-hand pinch shrinks actual artwork through app pipeline');
  await testPage.locator('#undo').click();await deliver([]);
  await testPage.locator('#undo').click();
  await deliver([]); // Drain the pre-undo inference; its generation is obsolete.
  await deliver([hand(.46,.32,'middle')]);await deliver([]);
  assert.equal(await testPage.locator('#stroke-count').textContent(),'0');check('Middle pinch deletes a stroke through app pipeline');
  await testPage.locator('#undo').click();assert.equal(await testPage.locator('#stroke-count').textContent(),'1');
  check('Gesture deletion is undoable');

  // A UI reset invalidates a result without freeing its still-pending worker
  // slot. No second inference may queue until that result has been consumed.
  const pendingCount=await testPage.evaluate(()=>window.__requests.length);
  await testPage.locator('#pause').click();await testPage.locator('#pause').click();
  await testPage.waitForTimeout(180);
  assert.equal(await testPage.evaluate(()=>window.__requests.length),pendingCount);
  await deliver([]);check('Pause/reset does not queue inference behind a pending frame');
  const beforeStale=await testPage.locator('#stroke-count').textContent();
  await testPage.evaluate(hands=>{
    const request=window.__latest;window.__latest=null;
    window.__worker.onmessage({data:{type:'result',id:request.id,timestamp:performance.now(),sourceAgeMs:1500,inferenceMs:12,hands}});
  },[hand(.3,.4)]);
  await testPage.waitForFunction(()=>window.__latest);
  assert.equal(await testPage.locator('#stroke-count').textContent(),beforeStale);
  check('Old camera frames cannot start drawing');
  // Headless Chromium reports every page focused. Inject only the browser's
  // focus signal to exercise the shipped guard, rather than claiming native
  // tab focus behavior was observed in this headless environment.
  await testPage.evaluate(()=>{document.hasFocus=()=>false;window.dispatchEvent(new Event('blur'));});
  const inactiveCount=await testPage.evaluate(()=>window.__requests.length);
  await testPage.evaluate(hands=>{
    const request=window.__latest;if(!request)return;window.__latest=null;
    window.__worker.onmessage({data:{type:'result',id:request.id,timestamp:performance.now(),sourceAgeMs:0,inferenceMs:12,hands}});
  },[hand(.3,.4)]);
  await testPage.waitForTimeout(250);
  assert.equal(await testPage.evaluate(()=>window.__requests.length),inactiveCount);
  assert.equal(await testPage.locator('#stroke-count').textContent(),beforeStale);
  check('Inactive-tab guard stops inference and drawing (injected focus signal)');
  await testPage.close();

  // Exercise the native getUserMedia path with Chromium's generated test
  // camera, never the user's Logitech. Verify displayed camera pixels and
  // correct video aspect, then release every acquired video track.
  const webcamContext=await browser.newContext({permissions:['camera'],viewport:{width:1280,height:1000}});
  const webcamPage=await webcamContext.newPage();
  const webcamErrors=[];webcamPage.on('pageerror',error=>webcamErrors.push(error.message));
  await webcamPage.goto(origin);await webcamPage.bringToFront();
  await webcamPage.locator('#connect').click();
  await webcamPage.waitForFunction(()=>document.querySelector('#camera-badge').textContent==='Live',null,{timeout:15000});
  await webcamPage.waitForFunction(()=>Number(document.querySelector('#fps').textContent)>0);
  assert.equal(await webcamPage.locator('#show-camera').isChecked(),true);
  const geometry=await webcamPage.evaluate(()=>{
    const canvas=document.querySelector('#canvas'),preview=document.querySelector('#preview');
    const pixel=canvas.getContext('2d').getImageData(100,100,1,1).data;
    return {aspect:canvas.width/canvas.height,previewAspect:preview.width/preview.height,alpha:pixel[3]};
  });
  assert.ok(Math.abs(geometry.aspect-geometry.previewAspect)<.01);assert.equal(geometry.alpha,255);
  check('USB webcam connects through getUserMedia and fills main canvas with aligned aspect');
  await webcamPage.locator('#connect').click();
  await webcamPage.waitForFunction(()=>document.querySelector('#camera-badge').textContent==='Disconnected');
  assert.equal(await webcamPage.locator('#camera-placeholder').isVisible(),true);
  assert.deepEqual(webcamErrors,[]);check('Webcam disconnect releases capture and resets interface without errors');
  await webcamContext.close();
  await writeFile('build/browser-results.json',JSON.stringify({passed:results.length,checks:results,staticSampleInferenceMs:detection.inferenceMs,staticSampleTimings:detection.times,liveHardwareVerified:false},null,2));
  console.log(`${results.length} browser checks passed; physical camera remains unverified.`);
}finally{await browser.close();}
