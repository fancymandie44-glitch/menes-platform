const { readSiteStore, writeSiteStore, resolveSiteId, setLambdaEvent } = require('../lib/platform');
const { corsHeaders } = require('../lib/cors');
const { notifyMerchant, notifyCustomer } = require('../lib/notify');

async function verifySquarePayment(orderId) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) return { verified: false, reason: 'square_not_configured' };
  const sandbox = process.env.SQUARE_SANDBOX === 'true';
  const apiBase = sandbox ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';

  // Search orders by reference_id
  try {
    const res = await fetch(`${apiBase}/v2/orders/search`, {
      method: 'POST',
      headers: {
        'Square-Version': '2024-01-18',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        location_ids: process.env.SQUARE_LOCATION_ID ? [process.env.SQUARE_LOCATION_ID] : undefined,
        query: {
          filter: {
            reference_id: { exact: orderId },
          },
        },
        limit: 5,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.orders)) {
      const paid = data.orders.find((o) =>
        ['OPEN', 'COMPLETED'].includes(o.state)
        && (o.tenders?.length || o.net_amounts?.total_money?.amount > 0)
      );
      if (paid) return { verified: true, provider: 'square', providerOrderId: paid.id };
      // Payment links sometimes create orders with COMPLETED state
      const completed = data.orders.find((o) => o.state === 'COMPLETED' || o.state === 'OPEN');
      if (completed) return { verified: true, provider: 'square', providerOrderId: completed.id };
    }
  } catch (e) {
    return { verified: false, reason: e.message };
  }

  // Fallback: list recent payments and match note/reference (best-effort)
  try {
    const res = await fetch(`${apiBase}/v2/payments?limit=20`, {
      headers: {
        'Square-Version': '2024-01-18',
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json().catch(() => ({}));
    const hit = (data.payments || []).find((p) =>
      p.status === 'COMPLETED'
      && (String(p.order_id || '').includes(orderId)
        || String(p.note || '').includes(orderId)
        || String(p.reference_id || '') === orderId)
    );
    if (hit) return { verified: true, provider: 'square', providerPaymentId: hit.id };
  } catch {}

  return { verified: false, reason: 'not_found' };
}

async function verifyStripeSession(orderId) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { verified: false, reason: 'stripe_not_configured' };
  try {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions?limit=20`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = await res.json().catch(() => ({}));
    const session = (data.data || []).find((s) =>
      s.client_reference_id === orderId && s.payment_status === 'paid'
    );
    if (session) return { verified: true, provider: 'stripe', sessionId: session.id };
  } catch (e) {
    return { verified: false, reason: e.message };
  }
  return { verified: false, reason: 'not_found' };
}

exports.handler = async (event) => {
  setLambdaEvent(event);
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const orderId = String(body.orderId || body.order || '').trim();
    const method = String(body.method || 'square').trim().toLowerCase();
    if (!orderId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'orderId requis' }) };
    }

    const host = event.headers['x-forwarded-host'] || event.headers.host || '';
    const params = event.queryStringParameters || {};
    const headerSiteId = event.headers['x-site-id'] || event.headers['X-Site-Id'];
    const siteId = await resolveSiteId(host, params.site || headerSiteId);
    const store = await readSiteStore(siteId);
    if (!Array.isArray(store.orders)) store.orders = [];

    let order = store.orders.find((o) => o.id === orderId);
    if (!order) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: false,
          missing: true,
          status: 'pending',
          message: 'Commande en cours de synchronisation',
        }),
      };
    }

    const alreadyPaid = ['paid', 'processing', 'shipped', 'delivered'].includes(order.status);
    if (alreadyPaid) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, orderId, status: order.status, alreadyPaid: true, verified: true }),
      };
    }

    let verification = { verified: false };
    if (method === 'square' || method === 'card' || order.payment === 'square' || order.method === 'square') {
      verification = await verifySquarePayment(orderId);
    } else if (method === 'stripe' || method === 'klarna' || order.payment === 'stripe') {
      verification = await verifyStripeSession(orderId);
    } else if (method === 'paypal') {
      // PayPal return without capture webhook: keep awaiting unless explicitly trusted via admin
      verification = { verified: false, reason: 'paypal_requires_capture' };
    } else if (method === 'crypto') {
      verification = { verified: false, reason: 'crypto_manual' };
    }

    // Allow admin override header for ops recovery only
    const admin = require('../lib/admin-auth').checkAdminAuth(event);
    if (!verification.verified && admin.ok && body.forcePaid === true) {
      verification = { verified: true, provider: 'admin_force' };
    }

    if (!verification.verified) {
      order.status = 'awaiting_payment';
      order.paymentReturnAt = new Date().toISOString();
      order.verifyReason = verification.reason || 'unverified';
      await writeSiteStore(siteId, store);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: false,
          orderId,
          status: order.status,
          verified: false,
          message: 'Paiement en cours de confirmation. Vous recevrez un email dès validation.',
        }),
      };
    }

    order.status = 'paid';
    order.paidAt = new Date().toISOString();
    order.payment = order.payment || method;
    order.method = order.method || method;
    order.verification = verification;

    const merchant = await notifyMerchant(order, method || order.payment || 'Paiement', 'PAYÉ ✓', store);
    const customer = await notifyCustomer(order, method || order.payment || 'Paiement');
    order.merchantNotifiedAt = new Date().toISOString();
    order.merchantNotify = merchant;
    order.customerNotify = customer;

    // Ambassador commission engine (idempotent)
    let commissionResult = null;
    try {
      const { readProgram, writeProgram } = require('../lib/ambassador-data');
      const { processPaidOrder } = require('../lib/ambassador-engine');
      const { sendSaleEmail } = require('../lib/ambassador-email');
      const program = await readProgram();
      commissionResult = processPaidOrder(program, order);
      await writeProgram(program);
      if (commissionResult?.created?.length) {
        const personal = commissionResult.created.find((c) => c.type === 'personal');
        const amb = program.ambassadors.find((a) => a.id === personal?.ambassadorId);
        if (amb && personal) await sendSaleEmail(amb, order, personal.amount);
      }
    } catch (e) {
      console.error('ambassador commission hook', e.message);
      commissionResult = { error: e.message };
    }

    await writeSiteStore(siteId, store);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        orderId,
        status: 'paid',
        verified: true,
        notified: Boolean(merchant?.ok),
        customerNotified: Boolean(customer?.ok),
        commission: commissionResult
          ? { created: commissionResult.created?.length || 0, skipped: commissionResult.skipped, reason: commissionResult.reason }
          : null,
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Erreur confirmation' }) };
  }
};
