const lerp = (a, b, amount) => a + (b - a) * amount;

export class SnapshotBuffer {
  constructor(delayMs = 120, snapDistance = 80) {
    this.delayMs = delayMs;
    this.snapDistance = snapDistance;
    this.items = [];
  }

  push(snapshot, receivedAt = performance.now(), serverTick = null) {
    const last = this.items.at(-1);
    if (serverTick !== null && last && last.serverTick !== null && serverTick <= last.serverTick) return false;
    this.items.push({ snapshot, receivedAt, serverTick });
    if (this.items.length > 8) this.items.shift();
    return true;
  }

  clear() {
    this.items.length = 0;
  }

  sample(now = performance.now()) {
    if (!this.items.length) return null;
    if (this.items.length === 1) return this.items[0].snapshot;
    const target = now - this.delayMs;
    while (this.items.length > 2 && this.items[1].receivedAt <= target) this.items.shift();
    const [from, to] = this.items;
    if (target <= from.receivedAt) return from.snapshot;
    const amount = Math.min(1, (target - from.receivedAt) / Math.max(1, to.receivedAt - from.receivedAt));
    const result = { ...from.snapshot };
    result.actors = from.snapshot.actors.map((actor, index) => {
      const next = to.snapshot.actors[index];
      if (!next || Math.hypot(next.x - actor.x, next.y - actor.y) > this.snapDistance) return next || actor;
      return { ...actor, x: lerp(actor.x, next.x, amount), y: lerp(actor.y, next.y, amount) };
    });
    if (from.snapshot.projectile && to.snapshot.projectile) {
      const a = from.snapshot.projectile;
      const b = to.snapshot.projectile;
      result.projectile = Math.hypot(b.x - a.x, b.y - a.y) > this.snapDistance
        ? b
        : { ...a, x: lerp(a.x, b.x, amount), y: lerp(a.y, b.y, amount) };
    } else result.projectile = to.snapshot.projectile;
    return result;
  }
}
