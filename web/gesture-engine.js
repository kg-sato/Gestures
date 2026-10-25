/**
 * Gestures' camera-independent interaction and editable vector document.
 *
 * Gesture-painter reference: Tomasz Hawro's MIT-licensed Virtual Painter,
 * https://github.com/thawro/python-virtual-painter/blob/main/src/bin/eval_mediapipe.py
 * (read at blob fe5a58e85f9ae9b412a8ad3f7001df7a147bb874). The fingertip-distance
 * and midpoint primitives below are JavaScript adaptations; drawing state,
 * palm-relative hysteresis, tracking identity, smoothing, transforms and document
 * history are new implementations. MediaPipe landmark indices follow Google's
 * hand model: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
 *
 * MIT License — Copyright (c) 2023 Tomasz Hawro
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clone = (value) => JSON.parse(JSON.stringify(value));
const distance = (a, b, aspect = 1) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const validPoint = (p) => p && finite(p.x) && finite(p.y);
const normalizedPoint = (p) => ({ x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) });

/** A velocity-adaptive first-order filter, in seconds and normalized units. */
export class AdaptivePointFilter {
  constructor({ minCutoff = 2.5, beta = 4, derivativeCutoff = 1 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.derivativeCutoff = derivativeCutoff;
    this.reset();
  }

  reset() { this.value = null; this.raw = null; this.time = null; this.velocity = { x: 0, y: 0 }; }

  update(point, time) {
    if (!this.value || time <= this.time || time - this.time > 450) {
      this.value = { ...point }; this.raw = { ...point }; this.time = time;
      this.velocity = { x: 0, y: 0 };
      return { ...this.value };
    }
    const dt = (time - this.time) / 1000;
    const alpha = (cutoff) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
    const da = alpha(this.derivativeCutoff);
    for (const axis of ['x', 'y']) {
      const velocity = (point[axis] - this.raw[axis]) / dt;
      this.velocity[axis] += da * (velocity - this.velocity[axis]);
      const a = alpha(this.minCutoff + this.beta * Math.abs(this.velocity[axis]));
      this.value[axis] += a * (point[axis] - this.value[axis]);
    }
    this.raw = { ...point }; this.time = time;
    return { ...this.value };
  }
}

/**
 * update([{landmarks: 21 normalized MediaPipe points, handedness}], timestampMs)
 * returns an intent. Coordinates retain input orientation; mirror before calling
 * if you mirror the canvas. Two-hand transforms are INCREMENTAL per update.
 */
export class GestureEngine {
  constructor({ aspectRatio = 4 / 3, pinchOn = 0.30, pinchOff = 0.44, maxGapMs = 450 } = {}) {
    this.aspectRatio = aspectRatio;
    this.pinchOn = pinchOn;
    this.pinchOff = pinchOff;
    this.maxGapMs = maxGapMs;
    this.nextHandId = 0;
    this.session = 0;
    this.reset();
  }

  reset() {
    this.tracks = [];
    this.lastTime = null;
    this.lastKey = '';
    this.transformBase = null;
    this.session += 1;
  }

