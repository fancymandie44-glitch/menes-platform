'use strict';

const { corsHeaders } = require('../lib/cors');
const { allowRequest, tooManyRequests, clientIp } = require('../lib/rate-limit');
const { searchAddress } = require('../lib/address');

exports.handler = async (event) => {
  const headers = {
    ...corsHeaders(event),
    'Cache-Control': 'no-store',
  };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const ip = clientIp(event);
  if (!allowRequest(`address:${ip}`, { limit: 40, windowMs: 60_000 })) {
    return tooManyRequests(headers);
  }

  const params = event.queryStringParameters || {};
  const q = String(params.q || params.query || '').trim();
  const country = String(params.country || 'CA').trim().toUpperCase();
  if (q.length < 3) {
    return { statusCode: 200, headers, body: JSON.stringify({ suggestions: [] }) };
  }
  if (q.length > 120) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Requête trop longue' }) };
  }

  try {
    const suggestions = await searchAddress(q, country);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ suggestions }),
    };
  } catch (err) {
    console.error('address', err);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ suggestions: [] }),
    };
  }
};
