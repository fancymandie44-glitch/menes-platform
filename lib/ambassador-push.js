/**
 * Web Push for MENES Ambassador PWA.
 * Requires env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...)
 */

function pushConfigured() {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY
    && process.env.VAPID_PRIVATE_KEY
  );
}

function getPublicKey() {
  return String(process.env.VAPID_PUBLIC_KEY || '').trim();
}

function getWebPush() {
  if (!pushConfigured()) return null;
  try {
    const webpush = require('web-push');
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:hello@menes.app',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    return webpush;
  } catch {
    return null;
  }
}

function normalizeSubscription(sub) {
  if (!sub || typeof sub !== 'object') return null;
  const endpoint = String(sub.endpoint || '').trim();
  const p256dh = String(sub.keys?.p256dh || '').trim();
  const auth = String(sub.keys?.auth || '').trim();
  if (!endpoint || !p256dh || !auth) return null;
  if (!/^https:\/\//i.test(endpoint)) return null;
  return {
    endpoint: endpoint.slice(0, 500),
    keys: { p256dh: p256dh.slice(0, 200), auth: auth.slice(0, 200) },
    createdAt: sub.createdAt || new Date().toISOString(),
  };
}

function upsertSubscription(ambassador, sub) {
  const normalized = normalizeSubscription(sub);
  if (!normalized) return { ok: false, error: 'Subscription invalide' };
  if (!Array.isArray(ambassador.pushSubscriptions)) ambassador.pushSubscriptions = [];
  const idx = ambassador.pushSubscriptions.findIndex((s) => s.endpoint === normalized.endpoint);
  if (idx >= 0) ambassador.pushSubscriptions[idx] = normalized;
  else ambassador.pushSubscriptions.unshift(normalized);
  if (ambassador.pushSubscriptions.length > 5) {
    ambassador.pushSubscriptions = ambassador.pushSubscriptions.slice(0, 5);
  }
  if (!ambassador.notificationPrefs) ambassador.notificationPrefs = {};
  ambassador.notificationPrefs.push = true;
  ambassador.notificationPrefs.community = true;
  ambassador.notificationPrefs.sales = true;
  ambassador.notificationPrefs.commission = true;
  ambassador.notificationPrefs.announcements = true;
  return { ok: true, subscription: normalized };
}

function removeSubscription(ambassador, endpoint) {
  if (!Array.isArray(ambassador.pushSubscriptions)) return;
  ambassador.pushSubscriptions = ambassador.pushSubscriptions.filter(
    (s) => s.endpoint !== endpoint
  );
}

async function sendPushToSubscription(subscription, payload) {
  const webpush = getWebPush();
  if (!webpush) return { ok: false, error: 'push_not_configured' };
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: 3600,
      urgency: 'high',
    });
    return { ok: true };
  } catch (err) {
    const status = err.statusCode || err.status;
    return { ok: false, error: err.message || 'send_failed', statusCode: status };
  }
}

function viewForNotificationType(type) {
  const map = {
    sale: 'sales',
    commission: 'sales',
    payout: 'sales',
    community: 'community',
    chat: 'community',
    announcement: 'home',
    badge: 'profile',
    rank: 'profile',
    campaign: 'community',
    challenge: 'home',
  };
  return map[type] || 'home';
}

function shouldSendPush(ambassador, type) {
  const prefs = ambassador.notificationPrefs || {};
  if (prefs.push === false) return false;
  if (type === 'sale' && prefs.sales === false) return false;
  if (type === 'commission' && prefs.commission === false) return false;
  if ((type === 'community' || type === 'chat') && prefs.community === false) return false;
  if (type === 'announcement' && prefs.announcements === false) return false;
  return true;
}

async function sendPushToAmbassador(ambassador, payload) {
  if (!pushConfigured()) return { sent: 0, skipped: true, reason: 'not_configured' };
  if (!ambassador || ambassador.status !== 'active') return { sent: 0, skipped: true };
  if (!shouldSendPush(ambassador, payload?.data?.type)) return { sent: 0, skipped: true };
  if (!Array.isArray(ambassador.pushSubscriptions) || !ambassador.pushSubscriptions.length) {
    return { sent: 0, skipped: true, reason: 'no_subscription' };
  }

  let sent = 0;
  let failed = 0;
  const keep = [];
  for (const sub of ambassador.pushSubscriptions) {
    const result = await sendPushToSubscription(sub, payload);
    if (result.ok) {
      sent += 1;
      keep.push(sub);
    } else if (result.statusCode === 410 || result.statusCode === 404) {
      failed += 1;
    } else {
      keep.push(sub);
      failed += 1;
    }
  }
  ambassador.pushSubscriptions = keep;
  return { sent, failed };
}

function notificationToPushPayload(notif) {
  const type = notif.type || 'general';
  const data = { ...(notif.data || {}), type, notificationId: notif.id };
  if (!data.view) data.view = viewForNotificationType(type);
  if (data.channelId && !data.channel) data.channel = data.channelId;
  return {
    title: notif.title || 'MENES Ambassador',
    body: notif.body || 'Nouvelle notification',
    data,
  };
}

async function flushPendingWebPush(program, pending) {
  if (!pushConfigured() || !Array.isArray(pending) || !pending.length) {
    return { sent: 0, skipped: pending?.length || 0 };
  }
  let sent = 0;
  let failed = 0;
  for (const notif of pending) {
    const ambId = notif.ambassadorId;
    if (!ambId) continue;
    const amb = (program.ambassadors || []).find((a) => a.id === ambId);
    if (!amb) continue;
    const result = await sendPushToAmbassador(amb, notificationToPushPayload(notif));
    sent += result.sent || 0;
    failed += result.failed || 0;
  }
  return { sent, failed };
}

/**
 * Notify ambassadors about a new community message (except sender).
 * Drops expired subscriptions (410/404).
 */
async function notifyCommunityMessage(program, { sender, channelId, text, messageId }) {
  if (!pushConfigured()) return { sent: 0, skipped: true, reason: 'not_configured' };
  const channelName = (program.channels || []).find((c) => c.id === channelId)?.name || `#${channelId}`;
  const preview = String(text || '').slice(0, 100);
  const payload = {
    title: `MENES · ${channelName}`,
    body: `${sender.displayName || 'Ambassador'}: ${preview}`,
    data: {
      view: 'community',
      channel: channelId,
      messageId,
      type: 'chat',
    },
  };

  let sent = 0;
  let failed = 0;
  const targets = (program.ambassadors || []).filter((a) =>
    a.id !== sender.id
    && a.status === 'active'
    && shouldSendPush(a, 'chat')
    && Array.isArray(a.pushSubscriptions)
    && a.pushSubscriptions.length
  );

  for (const amb of targets) {
    const result = await sendPushToAmbassador(amb, payload);
    sent += result.sent || 0;
    failed += result.failed || 0;
  }

  return { sent, failed, targets: targets.length };
}

module.exports = {
  pushConfigured,
  getPublicKey,
  normalizeSubscription,
  upsertSubscription,
  removeSubscription,
  sendPushToSubscription,
  sendPushToAmbassador,
  flushPendingWebPush,
  notifyCommunityMessage,
};
