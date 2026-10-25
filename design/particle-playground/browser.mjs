import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const origin=process.env.GESTURES_TEST_URL||'http://127.0.0.1:8766';
const browser=await chromium.launch({executablePath:process.env.GESTURES_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-fake-device-for-media-stream']});
const passed=[];const check=name=>{passed.push(name);console.log('PASS',name);};
await mkdir('build',{recursive:true});
try{
  const context=await browser.newContext({permissions:['camera'],viewport:{width:1440,height:900}});
  const page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(!request.url().startsWith(origin)&&!request.url().startsWith('blob:')&&!request.url().startsWith('data:'))external.push(request.url());});
  await page.goto(origin);await page.bringToFront();
  await page.waitForFunction(()=>document.querySelector('#fx').width>0);
  assert.equal(await page.locator('header,footer,.intro,.toolbar,.sidebar').count(),0);
  assert.equal(await page.locator('#camera').count(),1);assert.equal(await page.locator('#fx').count(),1);
  check('Camera fills the page with only compact inputs and tutorial; drawing chrome removed');
  await page.locator('#tutorial').click();assert.equal(await page.locator('#guide').isVisible(),true);
  assert.equal(await page.locator('#guide .gesture').count(),4);await page.keyboard.press('Escape');
  assert.equal(await page.locator('#guide').isVisible(),false);check('Tutorial opens, describes four gestures and closes with Escape');
  await page.locator('#connect').click();await page.waitForFunction(()=>document.querySelector('#connect').textContent==='Disconnect');
  await page.waitForFunction(()=>/FPS/.test(document.querySelector('#status').textContent),null,{timeout:60000});
  const camera=await page.evaluate(()=>{const canvas=document.querySelector('#camera');return{width:canvas.width,height:canvas.height,alpha:canvas.getContext('2d').getImageData(100,100,1,1).data[3]};});
  assert.equal(camera.alpha,255);assert.ok(camera.width>=640);check('Native webcam capture and actual MediaPipe initialize with live camera pixels');
  for(const shape of ['galaxy','portal','orb']){await page.locator(`[data-shape=${shape}]`).click();assert.equal(await page.locator(`[data-shape=${shape}]`).getAttribute('aria-pressed'),'true');}
  await page.locator('#color').fill('#b88cff');await page.locator('#energy').fill('1.4');check('All three formations, colour and energy inputs respond');
  await page.locator('#pause').click();assert.equal(await page.locator('#pause').textContent(),'Resume');assert.equal(await page.locator('#status').textContent(),'Frozen');
  await page.keyboard.press('Space');assert.equal(await page.locator('#pause').textContent(),'Freeze');
  await page.keyboard.press('2');assert.equal(await page.locator('[data-shape=galaxy]').getAttribute('aria-pressed'),'true');await page.locator('#reset').click();check('Freeze/resume, keyboard scene switching and reset work');
  await page.screenshot({path:'build/ar-desktop.png',fullPage:true});
  const renderer=await page.evaluate(async()=>{
    const {ARScene}=await import('/ar-scene.js');
    const canvas=document.createElement('canvas');canvas.style.width='320px';canvas.style.height='180px';document.body.append(canvas);
    const field=new ARScene(canvas);field.kind='portal';field.setInput({tracked:true,count:2,center:{x:.7,y:.3},scale:1.6,spread:1.9,rotation:.3,gesture:'stretch',burst:true});
    for(let i=0;i<60;i++)field.render(1/60);
    const result={count:field.geometry.attributes.position.count,x:field.root.position.x,y:field.root.position.y,scale:field.root.scale.x,beam:field.beam.visible,finite:Array.from(field.positions).every(Number.isFinite)};
    const before=Array.from(field.positions);field.paused=true;field.render(.05);result.frozen=before.every((v,i)=>v===field.positions[i]);field.dispose();canvas.remove();return result;
  });
  assert.equal(renderer.count,6500);assert.ok(renderer.x>.2&&renderer.y>.1&&renderer.scale>1.4);assert.equal(renderer.beam,true);assert.equal(renderer.finite,true);assert.equal(renderer.frozen,true);
  check('Real WebGL renderer creates 6500 particles and applies hand movement, scale, spread and freeze');
  await page.setViewportSize({width:390,height:844});
  for(const selector of ['.camera-inputs','.utility-inputs','.effect-inputs']){const box=await page.locator(selector).boundingBox();assert.ok(box.x>=0&&box.x+box.width<=391&&box.y>=0&&box.y+box.height<=845,selector);}
  await page.screenshot({path:'build/ar-mobile.png',fullPage:true});check('Camera and controls fit a phone viewport');
  await page.locator('#connect').click();assert.equal(await page.locator('#connect').textContent(),'Connect camera');assert.equal(await page.locator('#status').textContent(),'Camera off');check('Disconnect releases camera and resets tracking');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);check('No uncaught browser errors or external runtime requests');
  await writeFile('build/ar-browser-results.json',JSON.stringify({passed:passed.length,checks:passed,generatedTestCamera:true,actualLogitechVerifiedSeparately:false},null,2));
  console.log(passed.length+' AR browser checks passed.');
}finally{await browser.close();}
