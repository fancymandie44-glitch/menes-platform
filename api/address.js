'use strict';

const { corsHeaders } = require('../lib/cors');
const { allowRequest, clientIp, tooManyRequests } = require('../lib/rate-limit');
const { searchAddresses } = require('../lib/address-search');

exports.handler = async (event) => {
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!allowRequest(`address:${clientIp(event)}`, { limit: 40, windowMs: 60_000 })) {
    return tooManyRequests(headers);
  }
  try {
    let q = '';
    let country = 'CA';
    if (event.httpMethod === 'GET') {
      q = event.queryStringParameters?.q || event.queryStringParameters?.query || '';
      country = event.queryStringParameters?.country || 'CA';
    } else {
      const body = JSON.parse(event.body || '{}');
      q = body.q || body.query || '';
      country = body.country || 'CA';
    }
    q = String(q).trim().slice(0, 120);
    country = String(country).trim().toUpperCase().slice(0, 8);
    if (q.length < 3) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, results: [] }) };
    }
    const results = await searchAddresses(q, country);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, results }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Adresse indisponible' }) };
  }
};