  update(hands = [], timestampMs = performance.now()) {
    if (!finite(timestampMs)) throw new TypeError('A finite frame timestamp is required');
    if (this.lastTime !== null && (timestampMs <= this.lastTime || timestampMs - this.lastTime > this.maxGapMs)) this.reset();
    this.lastTime = timestampMs;
    const candidates = (Array.isArray(hands) ? hands : []).filter((hand) =>
      Array.isArray(hand?.landmarks) && hand.landmarks.length === 21 && hand.landmarks.every(validPoint)).slice(0, 2);
    // Greedy nearest-wrist matching for at most two hands; sort all pairs so
    // MediaPipe's per-frame list order never decides which hand owns a stroke.
    const pairs = [];
    for (let ci = 0; ci < candidates.length; ci += 1) {
      for (let ti = 0; ti < this.tracks.length; ti += 1) {
        pairs.push({ ci, ti, d: distance(candidates[ci].landmarks[0], this.tracks[ti].wrist, this.aspectRatio) });
      }
    }
    pairs.sort((a, b) => a.d - b.d);
    const assigned = new Map(), used = new Set();
    for (const pair of pairs) {
      if (pair.d < 0.35 && !assigned.has(pair.ci) && !used.has(pair.ti)) {
        assigned.set(pair.ci, this.tracks[pair.ti]); used.add(pair.ti);
      }
    }
    this.tracks = candidates.map((hand, ci) => {
      const track = assigned.get(ci) || { id: ++this.nextHandId, indexPinch: false, middlePinch: false,
        filter: new AdaptivePointFilter() };
      const points = hand.landmarks;
      const palm = Math.max(0.04, (distance(points[5], points[17], this.aspectRatio) + distance(points[0], points[9], this.aspectRatio)) / 2);
      const indexRatio = distance(points[4], points[8], this.aspectRatio) / palm;
      const middleRatio = distance(points[4], points[12], this.aspectRatio) / palm;
      track.indexClosed = indexRatio < (track.indexClosed ? this.pinchOff : this.pinchOn);
      track.middleClosed = middleRatio < (track.middleClosed ? this.pinchOff : this.pinchOn);
      // A folded index can also be close to the thumb during a middle pinch.
      // Resolve by the nearer fingertip; ambiguous contacts lift the pen rather
      // than silently giving index/draw priority and creating unwanted marks.
      let finger = track.indexClosed ? 8 : track.middleClosed ? 12 : null;
      if (track.indexClosed && track.middleClosed) {
        finger = indexRatio + 0.08 < middleRatio ? 8 :
          middleRatio + 0.08 < indexRatio ? 12 : null;
      }
      track.ambiguous = track.indexClosed && track.middleClosed && finger === null;
      track.indexPinch = finger === 8;
      track.middlePinch = finger === 12;
      track.wrist = { ...points[0] };
      track.landmarks = points;
      track.handedness = hand.handedness || '';
      track.palm = palm;
      const cursorFinger = finger === 12 ? 12 : 8;
      if (track.cursorFinger !== cursorFinger) track.filter.reset();
      track.cursorFinger = cursorFinger;
      track.cursor = track.filter.update(normalizedPoint(points[cursorFinger]), timestampMs);
      track.pinchPoint = midpoint(points[4], points[8]);
      return track;
    }).sort((a, b) => a.id - b.id);

    let kind = 'lost', cursor = null, transform = null, activeId = '';
    const pinching = this.tracks.filter((hand) => hand.indexPinch);
    if (pinching.length === 2) {
      kind = 'transform';
      const [a, b] = pinching;
      const center = midpoint(a.pinchPoint, b.pinchPoint);
      const span = distance(a.pinchPoint, b.pinchPoint, this.aspectRatio);
      const angle = Math.atan2(b.pinchPoint.y - a.pinchPoint.y, (b.pinchPoint.x - a.pinchPoint.x) * this.aspectRatio);
      const key = `${a.id}:${b.id}`;
      const previous = this.transformBase?.key === key ? this.transformBase : null;
      const rotation = previous ? Math.atan2(Math.sin(angle - previous.angle), Math.cos(angle - previous.angle)) : 0;
      transform = { center: previous ? previous.center : center,
        translation: previous ? { x: center.x - previous.center.x, y: center.y - previous.center.y } : { x: 0, y: 0 },
        scale: previous && previous.span > 0.08 && span > 0.08 ? clamp(span / previous.span, 0.65, 1.5) : 1,
        rotation: clamp(rotation, -0.3, 0.3), aspectRatio: this.aspectRatio };
      this.transformBase = { key, center, span, angle };
      cursor = center; activeId = key;
    } else if (this.tracks.length) {
      this.transformBase = null;
      // Keep an existing primary hand even when a second idle hand enters.
      const primary = this.tracks.find((hand) => hand.middlePinch && !hand.indexPinch) || pinching[0] || this.tracks[0];
      kind = primary.middlePinch && !primary.indexPinch ? 'erase' : primary.indexPinch ? 'draw' : 'hover';
      cursor = primary.cursor; activeId = String(primary.id);
    } else {
      this.transformBase = null;
    }
    const key = `${kind}:${activeId}`;
    if (key !== this.lastKey) { this.session += 1; this.lastKey = key; }
    return { kind, mode: kind, cursor, point: cursor, session: this.session, transform,
      ambiguous: this.tracks.some((hand) => hand.ambiguous),
      hands: this.tracks.map(({ id, landmarks, handedness, indexPinch, middlePinch, palm, ambiguous, cursorFinger }) =>
        ({ id, landmarks, handedness, indexPinch, middlePinch, palm, ambiguous, cursorFinger })) };
  }
}

const LIMITS = { strokes: 1000, points: 100000, pointsPerStroke: 20000, history: 50 };
const pointToSegment = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
};

