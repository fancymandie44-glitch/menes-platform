'use strict';

const { applyVipTag } = require('./customers');
const { inventoryAlerts } = require('./commerce-intel');

function runPaidAutomations(store, order) {
  const log = [];
  const email = String(order?.customer?.email || '').toLowerCase();
  const customer = (store.customers || []).find((c) => String(c.email || '').toLowerCase() === email);
  const rules = Array.isArray(store.automations) ? store.automations : [];
  rules.filter((r) => r && r.enabled !== false).forEach((rule) => {
    if (rule.trigger !== 'order_paid') return;
    if (rule.action === 'tag_vip') {
      applyVipTag(customer, Number(rule.threshold) || 200);
      log.push({ rule: rule.id || 'tag_vip', ok: true });
    }
  });
  if (customer && (Number(customer.ltv) || 0) >= 200) applyVipTag(customer, 200);
  return log;
}

function inventoryAutomation(store) {
  const alerts = inventoryAlerts(store.products || [], 5);
  const critical = alerts.filter((a) => a.level === 'out' || a.stock <= 5);
  if (!store.alerts) store.alerts = [];
  critical.slice(0, 20).forEach((a) => {
    const key = `${a.id}:${a.variant}:${a.stock}`;
    if (store.alerts.some((x) => x.key === key)) return;
    store.alerts.unshift({
      key,
      at: new Date().toISOString(),
      type: 'inventory',
      message: `${a.name}${a.variant ? ` · ${a.variant}` : ''} · stock ${a.stock}`,
    });
  });
  store.alerts = store.alerts.slice(0, 80);
  return critical;
}

module.exports = { runPaidAutomations, inventoryAutomation };
