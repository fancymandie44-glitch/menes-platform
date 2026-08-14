const ALLOWED_ORIGINS = [
  'https://boutiquemenes.netlify.app',
  'https://menesadmin.netlify.app',
  'https://menesambassador.netlify.app',
  'https://mymenesjewelry.com',
  'https://www.mymenesjewelry.com',
  'http://localhost:8888',
  'http://127.0.0.1:8888',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

function corsHeaders(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || '';
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password, X-Site-Id, Authorization, X-Ambassador-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
  if (ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  // Same-origin / non-browser: no ACAO (not *)
  return headers;
}

module.exports = { corsHeaders, ALLOWED_ORIGINS };
