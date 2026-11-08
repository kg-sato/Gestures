import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {hand} from './fixtures/jelly-hands.mjs';

// The camera and landmarks below are generated fixtures, never physical hardware.
const modes = ['cover', 'riso', 'crt', 'dither', 'liquid', 'particles'];
const origin = process.env.GESTURES_TEST_URL || 'http://127.0.0.1:8777/';
const output = 'build/effects-browser';
await mkdir(output, {recursive: true});
const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--use-fake-device-for-media-stream'],
});
const checks = [], errors = [], external = [], timings = {};
let failure;
const pass = text => { checks.push(text); console.log('PASS ' + text); };
const summarize = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return {samples: sorted.length, median: sorted[Math.floor(sorted.length / 2)] ?? null,
    p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))] ?? null};
};

try {
  const context = await browser.newContext({permissions: ['camera'], reducedMotion: 'no-preference', viewport: {width: 1440, height: 900}});
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => {
    const url = request.url();
    if (!url.startsWith(new URL(origin).origin + '/') && !url.startsWith('blob:') && !url.startsWith('data:')) external.push(url);
  });
  await page.goto(origin);
  await page.waitForFunction(() => window.effectsLab?.metrics.frames > 5);
  assert.equal(await page.locator('[data-mode]').count(), 6);
  assert.deepEqual(await page.locator('[data-mode]').evaluateAll(nodes => nodes.map(node => node.dataset.mode)), modes);
  assert.equal(await page.locator('#studio,#inspector,#catch,#sculpt,#status,input[type=range],#comic,#reaction').count(), 0);
  assert.equal(await page.locator('#intro').isVisible(), true);
  await page.screenshot({path: `${output}/desktop-intro.png`});
  await page.click('#dismiss');
  await page.click('#connect');
  await page.waitForFunction(() => effectsLab.connected && effectsLab.metrics.inferences > 0, null, {timeout: 60000});
  assert.equal(await page.locator('#intro').isVisible(), false);
  const capture = await page.evaluate(() => {
    const lab = effectsLab, track = lab.camera.stream.getVideoTracks()[0];
    window.__testTrack = track;
    return {stream: lab.camera.stream.id, settings: track.getSettings(), videoWidth: lab.camera.video.videoWidth, videoHeight: lab.camera.video.videoHeight};
  });
  assert.ok(capture.videoWidth > 0 && capture.videoHeight > 0);
  assert.equal(capture.videoWidth, capture.settings.width);
  assert.equal(capture.videoHeight, capture.settings.height);
  pass('Six selectable camera effects replace the jelly; generated camera and local MediaPipe initialize');

  for (const mode of modes) {
    await page.click(`[data-mode="${mode}"]`);
    await page.waitForFunction(mode => effectsLab.mode === mode, mode);
    assert.equal(await page.locator(`[data-mode="${mode}"]`).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-mode][aria-pressed="true"]').count(), 1);
    assert.equal(await page.evaluate(() => effectsLab.camera.stream.id), capture.stream);
    const timing = await page.evaluate(() => ({frame: effectsLab.metrics.frames, start: performance.now()}));
    await page.waitForFunction(frame => effectsLab.metrics.frames >= frame + 12, timing.frame, {timeout: 15000});
    timings[mode] = await page.evaluate(({start, frame}) => ({elapsedMs: performance.now() - start, renderedFrames: effectsLab.metrics.frames - frame,
      frameMs: effectsLab.metrics.frameMs.slice(-12)}), timing);
    await page.screenshot({path: `${output}/desktop-${mode}.png`});
  }
  pass('Each selector changes the active mode and selected state while retaining the same live stream');

  // Compare all shaders against precisely the same camera-like source, not a moving fake feed.
  const renderedFixture = await page.evaluate(async modes => {
    const source = document.createElement('canvas'); source.width = 640; source.height = 400;
    const pen = source.getContext('2d'), gradient = pen.createLinearGradient(0, 0, 640, 400);
    gradient.addColorStop(0, '#283c65'); gradient.addColorStop(.48, '#bd8d73'); gradient.addColorStop(1, '#e8d79b');
    pen.fillStyle = gradient; pen.fillRect(0, 0, 640, 400);
    // Original vector portrait: skin gradients, hair and small features expose
    // crushed shadows, lost facial detail and excessive ink registration.
    pen.fillStyle = '#202027'; pen.fillRect(230, 250, 180, 150);
    pen.fillStyle = '#ac755b'; pen.fillRect(300, 220, 40, 50);
    const skin = pen.createLinearGradient(258, 90, 385, 230);
    skin.addColorStop(0, '#eac2a7'); skin.addColorStop(.5, '#bd8d73'); skin.addColorStop(1, '#95614d');
    pen.fillStyle = skin; pen.beginPath(); pen.ellipse(320, 157, 65, 86, 0, 0, Math.PI * 2); pen.fill();
    pen.fillStyle = '#202027'; pen.beginPath(); pen.ellipse(320, 94, 68, 35, -.13, Math.PI, Math.PI * 2); pen.fill();
    pen.beginPath(); pen.moveTo(253, 113); pen.lineTo(270, 77); pen.lineTo(373, 82); pen.lineTo(388, 124); pen.lineTo(350, 107); pen.lineTo(278, 116); pen.closePath(); pen.fill();
    for (const x of [294, 347]) {
      pen.fillStyle = '#352d28'; pen.fillRect(x - 12, 137, 26, 5);
      pen.fillStyle = '#f3e5d8'; pen.beginPath(); pen.ellipse(x, 153, 12, 6, 0, 0, Math.PI * 2); pen.fill();
      pen.fillStyle = '#262a28'; pen.beginPath(); pen.arc(x, 153, 4, 0, Math.PI * 2); pen.fill();
    }
    pen.strokeStyle = '#855743'; pen.lineWidth = 3; pen.beginPath(); pen.moveTo(321, 154); pen.lineTo(315, 183); pen.lineTo(328, 183); pen.stroke();
    pen.strokeStyle = '#8b4a46'; pen.lineWidth = 4; pen.beginPath(); pen.moveTo(299, 204); pen.quadraticCurveTo(321, 214, 342, 201); pen.stroke();
    pen.fillStyle = skin; pen.fillRect(80, 110, 50, 110);
    for (let finger = 0; finger < 4; finger++) pen.fillRect(78 + finger * 14, 75 - (finger % 3) * 8, 10, 75);
    pen.fillStyle = '#faf5e8'; pen.font = 'bold 42px sans-serif'; pen.fillText('GESTURES', 24, 360);
    const bitmap = await createImageBitmap(source); window.__testBitmap = bitmap;
    effectsLab.effects.setFrame(bitmap);
    const sample = document.createElement('canvas'); sample.width = 64; sample.height = 40;
    const samplePen = sample.getContext('2d', {willReadFrequently: true}), results = {}, snapshots = {source: source.toDataURL('image/png')};
    const pixels = () => {
      samplePen.drawImage(document.querySelector('#fx'), 0, 0, 64, 40);
      return Array.from(samplePen.getImageData(0, 0, 64, 40).data).filter((_, i) => i % 4 !== 3);
    };
    const image = () => document.querySelector('#fx').toDataURL('image/png');
    const difference = (a, b) => a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length;
    const baseState = {...effectsLab.input.state, palette: 0, separation: .65,
      window: {cx: .5, cy: .52, width: .62, height: .62}, hands: [], scatter: 0, morphIndex: 0};
    samplePen.save(); samplePen.translate(64, 0); samplePen.scale(-1, 1);
    samplePen.drawImage(source, 0, 0, 64, 40); samplePen.restore();
    const expectedCamera = Array.from(samplePen.getImageData(0, 0, 64, 40).data).filter((_, i) => i % 4 !== 3);
    effectsLab.effects.render(1 / 60, 990, {...baseState, mode: 'liquid'}, true);
    const sourceMapping = difference(pixels(), expectedCamera);
    const otherSize = document.createElement('canvas'); otherSize.width = 128; otherSize.height = 128;
    const otherPen = otherSize.getContext('2d'); otherPen.fillStyle = 'rgb(49,93,167)'; otherPen.fillRect(0, 0, 128, 128);
    const otherBitmap = await createImageBitmap(otherSize);
    effectsLab.effects.setFrame(otherBitmap);
    effectsLab.effects.render(1 / 60, 991, {...baseState, mode: 'liquid'}, true);
    const resizedPixels = pixels(), expectedSolid = resizedPixels.map((_, index) => [49, 93, 167][index % 3]);
    const resizedCapture = difference(resizedPixels, expectedSolid);
    effectsLab.effects.setFrame(bitmap); otherBitmap.close();
    for (const mode of modes) {
      const state = {...baseState, mode};
      // Let a mode's transitions settle while preserving one identical input image.
      for (let i = 0; i < 30; i++) effectsLab.effects.render(1 / 60, 1000 + i * 17, state, false);
      results[mode] = pixels();
      snapshots[mode] = image();
    }
    const dither = [];
    for (let palette = 0; palette < 4; palette++) {
      effectsLab.effects.render(1 / 60, 2000, {...baseState, mode: 'dither', palette}, false);
      dither.push(pixels());
      snapshots[`dither-palette-${palette}`] = image();
    }
    const liquid = {...baseState, mode: 'liquid'};
    effectsLab.effects.render(1 / 60, 2000, liquid, false);
    const liquidBaseline = pixels();
    for (let i = 0; i < 24; i++) effectsLab.effects.render(1 / 60, 2000 + i * 17,
      {...liquid, hands: [{id: 1, x: .28 + i * .018, y: .48, vx: 2, vy: .8, pinching: false}]}, false);
    const liquidMoved = pixels(); snapshots['liquid-motion'] = image();
    effectsLab.effects.render(1 / 60, 2410, liquid, true);
    const liquidReduced = pixels(); snapshots['liquid-reduced'] = image();
    for (let i = 0; i < 240; i++) effectsLab.effects.render(1 / 60, 2427 + i * 17, liquid, false);
    const liquidSettled = pixels(); snapshots['liquid-settled'] = image();
    const particles = {...baseState, mode: 'particles'};
    effectsLab.effects.render(1 / 60, 7000, particles, false);
    const particleRest = pixels();
    effectsLab.effects.render(1 / 60, 7000, {...particles, scatter: .85}, false);
    const particleScatter = pixels(); snapshots['particles-scatter-fixture'] = image();
    effectsLab.effects.render(1 / 60, 7000, {...particles, scatter: .85, morphIndex: 1}, true);
    snapshots['particles-reduced-fixture'] = image();
    const particleReduced = {...effectsLab.effects.diagnostics};
    return {signatures: results, snapshots, renderChecks: {sourceMapping, resizedCapture,
      ditherEvenRepeat: difference(dither[0], dither[2]), ditherOddRepeat: difference(dither[1], dither[3]),
      ditherInversion: difference(dither[0], dither[1]), liquidMovement: difference(liquidBaseline, liquidMoved),
      liquidReduced: difference(liquidBaseline, liquidReduced), liquidDecay: difference(liquidBaseline, liquidSettled),
      particleMovement: difference(particleRest, particleScatter), particleReduced,
    }};
  }, modes);
  const {signatures, renderChecks} = renderedFixture;
  assert.ok(renderChecks.sourceMapping < 4, `Camera crop/mirror must fill the output with the current source (${renderChecks.sourceMapping})`);
  assert.ok(renderChecks.resizedCapture < 1, `Changing capture dimensions must replace all old GPU pixels (${renderChecks.resizedCapture})`);
  for (const [name, dataUrl] of Object.entries(renderedFixture.snapshots)) {
    await writeFile(`${output}/fixture-${name}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
  }
  const pairDifferences = {};
  for (let a = 0; a < modes.length; a++) for (let b = a + 1; b < modes.length; b++) {
    const left = signatures[modes[a]], right = signatures[modes[b]];
    const difference = left.reduce((sum, channel, i) => sum + Math.abs(channel - right[i]), 0) / left.length;
    pairDifferences[`${modes[a]}/${modes[b]}`] = difference;
    assert.ok(difference > 1, `${modes[a]} and ${modes[b]} rendered indistinguishably (${difference})`);
  }
  for (const [mode, signature] of Object.entries(signatures)) {
    assert.ok(Math.max(...signature) - Math.min(...signature) > 30, `${mode} must contain image detail rather than a flat canvas`);
  }
  assert.ok(renderChecks.ditherEvenRepeat < .01 && renderChecks.ditherOddRepeat < .01,
    `Every second dither state must return to the same pixels: ${JSON.stringify(renderChecks)}`);
  assert.ok(renderChecks.ditherInversion > 10, 'Every adjacent dither state must reverse ink/paper polarity');
  assert.ok(renderChecks.liquidMovement > .3, `Moving hands must visibly displace camera pixels (${renderChecks.liquidMovement})`);
  assert.ok(renderChecks.liquidReduced < .05, `Reduced liquid must match clean camera pixels (${renderChecks.liquidReduced})`);
  assert.ok(renderChecks.liquidDecay < .1 && renderChecks.liquidDecay < renderChecks.liquidMovement * .1,
    `Liquid displacement must decay back to the image (${renderChecks.liquidDecay})`);
  assert.ok(renderChecks.particleMovement > .3, `Scatter must visibly move particle pixels (${renderChecks.particleMovement})`);
  assert.equal(renderChecks.particleReduced.scatter, 0);
  assert.equal(renderChecks.particleReduced.morphProgress, 1);
  pass('Dither alternates on every cycle; liquid moves then decays and reduced motion suppresses displacement/scatter');
  await page.waitForTimeout(100);
  await page.evaluate(() => { window.__testBitmap.close(); delete window.__testBitmap; });
  pass('All six renderers produce distinct detailed pixels from the same fixed camera fixture');

  await page.evaluate(() => effectsLab.setSyntheticInput(true));
  const play = async frames => page.evaluate(frames => {
    const lab = effectsLab;
    const base = Math.max(performance.now(), window.__syntheticTime ?? 0) + 10;
    for (const frame of frames) { window.__syntheticTime = base + frame.at; lab.applyHands(frame.hands, window.__syntheticTime); }
    return structuredClone(lab.input.state);
  }, frames);
  const pinch = hand(.5, .55, 'pinch'), open = hand(.5, .55, 'open');
  const confirmedPinch = [{at: 0, hands: [open]}, {at: 20, hands: [pinch]}, {at: 150, hands: [pinch]}, {at: 200, hands: [open]}, {at: 290, hands: [open]}];
  for (const mode of ['cover', 'riso', 'dither']) {
    await page.click(`[data-mode="${mode}"]`);
    const before = await page.evaluate(() => effectsLab.input.state.palette);
    const after = await play(confirmedPinch);
    assert.notEqual(after.palette, before, `${mode} must change palette/polarity after a confirmed release`);
    const repeat = await play([{at: 0, hands: [open]}, {at: 90, hands: [open]}]);
    assert.equal(repeat.palette, after.palette, `${mode} must not repeat an open-hand release`);
  }
  pass('Raw pinch landmarks cycle cover/riso palettes and print polarity once per confirmed release');

  await page.click('[data-mode="particles"]');
  const initialMorph = await page.evaluate(() => effectsLab.input.state.morphIndex);
  const held = await play([{at: 0, hands: [open]}, {at: 20, hands: [pinch]}, {at: 150, hands: [pinch]}, {at: 320, hands: [pinch]}]);
  assert.equal(held.morphIndex, initialMorph);
  assert.ok(held.scatter > 0, 'A held pinch should scatter the current form');
  await page.screenshot({path: `${output}/particles-held.png`});
  const released = await play([{at: 0, hands: [open]}, {at: 90, hands: [open]}, {at: 230, hands: [open]}]);
  assert.notEqual(released.morphIndex, initialMorph, 'Confirmed release should advance one particle form');
  assert.ok(released.scatter < held.scatter, 'Release should reduce scatter');
  await page.screenshot({path: `${output}/particles-released.png`});
  await play([{at: 0, hands: [pinch]}, {at: 130, hands: [pinch]}]);
  const lossBefore = await page.evaluate(() => effectsLab.input.state.morphIndex);
  const lost = await play([{at: 0, hands: []}, {at: 350, hands: []}]);
  assert.equal(lost.morphIndex, lossBefore, 'Tracking loss must not manufacture a morph');
  await play([{at: 0, hands: [open]}, {at: 30, hands: [pinch]}, {at: 150, hands: [pinch]}]);
  await page.click('[data-mode="riso"]');
  const switched = await page.evaluate(() => effectsLab.input.state.palette);
  const afterSwitch = await play([{at: 0, hands: [open]}, {at: 90, hands: [open]}]);
  assert.equal(afterSwitch.palette, switched, 'Switching while pinched must not manufacture a palette event');
  pass('Particle hold scatters and release morphs; tracking loss and mode changes cancel without synthetic release');

  await page.click('[data-mode="cover"]');
  const narrow = await play([{at: 0, hands: [hand(.42, .55), hand(.58, .55, 'open', 'Right')]}, {at: 90, hands: [hand(.42, .55), hand(.58, .55, 'open', 'Right')]}]);
  const wide = await play([{at: 0, hands: [hand(.2, .45), hand(.8, .65, 'open', 'Right')]}, {at: 90, hands: [hand(.2, .45), hand(.8, .65, 'open', 'Right')]}]);
  assert.ok(wide.separation > narrow.separation);
  assert.ok(wide.window.width > narrow.window.width);
  await page.screenshot({path: `${output}/cover-framed.png`});
  pass('Two raw hand landmarks resize the cover window and adjust bounded separation');

  await page.emulateMedia({reducedMotion: 'reduce'});
  for (const mode of modes) {
    await page.click(`[data-mode="${mode}"]`);
    await page.waitForTimeout(100);
    await page.screenshot({path: `${output}/reduced-${mode}.png`});
  }
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.evaluate(() => effectsLab.setSyntheticInput(false));
  pass('Every mode renders with reduced-motion preferences without errors');

  const first = page.locator('[data-mode]').first();
  await first.focus();
  await page.keyboard.press('Enter');
  assert.equal(await first.getAttribute('aria-pressed'), 'true');
  assert.equal(await first.evaluate(node => node === document.activeElement), true);
  assert.equal(await first.evaluate(node => getComputedStyle(node).outlineStyle !== 'none' && parseFloat(getComputedStyle(node).outlineWidth) > 0), true);
  pass('Effect buttons support keyboard activation and visible focus');

  for (const [name, width, height] of [['tablet', 768, 1024], ['phone', 390, 844]]) {
    await page.setViewportSize({width, height});
    for (const mode of modes) {
      await page.click(`[data-mode="${mode}"]`);
      await page.waitForTimeout(120);
      await page.screenshot({path: `${output}/${name}-${mode}.png`});
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} must not overflow horizontally`);
    for (const locator of [page.locator('#connect'), page.locator('#device'), page.locator('#fullscreen'), ...await page.locator('[data-mode]').all()]) {
      const bounds = await locator.boundingBox();
      assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= width + 1 && bounds.y >= -1 && bounds.y + bounds.height <= height + 1, `${name} control must fit viewport`);
    }
  }
  pass('All six effects and essential controls fit tablet and phone viewports');

  await page.click('#connect');
  assert.equal(await page.evaluate(() => effectsLab.connected), false);
  assert.equal(await page.evaluate(() => effectsLab.camera.stream), null);
  assert.equal(await page.evaluate(() => window.__testTrack.readyState), 'ended');
  assert.equal(await page.locator('#intro').isVisible(), false);
  await page.click('#connect');
  await page.waitForFunction(() => effectsLab.connected, null, {timeout: 30000});
  assert.notEqual(await page.evaluate(() => effectsLab.camera.stream.id), capture.stream);
  await page.click('#connect');
  pass('Disconnect ends the actual generated track; reconnect creates a fresh stream without reopening the intro');

  await page.reload();
  assert.equal(await page.locator('#intro').isVisible(), true);
  const introBounds = await page.locator('#intro').boundingBox();
  assert.ok(introBounds.x >= 0 && introBounds.x + introBounds.width <= 391 && introBounds.y >= 0 && introBounds.y + introBounds.height <= 845);
  await page.screenshot({path: `${output}/phone-intro.png`});
  await page.click('#dismiss');
  assert.equal(await page.locator('#intro').isVisible(), false);
  pass('The introduction fits a phone, dismisses once per load and returns only after reload');

  await page.evaluate(() => {
    const devices = navigator.mediaDevices;
    window.__getUserMedia = devices.getUserMedia.bind(devices);
    devices.getUserMedia = async () => {throw Object.assign(new Error('Generated permission denial'), {name: 'NotAllowedError'});};
  });
  await page.click('#connect');
  await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('Allow camera access'));
  assert.equal(await page.evaluate(() => effectsLab.camera.stream), null);
  assert.equal(await page.locator('#connect').textContent(), 'Connect camera');
  await page.evaluate(() => {navigator.mediaDevices.getUserMedia = window.__getUserMedia;});
  await page.click('#connect');
  await page.waitForFunction(() => effectsLab.connected, null, {timeout: 30000});
  await page.click('#connect');
  pass('Camera permission denial is readable, releases state and allows a successful retry');

  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  pass('No uncaught JavaScript/shader errors or external application requests');
  const frameSummary = Object.fromEntries(Object.entries(timings).map(([mode, timing]) => [mode, {...timing, frameMs: summarize(timing.frameMs)}]));
  await writeFile(`${output}/timings.json`, JSON.stringify({softwareOnly: true, physicalLatencyMeasured: false, capture, frameSummary, pairDifferences, renderChecks}, null, 2));
} catch (error) {
  failure = error.stack || String(error);
  throw error;
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({checks, errors, external, failure, generatedCamera: true, syntheticLandmarks: true, fixedRenderFixture: true, physicalWebcamVerified: false}, null, 2));
  await browser.close();
}
