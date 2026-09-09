'use strict';

const { corsHeaders } = require('../lib/cors');

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
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, service: 'menes' }),
  };
};
