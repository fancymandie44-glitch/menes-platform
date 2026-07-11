const ALLOWED_ORIGINS = [
  'https://boutiquemenes.netlify.app',
  'https://menesadmin.netlify.app',
  'https://menesjewelrygrillzprice.netlify.app',
  'http://localhost:8888',
  'http://127.0.0.1:8888',
];

function corsHeaders(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || '';
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : '*';
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password, X-Site-Id',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

module.exports = { corsHeaders, ALLOWED_ORIGINS };
