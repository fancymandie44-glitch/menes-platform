'use strict';

const { setLambdaEvent, readPlatform } = require('../lib/platform');
const { executeHealth } = require('./site-health');

exports.config = { schedule: '*/15 * * * *' };

function cronAllowed(event) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  const hdr = event.headers?.['x-cron-secret'] || event.headers?.['X-Cron-Secret'];
  if (secret && hdr === secret) return true;
  try {
    const body = JSON.parse(event.body || '{}');
    if (body.next_run) return true;
  } catch {}
  return false;
}

exports.handler = async (event) => {
  setLambdaEvent(event);
  if (!cronAllowed(event)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Not a scheduled run' }) };
  }
  const hour = new Date().getUTCHours();
  const mode = hour === 6 ? 'full' : 'critical';
  const platform = await readPlatform();
  const sites = (platform.sites || []).filter((s) => s.status !== 'archived');
  const reports = [];
  for (const site of sites.slice(0, 8)) {
    try {
      const report = await executeHealth({ storeId: site.id, mode, heal: true });
      reports.push({ storeId: site.id, score: report.score, summary: report.summary, healed: report.healed?.length || 0 });
    } catch (err) {
      reports.push({ storeId: site.id, error: err.message });
    }
  }
  return { statusCode: 200, body: JSON.stringify({ ok: true, mode, reports }) };
};
