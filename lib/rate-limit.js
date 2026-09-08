'use strict';

const buckets = new Map();

function clientIp(event) {
  const h = event?.headers || {};
  const forwarded = String(h['x-forwarded-for'] || h['X-Forwarded-For'] || '').split(',')[0].trim();
  return (
    h['x-nf-client-connection-ip']
    || h['X-Nf-Client-Connection-Ip']
    || forwarded
    || h['client-ip']
    || 'unknown'
  );
}

function allowRequest(key, { limit = 30, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const prev = buckets.get(key) || [];
  const recent = prev.filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 4000) {
    for (const [k, times] of buckets) {
      if (!times.some((t) => now - t < windowMs)) buckets.delete(k);
    }
  }
  return true;
}

function tooManyRequests(headers) {
  return {
    statusCode: 429,
    headers: { ...headers, 'Retry-After': '60' },
    body: JSON.stringify({ error: 'Trop de requêtes. Réessaie dans un instant.' }),
  };
}

module.exports = { clientIp, allowRequest, tooManyRequests };