/** Editable vector strokes. Width is a fraction of the canvas height. */
export class DrawingScene {
  constructor() {
    this.strokes = []; this.selectedId = null; this.activeId = null;
    this.history = []; this.future = []; this.nextId = 0;
    this.interaction = null; this.revision = 0;
  }

  get canUndo() { return Boolean(this.history.length); }
  get canRedo() { return Boolean(this.future.length); }
  get pointCount() { return this.strokes.reduce((sum, stroke) => sum + stroke.points.length, 0); }

  _snapshot() { return clone({ strokes: this.strokes, selectedId: this.selectedId }); }
  _checkpoint() {
    this.history.push(this._snapshot());
    if (this.history.length > LIMITS.history) this.history.shift();
    this.future = [];
  }

  _load(snapshot) {
    this.strokes = clone(snapshot.strokes); this.selectedId = snapshot.selectedId || null;
    this.activeId = null; this.interaction = null;
    this.revision += 1;
  }

  beginStroke(point, { color = '#a6f6cf', width = 0.006 } = {}) {
    this.endStroke();
    if (!validPoint(point) || this.strokes.length >= LIMITS.strokes || this.pointCount >= LIMITS.points) return null;
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new TypeError('Color must be a six-digit hex color');
    if (!finite(width) || width <= 0 || width > 0.1) throw new TypeError('Invalid brush width');
    this._checkpoint();
    let id;
    do { id = `stroke-${++this.nextId}`; } while (this.strokes.some((item) => item.id === id));
    const stroke = { id, color, width, points: [normalizedPoint(point)] };
    this.strokes.push(stroke); this.activeId = stroke.id; this.selectedId = stroke.id;
    this.revision += 1;
    return stroke;
  }

  appendStroke(point) {
    const stroke = this.strokes.find((item) => item.id === this.activeId);
    if (!stroke || !validPoint(point) || stroke.points.length >= LIMITS.pointsPerStroke || this.pointCount >= LIMITS.points) return false;
    const p = normalizedPoint(point);
    if (distance(stroke.points.at(-1), p) < 0.0007) return false;
    stroke.points.push(p); this.revision += 1; return true;
  }

  endStroke() { this.activeId = null; }

  hitTest(point, radius = 0.035) {
    if (!validPoint(point)) return null;
    for (let i = this.strokes.length - 1; i >= 0; i -= 1) {
      const stroke = this.strokes[i], tolerance = radius + stroke.width / 2;
      if (stroke.points.length === 1 && distance(point, stroke.points[0]) <= tolerance) return stroke.id;
      for (let j = 1; j < stroke.points.length; j += 1) {
        if (pointToSegment(point, stroke.points[j - 1], stroke.points[j]) <= tolerance) return stroke.id;
      }
    }
    return null;
  }

