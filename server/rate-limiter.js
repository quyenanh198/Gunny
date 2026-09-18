export class FixedWindowLimiter {
  constructor({ limit, windowMs }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.entries = new Map();
  }

  take(key, now = Date.now()) {
    if (this.entries.size > 10000) this.prune(now);
    const current = this.entries.get(key);
    if (!current || now - current.startedAt >= this.windowMs) {
      this.entries.set(key, { startedAt: now, count: 1 });
      return true;
    }
    current.count++;
    return current.count <= this.limit;
  }

  prune(now = Date.now()) {
    for (const [key, entry] of this.entries)
      if (now - entry.startedAt >= this.windowMs) this.entries.delete(key);
  }
}

export function clientIp(req, { trustProxy = false, trustedProxies = [] } = {}) {
  const remote = req.socket?.remoteAddress || "unknown";
  if (!trustProxy || !trustedProxies.includes(remote)) return remote;
  const forwarded = req.headers["x-forwarded-for"];
  return typeof forwarded === "string" ? forwarded.split(",")[0].trim() || remote : remote;
}
