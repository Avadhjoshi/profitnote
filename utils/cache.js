// utils/cache.js
const LRU = require("lru-cache");

const inflight = new Map(); // key -> Promise (coalesce concurrent calls)

const cache = new LRU({
  max: 1000,
  ttl: 10_000,           // 10s default TTL
  ttlAutopurge: true,
  updateAgeOnGet: true,
});

async function dedupe(key, fn, ttlMs = 10_000) {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    try {
      const val = await fn();
      cache.set(key, val, { ttl: ttlMs });
      return val;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
}

module.exports = { cache, dedupe };
