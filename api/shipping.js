'use strict';

const { corsHeaders } = require('../lib/cors');
const { allowRequest, clientIp, tooManyRequests } = require('../lib/rate-limit');
const { quoteShipping, ORIGIN } = require('../lib/shipping');

exports.handler = async (event) => {
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!allowRequest(`ship:${clientIp(event)}`, { limit: 40, windowMs: 60_000 })) {
    return tooManyRequests(headers);
  }
  try {
    let body = {};
    if (event.httpMethod === 'POST') {
      try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }
    } else {
      body = event.queryStringParameters || {};
    }
    const quote = quoteShipping({
      country: body.country,
      province: body.province,
      postal: body.postal,
      city: body.city,
      subtotal: Number(body.subtotal) || 0,
      items: Array.isArray(body.items) ? body.items.slice(0, 40) : [],
      freeThreshold: Number(body.freeThreshold) || 150,
    });
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, origin: ORIGIN, ...quote }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Livraison indisponible' }) };
  }
};
