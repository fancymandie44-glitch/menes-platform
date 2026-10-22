'use strict';

const { corsHeaders } = require('../lib/cors');
const { checkAdminAuth } = require('../lib/admin-auth');
const { setLambdaEvent, resolveSiteId, knownSiteIds, readPlatform } = require('../lib/platform');
const { allowRequest, clientIp, tooManyRequests } = require('../lib/rate-limit');
const { sanitizeStoreId } = require('../lib/copilot-validate');
const { runCopilotTurn, autofillAdCopy } = require('../lib/copilot-agent');
const {
  readAudit, readThreads, readApprovals, saveApprovals, readAlerts, enqueueApproval,
} = require('../lib/copilot-store');
const { applyAutoFix, undoFix } = require('../lib/self-heal');
const { anthropicConfigured, metaConfigured, COPILOT_MODEL } = require('../lib/copilot-config');

exports.handler = async (event) => {
  setLambdaEvent(event);
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const auth = checkAdminAuth(event);
  if (!auth.ok) {
    return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };
  }
  if (!allowRequest(`copilot:${clientIp(event)}`, { limit: 30, windowMs: 60_000 })) {
    return tooManyRequests(headers);
  }

  const host = event.headers['x-forwarded-host'] || event.headers.host || '';
  const params = event.queryStringParameters || {};
  const headerSiteId = event.headers['x-site-id'] || event.headers['X-Site-Id'];
  const platform = await readPlatform();
  let storeId = await resolveSiteId(host, params.site || headerSiteId);

  try {
    if (event.httpMethod === 'GET') {
      const view = params.view || 'status';
      if (view === 'audit') {
        return json(headers, { ok: true, entries: await readAudit(storeId) });
      }
      if (view === 'threads') {
        return json(headers, { ok: true, threads: await readThreads(storeId) });
      }
      if (view === 'approvals') {
        return json(headers, { ok: true, approvals: await readApprovals(storeId) });
      }
      if (view === 'alerts') {
        return json(headers, { ok: true, alerts: await readAlerts(storeId) });
      }
      return json(headers, {
        ok: true,
        model: COPILOT_MODEL,
        anthropic: anthropicConfigured(),
        meta: metaConfigured(),
        storeId,
      });
    }

    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(headers, { ok: false, error: 'Invalid JSON body' }, 200);
    }
    if (body.storeId) {
      const requested = sanitizeStoreId(body.storeId);
      if (knownSiteIds(platform).has(requested)) storeId = requested;
    }
    const action = String(body.action || 'chat');

    if (action === 'chat') {
      const result = await runCopilotTurn({
        storeId,
        page: String(body.page || '').slice(0, 40),
        threadId: body.threadId,
        history: Array.isArray(body.history) ? body.history : [],
        userText: String(body.message || '').slice(0, 4000),
        actor: 'admin',
      });
      return json(headers, result, 200);
    }

    if (action === 'save-ad') {
      const { runTool } = require('../lib/copilot-tools');
      const result = await runTool('save_ad_draft', { draft: body.draft || {} }, { storeId, actor: 'admin' });
      return json(headers, result);
    }

    if (action === 'autofill-ad') {
      const result = await autofillAdCopy({
        storeId,
        productId: body.productId,
        userText: body.message || body.prompt,
      });
      return json(headers, result);
    }

    if (action === 'approve') {
      const list = await readApprovals(storeId);
      const row = list.find((a) => a.id === body.id);
      if (!row) return json(headers, { error: 'Approval not found' }, 404);
      const applied = await applyAutoFix(storeId, row.payload || row, { approved: true, actor: 'admin', humanConfirm: true });
      row.status = applied.ok ? 'approved' : 'error';
      row.resolvedAt = new Date().toISOString();
      row.result = applied;
      await saveApprovals(storeId, list);
      return json(headers, { ok: applied.ok, approval: row, applied });
    }

    if (action === 'reject') {
      const list = await readApprovals(storeId);
      const row = list.find((a) => a.id === body.id);
      if (!row) return json(headers, { error: 'Approval not found' }, 404);
      row.status = 'rejected';
      row.resolvedAt = new Date().toISOString();
      await saveApprovals(storeId, list);
      return json(headers, { ok: true, approval: row });
    }

    if (action === 'undo') {
      const result = await undoFix(storeId, body.undo);
      return json(headers, result);
    }

    if (action === 'queue') {
      const row = await enqueueApproval(storeId, {
        type: body.type,
        title: body.title,
        payload: body.payload,
        permission: body.permission || 'write',
      });
      return json(headers, { ok: true, approval: row });
    }

    return json(headers, { error: 'Unknown action' }, 400);
  } catch (err) {
    const message = String(err && err.message ? err.message : err || 'Copilot error');
    return json(headers, { ok: false, error: message }, 200);
  }
};

function json(headers, body, status = 200) {
  return { statusCode: status, headers, body: JSON.stringify(body) };
}