  eraseAt(point, radius = 0.035, { checkpoint = true } = {}) {
    const hit = this.hitTest(point, radius);
    if (!hit) return false;
    if (checkpoint) this._checkpoint();
    this.strokes = this.strokes.filter((stroke) => stroke.id !== hit);
    if (this.selectedId === hit) this.selectedId = null;
    this.activeId = null; this.revision += 1; return true;
  }

  deleteSelected() {
    if (!this.selectedId || !this.strokes.some((stroke) => stroke.id === this.selectedId)) return false;
    this.endStroke(); this._checkpoint();
    this.strokes = this.strokes.filter((stroke) => stroke.id !== this.selectedId);
    this.selectedId = null; this.revision += 1; return true;
  }

  transform({ center = { x: 0.5, y: 0.5 }, translation = { x: 0, y: 0 }, scale = 1,
    rotation = 0, aspectRatio = 1 } = {}, { selectedOnly = false, checkpoint = true } = {}) {
    if (!validPoint(center) || !validPoint(translation) || !finite(scale) || scale <= 0 || !finite(rotation) || !finite(aspectRatio) || aspectRatio <= 0) return false;
    if (!this.strokes.length) return false;
    const target = selectedOnly ? this.strokes.filter((stroke) => stroke.id === this.selectedId) : this.strokes;
    if (!target.length) return false;
    scale = clamp(scale, 0.1, 10);
    const cos = Math.cos(rotation), sin = Math.sin(rotation);
    // Transform preserves the entire shape instead of clipping each coordinate.
    // A margin permits intentional off-canvas movement; imports remain bounded.
    const changed = target.map((stroke) => ({ ...stroke, width: clamp(stroke.width * scale, 0.0005, 0.1),
      points: stroke.points.map((point) => {
        const x = (point.x - center.x) * aspectRatio, y = point.y - center.y;
        return { x: center.x + ((x * cos - y * sin) * scale) / aspectRatio + translation.x,
          y: center.y + (x * sin + y * cos) * scale + translation.y };
      }) }));
    if (changed.some((stroke) => stroke.points.some((point) => !validPoint(point) || Math.abs(point.x) > 10 || Math.abs(point.y) > 10))) return false;
    const allPoints = changed.flatMap((stroke) => stroke.points);
    if (allPoints.length > 1) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const point of allPoints) {
        minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
      }
      if (Math.max(maxX - minX, maxY - minY) < 0.003) return false;
    }
    if (checkpoint) this._checkpoint();
    const byId = new Map(changed.map((stroke) => [stroke.id, stroke]));
    this.strokes = this.strokes.map((stroke) => byId.get(stroke.id) || stroke);
    this.endStroke(); this.revision += 1; return true;
  }

  consume(intent, { color = '#a6f6cf', width = 0.006, tool = 'draw', eraseRadius = 0.035 } = {}) {
    const kind = intent?.kind || intent?.mode || 'lost';
    const point = intent?.point || intent?.cursor;
    const session = `${intent?.session ?? ''}:${kind}:${tool}`;
    const isNew = this.interaction?.session !== session;
    if (isNew) {
      this.endStroke();
      this.interaction = { session, moved: false, lastPoint: point ? { ...point } : null };
    }
    if (kind === 'draw' && validPoint(point) && tool === 'draw') {
      if (!this.activeId) this.beginStroke(point, { color, width }); else this.appendStroke(point);
    } else if ((kind === 'erase' || (kind === 'draw' && tool === 'erase')) && validPoint(point)) {
      this.endStroke();
      if (!this.interaction.moved && this.hitTest(point, eraseRadius)) { this._checkpoint(); this.interaction.moved = true; }
      this.eraseAt(point, eraseRadius, { checkpoint: false });
    } else if (kind === 'transform' && intent.transform) {
      this.endStroke();
      const t = intent.transform;
      if (Math.abs(t.scale - 1) + Math.abs(t.rotation) + Math.abs(t.translation.x) + Math.abs(t.translation.y) > 0.0001) {
        if (!this.interaction.moved) { this._checkpoint(); this.interaction.moved = true; }
        this.transform(t, { checkpoint: false, selectedOnly: false });
      }
    } else if (kind === 'draw' && validPoint(point) && tool === 'select') {
      this.endStroke();
      if (isNew) this.selectedId = this.hitTest(point);
      const previous = this.interaction.lastPoint;
      if (previous && this.selectedId && distance(previous, point) > 0.0003) {
        if (!this.interaction.moved) { this._checkpoint(); this.interaction.moved = true; }
        this.transform({ translation: { x: point.x - previous.x, y: point.y - previous.y } }, { checkpoint: false, selectedOnly: true });
      }
    } else {
      this.endStroke();
    }
    if (point) this.interaction.lastPoint = { ...point };
    return this;
  }

  bounds({ selectedOnly = false } = {}) {
    const strokes = selectedOnly ? this.strokes.filter((stroke) => stroke.id === this.selectedId) : this.strokes;
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const stroke of strokes) for (const p of stroke.points) {
      left = Math.min(left, p.x); right = Math.max(right, p.x); top = Math.min(top, p.y); bottom = Math.max(bottom, p.y);
    }
    return finite(left) ? { x: left, y: top, width: right - left, height: bottom - top,
      left, right, top, bottom, center: { x: (left + right) / 2, y: (top + bottom) / 2 } } : null;
  }

  clear() {
    this.endStroke();
    if (!this.strokes.length) return false;
    this._checkpoint(); this.strokes = []; this.selectedId = null; this.interaction = null;
    this.revision += 1; return true;
  }

  undo() {
    if (!this.history.length) return false;
    this.future.push(this._snapshot()); this._load(this.history.pop()); return true;
  }

  redo() {
    if (!this.future.length) return false;
    this.history.push(this._snapshot()); this._load(this.future.pop()); return true;
  }

  serialize() { return { version: 1, strokes: clone(this.strokes) }; }

  restore(document, { checkpoint = true } = {}) {
    // Validate completely before mutating an existing drawing.
    const value = typeof document === 'string' ? JSON.parse(document) : document;
    if (!value || value.version !== 1 || !Array.isArray(value.strokes) || value.strokes.length > LIMITS.strokes) throw new TypeError('Unsupported drawing document');
    let count = 0;
    const ids = new Set();
    const strokes = value.strokes.map((stroke) => {
      if (!stroke || typeof stroke.id !== 'string' || stroke.id.length > 100 || ids.has(stroke.id) ||
        !/^#[0-9a-f]{6}$/i.test(stroke.color) || !finite(stroke.width) || stroke.width <= 0 || stroke.width > 0.1 ||
        !Array.isArray(stroke.points) || !stroke.points.length || stroke.points.length > LIMITS.pointsPerStroke) throw new TypeError('Invalid stroke');
      ids.add(stroke.id); count += stroke.points.length;
      if (count > LIMITS.points) throw new TypeError('Drawing has too many points');
      return { id: stroke.id, color: stroke.color, width: stroke.width, points: stroke.points.map((point) => {
        if (!validPoint(point) || Math.abs(point.x) > 10 || Math.abs(point.y) > 10) throw new TypeError('Invalid drawing coordinate');
        return { x: point.x, y: point.y };
      }) };
    });
    if (checkpoint) this._checkpoint();
    this._load({ strokes, selectedId: null });
    this.nextId = Math.max(this.nextId, ...strokes.map((stroke) => {
      const id = Number(stroke.id.match(/^stroke-(\d+)$/)?.[1]);
      return Number.isSafeInteger(id) && id < 1e9 ? id : 0;
    }), 0);
    return this;
  }
}

export const HAND_CONNECTIONS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];
