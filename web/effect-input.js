/** Camera-effect controls. Landmark coordinates are already mirrored and cropped. */
const modes = new Set(['cover', 'riso', 'crt', 'dither', 'liquid', 'particles']);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const mean = points => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
});
const valid = hand => hand?.landmarks?.length === 21 && hand.landmarks.every(point =>
  point && Number.isFinite(point.x) && Number.isFinite(point.y));

export class EffectInput {
  constructor() {
    this.aspect = 16 / 9;
    this.mode = 'cover';
    this.palette = 0;
    this.morphIndex = 0;
    this.scatter = 0;
    this.separation = .5;
    this.window = {cx: .5, cy: .52, width: .58, height: .56};
    this.tracks = new Map();
    this.nextId = 1;
    this.time = 0;
    this.holding = false;
    this.sessionIds = new Set();
    this.requireOpen = false;
  }

  get state() {
    return {
      mode: this.mode,
      palette: this.palette,
      separation: this.separation,
      window: {...this.window},
      hands: [...this.tracks.values()]
        .filter(track => track.visible && this.time - track.lastSeen < 180)
        .sort((a, b) => a.id - b.id)
        .slice(0, 2)
        .map(track => ({
          id: track.id, x: track.point.x, y: track.point.y,
          vx: track.velocity.x, vy: track.velocity.y,
          pinching: track.active && !track.blocked,
        })),
      scatter: this.scatter,
      morphIndex: this.morphIndex,
    };
  }

  distance(a, b) {
    const aspect = Number.isFinite(this.aspect) && this.aspect > 0 ? this.aspect : 16 / 9;
    return Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  }

  detections(input) {
    return (Array.isArray(input) ? input : []).filter(valid).slice(0, 2).map(hand => {
      const p = hand.landmarks;
      const center = mean([p[0], p[5], p[9], p[13], p[17]]);
      const palm = Math.max(.015, (this.distance(p[5], p[17]) + this.distance(p[0], p[9])) / 2);
      return {
        center: {x: clamp(center.x, 0, 1), y: clamp(center.y, 0, 1)},
        ratio: this.distance(p[4], p[8]) / palm,
        label: typeof hand.handedness === 'string' ? hand.handedness : '',
      };
    });
  }

  match(hands, timestamp) {
    const tracks = [...this.tracks.values()];
    let best = {cost: Infinity, matches: []};
    const assign = (index, used, matches, cost) => {
      if (index === hands.length) {
        if (cost < best.cost) best = {cost, matches};
        return;
      }
      assign(index + 1, used, [...matches, null], cost + .7);
      for (const track of tracks) {
        if (used.has(track.id)) continue;
        const hand = hands[index];
        // Conflicting handedness cannot inherit an in-progress release action.
        if (hand.label && track.label && hand.label !== track.label) continue;
        const dt = clamp(timestamp - track.lastSeen, 0, 100) / 1000;
        const predicted = {
          x: track.center.x + track.velocity.x * dt,
          y: track.center.y + track.velocity.y * dt,
        };
        const distance = this.distance(hand.center, predicted);
        if (distance > .7) continue;
        assign(index + 1, new Set([...used, track.id]), [...matches, track], cost + distance);
      }
    };
    assign(0, new Set(), [], 0);
    return best.matches;
  }

  cancelHolds() {
    this.holding = false;
    this.sessionIds.clear();
    this.requireOpen = true;
    for (const track of this.tracks.values()) {
      track.blocked = track.blocked || track.pinching || track.active;
      track.active = false;
      track.pinching = false;
      track.holdSince = null;
      track.releaseSince = null;
      track.velocity = {x: 0, y: 0};
    }
  }

  tick(timestamp) {
    if (!Number.isFinite(timestamp) || timestamp < this.time) return this.state;
    const dt = (timestamp - this.time) / 1000;
    this.time = timestamp;
    if ([...this.tracks.values()].some(track =>
      this.sessionIds.has(track.id) && timestamp - track.lastSeen >= 180)) this.cancelHolds();
    for (const [id, track] of this.tracks) {
      if (timestamp - track.lastSeen >= 180) track.visible = false;
      if (timestamp - track.lastSeen >= 260) this.tracks.delete(id);
      const decay = Math.exp(-dt / .09);
      track.velocity.x *= decay;
      track.velocity.y *= decay;
    }
    const target = this.mode === 'particles' && this.holding ? 1 : 0;
    const response = target > this.scatter ? .24 : .12;
    this.scatter += (target - this.scatter) * (1 - Math.exp(-dt / response));
    if (this.scatter < .0001) this.scatter = 0;
    return this.state;
  }

