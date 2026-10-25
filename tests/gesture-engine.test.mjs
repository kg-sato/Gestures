import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Works before package.json exists and after the application sets type:module.
const source = await readFile(new URL('../web/gesture-engine.js', import.meta.url), 'utf8');
const { GestureEngine, DrawingScene, AdaptivePointFilter } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function hand({ x = 0.4, y = 0.35, pinch = 'none', label = 'Right', scale = 1 } = {}) {
  const points = Array.from({ length: 21 }, () => ({ x, y: y + 0.15 * scale, z: 0 }));
  const put = (index, dx, dy) => { points[index] = { x: x + dx * scale, y: y + dy * scale, z: 0 }; };
  put(0, 0, 0.4); put(5, -0.09, 0.22); put(9, 0, 0.2); put(17, 0.12, 0.25);
  put(8, 0, 0); put(12, 0.14, -0.02); put(4, -0.2, 0.15);
  if (pinch === 'index') put(4, 0.012, 0.006);
  if (pinch === 'middle') put(4, 0.145, -0.015);
  return { landmarks: points, handedness: label };
}

const intent = (kind, session, point = { x: 0.3, y: 0.4 }, transform) => ({ kind, session, point, cursor: point, transform });
function line(scene, start = { x: 0.2, y: 0.3 }, end = { x: 0.6, y: 0.5 }) {
  scene.beginStroke(start); scene.appendStroke(end); scene.endStroke();
}

test('hand gestures distinguish hover, index draw, middle erase and loss', () => {
  const engine = new GestureEngine();
  assert.equal(engine.update([hand()], 100).kind, 'hover');
  assert.equal(engine.update([hand({ pinch: 'index' })], 150).kind, 'draw');
  assert.equal(engine.update([hand({ pinch: 'middle' })], 200).kind, 'erase');
  const lost = engine.update([], 250);
  assert.equal(lost.kind, 'lost'); assert.equal(lost.cursor, null);
});

test('pinch threshold scales with palm size and has release hysteresis', () => {
  for (const scale of [0.5, 1, 1.5]) {
    const engine = new GestureEngine();
    const closed = hand({ pinch: 'index', scale });
    assert.equal(engine.update([closed], 100).kind, 'draw');
    const palm = engine.tracks[0].palm;
    const borderline = hand({ scale });
    borderline.landmarks[4] = { ...borderline.landmarks[8], x: borderline.landmarks[8].x + palm * 0.37 / engine.aspectRatio };
    assert.equal(engine.update([borderline], 150).kind, 'draw', 'pinch does not chatter in deadband');
    engine.update([hand({ scale })], 200);
    assert.equal(engine.update([borderline], 250).kind, 'hover', 'deadband does not engage a new pinch');
  }
});

test('middle pinch uses the middle fingertip, without dragging the index cursor across', () => {
  const engine = new GestureEngine();
  engine.update([hand({pinch:'index'})],100);
  const middle = hand({pinch:'middle'});
  const result = engine.update([middle],150);
  assert.equal(result.kind,'erase');
  assert.deepEqual(result.cursor,{x:middle.landmarks[12].x,y:middle.landmarks[12].y});
  assert.equal(result.hands[0].cursorFinger,12);
});

test('both-near pinches select the nearer finger; an ambiguous contact does not draw', () => {
  const engine = new GestureEngine();
  const middle = hand({pinch:'middle'});
  middle.landmarks[8]={...middle.landmarks[4],x:middle.landmarks[4].x+0.025};
  assert.equal(engine.update([middle],100).kind,'erase','folded index does not steal middle pinch');
  const ambiguous = hand();
  ambiguous.landmarks[4]={x:0.4,y:0.35,z:0};
  ambiguous.landmarks[8]={x:0.395,y:0.35,z:0};
  ambiguous.landmarks[12]={x:0.405,y:0.35,z:0};
  const result=engine.update([ambiguous],150);
  assert.equal(result.kind,'hover');
  assert.equal(result.ambiguous,true);
  assert.equal(result.hands[0].indexPinch,false);
  assert.equal(result.hands[0].middlePinch,false);
});

test('invalid landmarks and long tracking gaps cannot connect strokes', () => {
  const engine = new GestureEngine(), scene = new DrawingScene();
  scene.consume(engine.update([hand({ pinch: 'index' })], 100));
  const originalSession = engine.session;
  scene.consume(engine.update([hand({ pinch: 'index', x: 0.45 })], 150));
  const broken = hand(); broken.landmarks[8].x = NaN;
  assert.equal(engine.update([broken], 200).kind, 'lost');
  scene.consume(engine.update([hand({ pinch: 'index', x: 0.6 })], 800));
  assert.notEqual(engine.session, originalSession);
  assert.equal(scene.strokes.length, 2);
  assert.equal(scene.strokes[1].points.length, 1);
});

test('stable hand identity survives detector result reorder', () => {
  const engine = new GestureEngine();
  const left = hand({ x: 0.2, label: 'Left' }), right = hand({ x: 0.7, pinch: 'index' });
  const a = engine.update([left, right], 100);
  const b = engine.update([right, left], 150);
  assert.equal(a.session, b.session);
  assert.deepEqual(a.hands.map((h) => h.id), b.hands.map((h) => h.id));
  assert.ok(Math.abs(a.cursor.x - b.cursor.x) < 0.001);
});

