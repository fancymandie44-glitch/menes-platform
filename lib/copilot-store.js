'use strict';

const { getBlobStore } = require('./platform');

const CAP = {
  audit: 400,
  threads: 40,
  messages: 80,
  health: 60,
  approvals: 80,
  alerts: 80,
};

async function readJson(key, fallback) {
  try {
    const blobs = await getBlobStore();
    const data = await blobs.get(key, { type: 'json' });
    return data == null ? fallback : data;
  } catch {
    return fallback;
  }
}

async function writeJson(key, data) {
  const blobs = await getBlobStore();
  await blobs.setJSON(key, data);
  return data;
}

function keys(storeId) {
  return {
    audit: `copilot:audit:${storeId}`,
    threads: `copilot:threads:${storeId}`,
    health: `copilot:health:${storeId}`,
    approvals: `copilot:approvals:${storeId}`,
    alerts: `copilot:alerts:${storeId}`,
  };
}

async function appendAudit(storeId, entry) {
  const list = await readJson(keys(storeId).audit, []);
  list.unshift({
    id: `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    storeId,
    ...entry,
  });
  await writeJson(keys(storeId).audit, list.slice(0, CAP.audit));
  return list[0];
}

async function readAudit(storeId) {
  return readJson(keys(storeId).audit, []);
}

async function readThreads(storeId) {
  return readJson(keys(storeId).threads, []);
}

async function saveThread(storeId, thread) {
  const list = await readThreads(storeId);
  const next = {
    ...thread,
    messages: (thread.messages || []).slice(-CAP.messages),
    updatedAt: new Date().toISOString(),
  };
  const idx = list.findIndex((t) => t.id === next.id);
  if (idx >= 0) list[idx] = next;
  else list.unshift(next);
  await writeJson(keys(storeId).threads, list.slice(0, CAP.threads));
  return next;
}

async function readHealthHistory(storeId) {
  return readJson(keys(storeId).health, []);
}

async function saveHealth(storeId, report) {
  const list = await readHealthHistory(storeId);
  list.unshift(report);
  await writeJson(keys(storeId).health, list.slice(0, CAP.health));
  return report;
}

async function readApprovals(storeId) {
  return readJson(keys(storeId).approvals, []);
}

async function saveApprovals(storeId, list) {
  return writeJson(keys(storeId).approvals, (list || []).slice(0, CAP.approvals));
}

async function enqueueApproval(storeId, item) {
  const list = await readApprovals(storeId);
  const row = {
    id: `appr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    status: 'pending',
    storeId,
    ...item,
  };
  list.unshift(row);
  await saveApprovals(storeId, list);
  return row;
}

async function readAlerts(storeId) {
  return readJson(keys(storeId).alerts, []);
}

async function pushAlert(storeId, alert) {
  const list = await readAlerts(storeId);
  list.unshift({
    id: `al_${Date.now().toString(36)}`,
    at: new Date().toISOString(),
    read: false,
    storeId,
    ...alert,
  });
  await writeJson(keys(storeId).alerts, list.slice(0, CAP.alerts));
  return list[0];
}

module.exports = {
  keys,
  appendAudit,
  readAudit,
  readThreads,
  saveThread,
  readHealthHistory,
  saveHealth,
  readApprovals,
  saveApprovals,
  enqueueApproval,
  readAlerts,
  pushAlert,
};