  cancel(timestamp = this.time) {
    if (!Number.isFinite(timestamp) || timestamp < this.time) return this.state;
    this.tick(timestamp);
    this.cancelHolds();
    for (const track of this.tracks.values()) track.visible = false;
    this.scatter = 0;
    return this.state;
  }

  setMode(mode, timestamp = this.time) {
    if (!modes.has(mode)) throw new Error('Unknown camera effect');
    if (!Number.isFinite(timestamp) || timestamp < this.time) return this.state;
    if (mode === this.mode) return this.state;
    this.cancel(timestamp);
    this.mode = mode;
    return this.state;
  }

  released() {
    if (['cover', 'riso', 'dither'].includes(this.mode)) this.palette++;
    if (this.mode === 'particles') this.morphIndex++;
    this.holding = false;
    this.sessionIds.clear();
  }

  update(input, timestamp) {
    if (!Number.isFinite(timestamp) || timestamp < this.time) return this.state;
    this.tick(timestamp);
    const hands = this.detections(input);
    const matches = this.match(hands, timestamp);
    const previousVisible = new Map([...this.tracks.values()].map(track => [track.id, track.visible]));
    for (const track of this.tracks.values()) track.visible = false;

    for (let index = 0; index < hands.length; index++) {
      const hand = hands[index];
      let track = matches[index];
      if (!track) {
        track = {
          id: this.nextId++, label: hand.label,
          center: {...hand.center}, point: {...hand.center},
          velocity: {x: 0, y: 0}, lastSeen: timestamp, visible: true,
          active: false, pinching: false,
          holdSince: null, releaseSince: null,
          blocked: this.requireOpen && hand.ratio <= .44,
        };
        this.tracks.set(track.id, track);
      } else {
        const dt = timestamp - track.lastSeen;
        const recovering = !previousVisible.get(track.id) || dt >= 180;
        if (recovering || dt <= 0) {
          track.point = {...hand.center};
          track.velocity = {x: 0, y: 0};
        } else {
          const alpha = 1 - Math.exp(-dt / 25);
          track.point.x += (hand.center.x - track.point.x) * alpha;
          track.point.y += (hand.center.y - track.point.y) * alpha;
          track.velocity = {
            x: clamp((hand.center.x - track.center.x) / (dt / 1000), -3, 3),
            y: clamp((hand.center.y - track.center.y) / (dt / 1000), -3, 3),
          };
        }
      }
      track.center = {...hand.center};
      track.label = hand.label || track.label;
      track.lastSeen = timestamp;
      track.visible = true;

      if (track.blocked) {
        if (hand.ratio > .44) track.blocked = false;
        continue;
      }
      const pinching = track.pinching ? hand.ratio <= .44 : hand.ratio < .30;
      if (pinching) {
        track.holdSince ??= timestamp;
        track.pinching = true;
        track.releaseSince = null;
        if (!track.active && timestamp - track.holdSince >= 100) track.active = true;
      } else if (track.active) {
        track.releaseSince ??= timestamp;
        if (timestamp - track.releaseSince >= 70) {
          track.active = false;
          track.pinching = false;
          track.holdSince = null;
          track.releaseSince = null;
        }
      } else {
        track.pinching = false;
        track.holdSince = null;
        track.releaseSince = null;
      }
    }

    // Missing even one participating hand cancels the action, never releases it.
    if ([...this.sessionIds].some(id => !this.tracks.get(id)?.visible)) this.cancelHolds();
    for (const track of this.tracks.values()) {
      if (!track.visible && !track.active) {
        track.holdSince = null;
        track.releaseSince = null;
        if (track.pinching) track.blocked = true;
        track.pinching = false;
      }
    }
    const active = [...this.tracks.values()].filter(track => track.visible && track.active && !track.blocked);
    if (active.length) {
      this.holding = true;
      active.forEach(track => this.sessionIds.add(track.id));
    } else if (this.holding) this.released();

    const visible = [...this.tracks.values()].filter(track => track.visible);
    if (visible.length === 2) {
      const [a, b] = visible.map(track => track.point);
      this.separation = clamp(this.distance(a, b) / Math.max(1, this.aspect), 0, 1);
      const width = clamp(Math.abs(a.x - b.x) + .16, .24, .88);
      const height = clamp(Math.abs(a.y - b.y) + .32, .28, .74);
      this.window = {
        cx: clamp((a.x + b.x) / 2, width / 2, 1 - width / 2),
        cy: clamp((a.y + b.y) / 2, height / 2, 1 - height / 2),
        width, height,
      };
    }
    return this.state;
  }
}
