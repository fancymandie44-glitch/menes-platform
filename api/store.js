const { readSiteStore, writeSiteStore, resolveSiteId, setLambdaEvent } = require('../lib/platform');
const { corsHeaders } = require('../lib/cors');

exports.handler = async (event) => {
  setLambdaEvent(event);
  const headers = corsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const adminPassword = process.env.ADMIN_PASSWORD || 'menes2026';
  const host = event.headers['x-forwarded-host'] || event.headers.host || '';
  const params = event.queryStringParameters || {};
  const headerSiteId = event.headers['x-site-id'] || event.headers['X-Site-Id'];

  try {
    const siteId = await resolveSiteId(host, params.site || headerSiteId);

    if (event.httpMethod === 'GET') {
      const data = await readSiteStore(siteId);
      return { statusCode: 200, headers, body: JSON.stringify({ ...data, _siteId: siteId }) };
    }

    if (event.httpMethod === 'POST') {
      const auth = event.headers['x-admin-password'] || event.headers['X-Admin-Password'];
      if (auth !== adminPassword) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Mot de passe incorrect' }) };
      }
      const payload = JSON.parse(event.body);
      const targetSite = payload._siteId || headerSiteId || siteId;
      delete payload._siteId;
      await writeSiteStore(targetSite, payload);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, siteId: targetSite }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
