import test from 'node:test';
import assert from 'node:assert/strict';
import {EffectInput} from '../web/effect-input.js';
import {hand} from './fixtures/jelly-hands.mjs';

const pose = (name, x = .5, label = 'Left') => hand(x, .5, name, label);
const begin = (model, start = 0, hands = [pose('pinch')]) => {
  model.update(hands, start);
  model.update(hands, start + 110);
};
const release = (model, start = 130, hands = [pose('open')]) => {
  model.update(hands, start);
  model.update(hands, start + 80);
};

test('confirmed pinch and open release cycle once, while brief pinches do nothing', () => {
  const model = new EffectInput();
  model.update([pose('pinch')], 0);
  model.update([pose('open')], 40);
  assert.equal(model.state.palette, 0);
  begin(model, 100);
  assert.equal(model.state.hands[0].pinching, true);
  model.update([pose('open')], 230);
  assert.equal(model.state.palette, 0);
  model.update([pose('open')], 300);
  assert.equal(model.state.palette, 1);
  model.update([pose('open')], 350);
  assert.equal(model.state.palette, 1);
});

test('particle scatter has a bounded envelope and morphs only on a confirmed release', () => {
  const model = new EffectInput();
  model.setMode('particles', 0);
  model.update([pose('open')], 0);
  begin(model, 20);
  model.tick(220);
  assert.ok(model.state.scatter > 0 && model.state.scatter < 1);
  release(model, 230);
  assert.equal(model.state.morphIndex, 1);
  model.tick(1000);
  assert.ok(model.state.scatter < .01);
  assert.equal(model.state.morphIndex, 1);
});

test('explicit tracking loss cancels without release and requires open before reacquisition', () => {
  const model = new EffectInput();
  begin(model);
  model.update([], 130);
  assert.equal(model.state.hands.length, 0);
  assert.equal(model.state.palette, 0);
  begin(model, 160);
  assert.equal(model.state.hands[0].pinching, false);
  release(model, 280);
  assert.equal(model.state.palette, 0);
  begin(model, 380);
  release(model, 510);
  assert.equal(model.state.palette, 1);
});

test('silence expires hand state and a returning held pinch cannot advance a morph', () => {
  const model = new EffectInput();
  model.setMode('particles', 0);
  model.update([pose('open')], 0);
  begin(model, 20);
  model.tick(400);
  assert.equal(model.state.hands.length, 0);
  begin(model, 420);
  release(model, 550);
  assert.equal(model.state.morphIndex, 0);
  assert.ok(model.state.scatter <= 1);
});

test('mode change and lifecycle cancellation never act as release', () => {
  const model = new EffectInput();
  begin(model);
  model.setMode('riso', 120);
  release(model, 130);
  assert.equal(model.state.palette, 0);
  begin(model, 250);
  model.cancel(370);
  release(model, 380);
  assert.equal(model.state.palette, 0);
  begin(model, 490);
  release(model, 620);
  assert.equal(model.state.palette, 1);
});

test('detection reordering and labeled crossing keep stable identities', () => {
  const model = new EffectInput();
  model.update([pose('open', .3, 'Left'), pose('open', .7, 'Right')], 0);
  const [leftId, rightId] = model.state.hands.map(item => item.id);
  model.update([pose('open', .6, 'Right'), pose('open', .4, 'Left')], 80);
  model.update([pose('open', .48, 'Right'), pose('open', .52, 'Left')], 160);
  model.update([pose('open', .38, 'Right'), pose('open', .62, 'Left')], 240);
  assert.deepEqual(model.state.hands.map(item => item.id), [leftId, rightId]);
  assert.ok(model.state.hands[0].x > model.state.hands[1].x);
});

test('losing one of two pinched hands cancels the entire action', () => {
  const model = new EffectInput();
  const pair = [pose('pinch', .3, 'Left'), pose('pinch', .7, 'Right')];
  begin(model, 0, pair);
  model.update([pair[0]], 140);
  release(model, 170, [pose('open', .3, 'Left')]);
  assert.equal(model.state.palette, 0);
});

test('a handedness identity replacement cancels rather than inheriting release', () => {
  const model = new EffectInput();
  begin(model);
  release(model, 130, [pose('open', .5, 'Right')]);
  assert.equal(model.state.palette, 0);
});

test('two-hand framing is bounded, velocities decay, invalid and old frames are safe', () => {
  const model = new EffectInput();
  model.update([pose('open', .2), pose('open', .8, 'Right')], 0);
  const narrow = model.state.window.width;
  model.update([pose('open', -.1), pose('open', 1.1, 'Right')], 100);
  const state = model.state;
  assert.ok(state.window.width > narrow);
  assert.ok(state.window.cx - state.window.width / 2 >= 0);
  assert.ok(state.window.cx + state.window.width / 2 <= 1);
  assert.ok(state.separation >= 0 && state.separation <= 1);
  const velocity = Math.abs(state.hands[0].vx);
  assert.ok(velocity <= 3);
  model.tick(160);
  assert.ok(Math.abs(model.state.hands[0].vx) < velocity);
  const before = JSON.stringify(model.state);
  model.update([pose('open')], 80);
  model.tick(NaN);
  assert.equal(JSON.stringify(model.state), before);
  const invalid = pose('open');
  invalid.landmarks[0].x = Infinity;
  model.update([null, invalid, {landmarks: []}], 170);
  assert.equal(model.state.hands.length, 0);
  assert.ok(!JSON.stringify(model.state).includes('null'));
  assert.throws(() => model.setMode('unknown', 180));
});

test('state snapshots cannot mutate internal gesture data', () => {
  const model = new EffectInput();
  model.update([pose('open')], 0);
  const state = model.state;
  state.window.width = Infinity;
  state.hands[0].x = NaN;
  assert.ok(Number.isFinite(model.state.window.width));
  assert.ok(Number.isFinite(model.state.hands[0].x));
});
