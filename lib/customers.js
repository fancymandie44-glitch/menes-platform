'use strict';

function cleanEmail(v) {
  return String(v || '').trim().toLowerCase();
}

function upsertCustomerFromOrder(store, order) {
  if (!store || !order) return null;
  const email = cleanEmail(order.customer?.email);
  if (!email) return null;
  if (!Array.isArray(store.customers)) store.customers = [];
  let row = store.customers.find((c) => cleanEmail(c.email) === email);
  if (!row) {
    row = {
      id: `cus_${email.replace(/[^a-z0-9]/g, '').slice(0, 18)}`,
      email,
      name: order.customer?.name || '',
      phone: order.customer?.phone || '',
      orders: 0,
      ltv: 0,
      tags: [],
      notes: '',
      marketingConsent: false,
      createdAt: new Date().toISOString(),
    };
    store.customers.push(row);
  }
  row.name = order.customer?.name || row.name;
  row.phone = order.customer?.phone || row.phone;
  row.lastOrderId = order.id;
  row.lastPurchase = order.paidAt || order.date || new Date().toISOString();
  const paid = ['paid', 'processing', 'shipped', 'delivered'].includes(String(order.status || ''));
  if (paid) {
    const already = Array.isArray(row.orderIds) && row.orderIds.includes(order.id);
    if (!already) {
      row.orderIds = [...(row.orderIds || []), order.id];
      row.orders = row.orderIds.length;
      row.ltv = Math.round(((Number(row.ltv) || 0) + (Number(order.total) || 0)) * 100) / 100;
    }
  }
  row.updatedAt = new Date().toISOString();
  return row;
}

function applyVipTag(row, threshold = 200) {
  if (!row) return row;
  if (!Array.isArray(row.tags)) row.tags = [];
  if ((Number(row.ltv) || 0) >= threshold && !row.tags.includes('vip')) row.tags.push('vip');
  return row;
}

module.exports = { upsertCustomerFromOrder, applyVipTag, cleanEmail };