test('two pinches produce growth, shrink, translation and a reset baseline', () => {
  const engine = new GestureEngine();
  const pair = (a, b) => [hand({ x: a, pinch: 'index', label: 'Left' }), hand({ x: b, pinch: 'index' })];
  const first = engine.update(pair(0.3, 0.7), 100);
  assert.equal(first.kind, 'transform'); assert.equal(first.transform.scale, 1);
  const grow = engine.update(pair(0.25, 0.75), 150);
  assert.ok(grow.transform.scale > 1);
  const shrink = engine.update(pair(0.3, 0.7), 200);
  assert.ok(shrink.transform.scale < 1);
  const move = engine.update(pair(0.35, 0.75), 250);
  assert.ok(move.transform.translation.x > 0);
  engine.update([], 300);
  assert.equal(engine.update(pair(0.2, 0.8), 350).transform.scale, 1);
});

test('adaptive smoothing reduces stationary noise without depending on frame count', () => {
  const filter = new AdaptivePointFilter();
  filter.update({ x: 0.5, y: 0.5 }, 100);
  const next = filter.update({ x: 0.51, y: 0.49 }, 130);
  assert.ok(next.x > 0.5 && next.x < 0.51);
  assert.ok(next.y < 0.5 && next.y > 0.49);
  assert.deepEqual(filter.update({ x: 0.9, y: 0.1 }, 1000), { x: 0.9, y: 0.1 });
});

test('pinch sessions form separate strokes; undo/redo operates on whole strokes', () => {
  const scene = new DrawingScene();
  scene.consume(intent('draw', 1));
  scene.consume(intent('draw', 1, { x: 0.4, y: 0.4 }));
  scene.consume(intent('hover', 2));
  scene.consume(intent('draw', 3, { x: 0.6, y: 0.4 }));
  assert.equal(scene.strokes.length, 2);
  assert.equal(scene.strokes[0].points.length, 2);
  assert.ok(scene.undo()); assert.equal(scene.strokes.length, 1);
  assert.ok(scene.redo()); assert.equal(scene.strokes.length, 2);
});

test('erase hits the line segment between sampled fingertips and is undoable', () => {
  const scene = new DrawingScene();
  line(scene, { x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 });
  assert.ok(scene.eraseAt({ x: 0.5, y: 0.51 }));
  assert.equal(scene.strokes.length, 0);
  scene.undo(); assert.equal(scene.strokes.length, 1);
  assert.equal(scene.eraseAt({ x: 0.5, y: 0.8 }), false);
});

test('continuous gesture erase makes one undo group', () => {
  const scene = new DrawingScene();
  line(scene, { x: 0.2, y: 0.3 }, { x: 0.3, y: 0.3 });
  line(scene, { x: 0.7, y: 0.3 }, { x: 0.8, y: 0.3 });
  const history = scene.history.length;
  scene.consume(intent('erase', 10, { x: 0.25, y: 0.3 }));
  scene.consume(intent('erase', 10, { x: 0.75, y: 0.3 }));
  assert.equal(scene.strokes.length, 0);
  assert.equal(scene.history.length, history + 1);
  scene.undo(); assert.equal(scene.strokes.length, 2);
});

test('two-hand resize changes actual geometry and groups its history', () => {
  const scene = new DrawingScene();
  line(scene, { x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 });
  const original = scene.serialize();
  const t = { center: { x: 0.5, y: 0.5 }, translation: { x: 0, y: 0 }, scale: 1.2, rotation: 0 };
  scene.consume(intent('transform', 9, null, t));
  scene.consume(intent('transform', 9, null, t));
  assert.ok(scene.bounds().width > 0.28);
  scene.undo(); assert.deepEqual(scene.serialize(), original);
});

test('select tool moves only the hit stroke', () => {
  const scene = new DrawingScene();
  line(scene, { x: 0.2, y: 0.3 }, { x: 0.3, y: 0.3 });
  line(scene, { x: 0.7, y: 0.7 }, { x: 0.8, y: 0.7 });
  const untouched = JSON.stringify(scene.strokes[1]);
  scene.consume(intent('draw', 10, { x: 0.25, y: 0.3 }), { tool: 'select' });
  scene.consume(intent('draw', 10, { x: 0.35, y: 0.4 }), { tool: 'select' });
  assert.ok(Math.abs(scene.strokes[0].points[0].x - 0.3) < 0.001);
  assert.equal(JSON.stringify(scene.strokes[1]), untouched);
});

test('clear can be undone, and editing after undo invalidates redo', () => {
  const scene = new DrawingScene(); line(scene);
  const before = scene.serialize();
  scene.clear(); assert.equal(scene.strokes.length, 0);
  scene.undo(); assert.deepEqual(scene.serialize(), before);
  line(scene); assert.equal(scene.canRedo, false);
});

test('documents round-trip and invalid imports preserve existing work', () => {
  const scene = new DrawingScene(); line(scene);
  const before = scene.serialize();
  const copy = new DrawingScene().restore(JSON.stringify(before));
  assert.deepEqual(copy.serialize(), before);
  for (const mutation of [
    (d) => { d.version = 99; },
    (d) => { d.strokes[0].points[0].x = 'NaN'; },
    (d) => { d.strokes[0].points[0].x = 1000; },
    (d) => { d.strokes[0].width = 0; },
    (d) => { d.strokes[0].color = '<script>'; },
    (d) => { d.strokes.push(structuredClone(d.strokes[0])); },
  ]) {
    const invalid = structuredClone(before); mutation(invalid);
    assert.throws(() => scene.restore(invalid));
    assert.deepEqual(scene.serialize(), before);
  }
});

test('transform and movement reject non-finite geometry', () => {
  const scene = new DrawingScene(); line(scene);
  const before = scene.serialize();
  assert.equal(scene.transform({ scale: NaN }), false);
  assert.equal(scene.transform({ translation: { x: Infinity, y: 0 } }), false);
  assert.equal(scene.transform({ scale: 0 }), false);
  assert.deepEqual(scene.serialize(), before);
});
