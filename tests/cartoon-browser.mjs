import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const root=process.env.GESTURES_TEST_URL||'http://127.0.0.1:8777/';await mkdir('build/cartoon',{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(root);await page.waitForFunction(()=>window.donutLab?.metrics.frames>5);
 const comic=await page.evaluate(()=>({toon:donutLab.scene.mesh.material.isMeshToonMaterial,outline:donutLab.scene.outline.visible,sameGeometry:donutLab.scene.outline.geometry===donutLab.scene.mesh.geometry,parts:donutLab.scene.group.children.filter(x=>x.userData.artBody).length}));assert.deepEqual(comic,{toon:true,outline:true,sameGeometry:true,parts:1});
 await page.screenshot({path:'build/cartoon/desktop.png'});
 for(const finish of ['chrome','comic','clay','comic']){await page.selectOption('#finish',finish);assert.equal(await page.evaluate(()=>donutLab.scene.outline.visible),finish==='comic');}
 await page.click('#tutorial');const opening=await page.locator('#guide').evaluate(el=>el.getAnimations().map(a=>({duration:a.effect.getTiming().duration,keyframes:a.effect.getKeyframes().length})));assert.ok(opening.some(a=>a.keyframes===3));await page.keyboard.press('Escape');await page.click('#tutorial');await page.keyboard.press('Escape');assert.equal(await page.locator('#guide').isVisible(),false);
 await page.click('#catch');await page.waitForTimeout(300);const puck=await page.evaluate(()=>{const a=document.querySelector('#catch').getBoundingClientRect(),b=document.querySelector('#mode-puck').getBoundingClientRect();return Math.abs(a.left-b.left)+Math.abs(a.width-b.width);});assert.ok(puck<2);
 await page.evaluate(()=>donutLab.catcher.onEvent({type:'catch'}));const burst=await page.locator('#catch-burst').evaluate(el=>{const a=el.getAnimations()[0];a.pause();a.currentTime=180;return{opacity:getComputedStyle(el).opacity,transform:getComputedStyle(el).transform};});assert.ok(Number(burst.opacity)>.5);await page.screenshot({path:'build/cartoon/catch.png'});
 await page.evaluate(()=>donutLab.catcher.onEvent({type:'catch'}));assert.equal(await page.locator('#catch-burst').evaluate(el=>el.getAnimations().length),1);
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(50);await page.evaluate(()=>donutLab.catcher.onEvent({type:'catch'}));const gentle=await page.locator('#catch-burst').evaluate(el=>el.getAnimations()[0].effect.getKeyframes());assert.ok(gentle.every(k=>!k.transform));
 await page.click('#tutorial');assert.equal(await page.locator('#guide').evaluate(el=>el.getAnimations().length),0);await page.keyboard.press('Escape');await page.click('#sculpt');
 await page.setViewportSize({width:390,height:844});await page.locator('#inspector').evaluate(el=>el.open=false);await page.screenshot({path:'build/cartoon/mobile.png'});assert.deepEqual(errors,[]);await writeFile('build/cartoon/results.json',JSON.stringify({comic,opening,puck,burst,reducedMotion:true,errors},null,2));console.log('PASS Comic material, shared contour, finish switching, dialog interruption, mode puck, sampled catch motion, retrigger, reduced motion and mobile render');
}finally{await browser.close();}
