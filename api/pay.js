const { stripeCheckout, paypalCheckout, squareCheckout, cryptoCheckout } = require('../lib/payments');
const { readSiteStore, writeSiteStore, resolveSiteId, setLambdaEvent } = require('../lib/platform');
const { corsHeaders } = require('../lib/cors');
const { buildTrustedOrder } = require('../lib/order-pricing');
const { notifyMerchant } = require('../lib/notify');
const { readProgram, mergeAmbassadorDiscounts } = require('../lib/ambassador-data');

async function recordOrder(order, method, siteId) {
  const store = await readSiteStore(siteId);
  if (!store.orders) store.orders = [];
  const existing = store.orders.findIndex((o) => o.id === order.id);
  const entry = {
    ...order,
    payment: method,
    method,
    status: order.status || 'pending',
    date: order.date || new Date().toISOString(),
  };
  if (existing >= 0) store.orders[existing] = { ...store.orders[existing], ...entry };
  else store.orders.push(entry);
  await writeSiteStore(siteId, store);
  return store;
}

exports.handler = async (event) => {
  setLambdaEvent(event);
  const cors = corsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const host = event.headers['x-forwarded-host'] || event.headers.host || '';
    const params = event.queryStringParameters || {};
    const headerSiteId = event.headers['x-site-id'] || event.headers['X-Site-Id'];
    const siteId = await resolveSiteId(host, params.site || headerSiteId);
    const body = JSON.parse(event.body || '{}');
    const { method } = body;
    if (!method) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Méthode manquante' }) };
    }

    const store = await readSiteStore(siteId);
    let pricedStore = store;
    try {
      pricedStore = mergeAmbassadorDiscounts(store, await readProgram());
    } catch (e) {
      console.error('pay mergeAmbassadorDiscounts', e.message);
    }
    const priced = buildTrustedOrder(pricedStore, body.order || {});
    if (priced.error) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: priced.error }) };
    }
    const order = priced.order;

    let result;
    switch (method) {
      case 'stripe':
        result = await stripeCheckout(order, false);
        if (result.error && /expired|non configuré|invalid api key|api key/i.test(result.error)) {
          const fallback = await squareCheckout(order);
          if (!fallback.error) result = fallback;
        }
        break;
      case 'klarna':
        result = await stripeCheckout(order, true);
        break;
      case 'paypal':
        result = await paypalCheckout(order);
        break;
      case 'square':
      case 'card':
        result = await squareCheckout(order);
        break;
      case 'crypto':
        result = await cryptoCheckout(order);
        break;
      default:
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Méthode invalide' }) };
    }

    if (result.error) {
      return {
        statusCode: 503,
        headers: cors,
        body: JSON.stringify({ error: 'Paiement temporairement indisponible. Réessayez ou contactez-nous.' }),
      };
    }

    if (!result.checkoutUrl) {
      return {
        statusCode: 502,
        headers: cors,
        body: JSON.stringify({ error: 'Lien de paiement introuvable. Réessayez.' }),
      };
    }

    const savedStore = await recordOrder(order, method, siteId);
    await notifyMerchant(order, method, 'En attente de paiement', savedStore);

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ checkoutUrl: result.checkoutUrl, orderId: order.id, total: order.total }),
    };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Erreur serveur paiement' }) };
  }
};
