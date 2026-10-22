'use strict';

const { readSiteStore, writeSiteStore } = require('./platform');
const { appendAudit, enqueueApproval } = require('./copilot-store');
const { getAdsAdapter, enforceBudgetCaps } = require('./ads-adapter');

const LOW_RISK = new Set(['hide_product', 'pause_ad', 'flag_supplier']);
const SPEND = new Set(['create_meta_campaign', 'set_ad_budget', 'publish_ad']);
const RISKY = new Set(['set_price', 'delete_product', 'delete_data', ...SPEND]);

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

async function applyAutoFix(storeId, fix, { approved = false, actor = 'copilot' } = {}) {
  const type = String(fix?.type || '');
  if (!type) return { ok: false, error: 'Missing fix type' };
  if (RISKY.has(type) && !approved) {
    const queued = await enqueueApproval(storeId, {
      type,
      title: fix.title || type,
      payload: fix,
      permission: SPEND.has(type) ? 'spend' : 'write',
    });
    await appendAudit(storeId, { tool: type, permission: 'write', result: 'queued', approvalId: queued.id, actor });
    return { ok: true, queued: true, approval: queued };
  }
  if (!LOW_RISK.has(type) && !approved && !RISKY.has(type)) {
    const queued = await enqueueApproval(storeId, {
      type,
      title: fix.title || type,
      payload: fix,
      permission: 'write',
    });
    return { ok: true, queued: true, approval: queued };
  }

  const store = await readSiteStore(storeId);
  const undo = { type, before: null };

  if (type === 'hide_product') {
    const p = (store.products || []).find((x) => x.id === fix.productId);
    if (!p) return { ok: false, error: 'Product not found' };
    undo.before = { id: p.id, active: p.active };
    p.active = false;
    p.copilotHiddenAt = new Date().toISOString();
  } else if (type === 'pause_ad') {
    const ad = (store.ads || []).find((x) => x.id === fix.adId);
    if (!ad) return { ok: false, error: 'Ad not found' };
    undo.before = { id: ad.id, status: ad.status };
    ad.status = 'paused';
    ad.copilotPausedAt = new Date().toISOString();
  } else if (type === 'flag_supplier') {
    const s = (store.suppliers || []).find((x) => x.id === fix.supplierId);
    if (!s) return { ok: false, error: 'Supplier not found' };
    undo.before = { id: s.id, status: s.status };
    s.status = 'flagged';
    s.copilotFlaggedAt = new Date().toISOString();
  } else if (type === 'set_price' && approved) {
    const p = (store.products || []).find((x) => x.id === fix.productId);
    if (!p) return { ok: false, error: 'Product not found' };
    undo.before = { id: p.id, price: p.price };
    p.price = Number(fix.price);
  } else if (type === 'create_meta_campaign' && approved) {
    const ad = (store.ads || []).find((x) => x.id === fix.adId);
    if (!ad) return { ok: false, error: 'Ad not found' };
    const cap = enforceBudgetCaps(ad, store.ads);
    if (!cap.ok) return cap;
    undo.before = { id: ad.id, status: ad.status, remoteId: ad.remoteId };
    const result = await getAdsAdapter(ad.platform).createDraft(ad);
    ad.remoteId = result.remoteId;
    ad.status = result.status || 'PAUSED';
    ad.providerNote = result.note;
  } else if (type === 'save_ad_draft') {
    store.ads = Array.isArray(store.ads) ? store.ads : [];
    const ad = { id: fix.ad?.id || `ad_${Date.now().toString(36)}`, status: 'draft', ...fix.ad };
    undo.before = null;
    store.ads.unshift(ad);
  } else {
    return { ok: false, error: `Unsupported fix ${type}` };
  }

  await writeSiteStore(storeId, store);
  await appendAudit(storeId, {
    tool: type,
    permission: approved ? 'write' : 'write',
    actor,
    payload: { type, id: fix.productId || fix.adId || fix.supplierId },
    undo,
    result: 'applied',
  });
  return { ok: true, applied: true, undo };
}

async function undoFix(storeId, undo) {
  if (!undo?.type) return { ok: false, error: 'Nothing to undo' };
  const store = await readSiteStore(storeId);
  const b = undo.before || {};
  if (undo.type === 'hide_product') {
    const p = (store.products || []).find((x) => x.id === b.id);
    if (p) {
      p.active = b.active !== false;
      delete p.copilotHiddenAt;
    }
  } else if (undo.type === 'pause_ad') {
    const ad = (store.ads || []).find((x) => x.id === b.id);
    if (ad) {
      ad.status = b.status || 'draft';
      delete ad.copilotPausedAt;
    }
  } else if (undo.type === 'flag_supplier') {
    const s = (store.suppliers || []).find((x) => x.id === b.id);
    if (s) {
      s.status = b.status || 'active';
      delete s.copilotFlaggedAt;
    }
  } else if (undo.type === 'set_price') {
    const p = (store.products || []).find((x) => x.id === b.id);
    if (p) p.price = b.price;
  } else {
    return { ok: false, error: `Cannot undo ${undo.type}` };
  }
  await writeSiteStore(storeId, store);
  await appendAudit(storeId, { tool: 'undo', permission: 'write', payload: undo, result: 'undone' });
  return { ok: true };
}

async function applySafeHeals(storeId, issues) {
  const applied = [];
  for (const iss of issues || []) {
    const fix = iss.autoFix;
    if (!fix || !LOW_RISK.has(fix.type)) continue;
    const result = await applyAutoFix(storeId, { ...fix, title: iss.title }, { approved: false, actor: 'self-heal' });
    if (result.applied) applied.push({ issueId: iss.id, ...result });
  }
  return applied;
}

module.exports = { applyAutoFix, undoFix, applySafeHeals, LOW_RISK, RISKY, SPEND, clone };
