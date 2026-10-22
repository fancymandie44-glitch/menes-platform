'use strict';

const { corsHeaders } = require('../lib/cors');
const { checkAdminAuth } = require('../lib/admin-auth');
const { setLambdaEvent, resolveSiteId, knownSiteIds, readPlatform } = require('../lib/platform');
const { allowRequest, clientIp, tooManyRequests } = require('../lib/rate-limit');
const { runHealthCheck } = require('../lib/health-monitor');
const { saveHealth, readHealthHistory, pushAlert } = require('../lib/copilot-store');
const { applySafeHeals } = require('../lib/self-heal');
const { notifySimple, emailConfigured } = require('../lib/notify');
const { sanitizeStoreId } = require('../lib/copilot-validate');

async function executeHealth({ storeId, mode, heal }) {
  const report = await runHealthCheck({ storeId, mode: mode || 'full' });
  await saveHealth(storeId, report);
  let healed = [];
  if (heal) healed = await applySafeHeals(storeId, report.issues);
  if (report.counts.critical > 0) {
    const alert = await pushAlert(storeId, {
      severity: 'critical',
      title: report.summary,
      score: report.score,
    });
    if (emailConfigured() && process.env.COPILOT_ALERTS !== 'off') {
      await notifySimple({
        subject: `MENES Copilot · ${report.summary}`,
        html: `<p>${report.summary}</p><p>Score ${report.score}/100 on ${storeId}.</p><p>${(report.issues || []).slice(0, 8).map((i) => `${i.severity}: ${i.title}`).join('<br>')}</p>`,
      });
    }
    report.alert = alert;
  }
  report.healed = healed;
  return report;
}

exports.executeHealth = executeHealth;

exports.handler = async (event) => {
  setLambdaEvent(event);
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const auth = checkAdminAuth(event);
  if (!auth.ok) {
    return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };
  }
  if (!allowRequest(`health:${clientIp(event)}`, { limit: 20, windowMs: 60_000 })) {
    return tooManyRequests(headers);
  }

  const host = event.headers['x-forwarded-host'] || event.headers.host || '';
  const params = event.queryStringParameters || {};
  const headerSiteId = event.headers['x-site-id'] || event.headers['X-Site-Id'];
  let storeId = await resolveSiteId(host, params.site || headerSiteId);

  try {
    if (event.httpMethod === 'GET') {
      const history = await readHealthHistory(storeId);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, latest: history[0] || null, history }) };
    }
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }
    const body = JSON.parse(event.body || '{}');
    if (body.storeId) {
      const platform = await readPlatform();
      const requested = sanitizeStoreId(body.storeId);
      if (knownSiteIds(platform).has(requested)) storeId = requested;
    }
    const report = await executeHealth({
      storeId,
      mode: body.mode === 'critical' ? 'critical' : 'full',
      heal: body.heal === true,
    });
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, report }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Health error' }) };
  }
};
