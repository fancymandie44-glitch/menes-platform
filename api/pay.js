const { stripeCheckout, paypalCheckout, squareCheckout, cryptoCheckout } = require('../lib/payments');
const { readSiteStore, writeSiteStore, resolveSiteId, setLambdaEvent } = require('../lib/platform');
const { corsHeaders } = require('../lib/cors');

async function recordOrder(order, method, event) {
  try {
    const host = event.headers['x-forwarded-host'] || event.headers.host || '';
    const params = event.queryStringParameters || {};
    const headerSiteId = event.headers['x-site-id'] || event.headers['X-Site-Id'];
    const siteId = await resolveSiteId(host, params.site || headerSiteId);
    const store = await readSiteStore(siteId);
    if (!store.orders) store.orders = [];
    const entry = {
      ...order,
      payment: method,
      method,
      status: order.status || 'pending',
      date: order.date || new Date().toISOString(),
    };
    store.orders.push(entry);
    await writeSiteStore(siteId, store);
  } catch (e) {
    console.log('Order record failed:', e.message);
  }
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

  const host = event.headers['x-forwarded-host'] || event.headers.host || '';

  try {
    const { order, method } = JSON.parse(event.body);
    if (!order || !method) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Commande ou méthode manquante' }) };
    }

    let result;
    switch (method) {
      case 'stripe':
        result = await stripeCheckout(order, false);
        break;
      case 'klarna':
        result = await stripeCheckout(order, true);
        break;
      case 'paypal':
        result = await paypalCheckout(order);
        break;
      case 'square':
        result = await squareCheckout(order);
        break;
      case 'crypto':
        result = await cryptoCheckout(order);
        break;
      default:
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Méthode invalide' }) };
    }

    if (result.error) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ error: result.error }) };
    }

    await recordOrder(order, method, event);

    return { statusCode: 200, headers: cors, body: JSON.stringify({ checkoutUrl: result.checkoutUrl }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
