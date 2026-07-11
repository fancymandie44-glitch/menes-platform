async function notifyMerchant(order, method, status) {
  await fetch('https://formsubmit.co/ajax/mymenes2022@gmail.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      _subject: `Commande MENES #${order.id} — ${method}`,
      _template: 'table',
      Client: order.customer.name,
      Email: order.customer.email,
      Téléphone: order.customer.phone,
      Adresse: order.customer.address,
      Sous_total: `${(order.subtotal ?? order.total).toFixed(2)}$ CAD`,
      Taxes: order.tax?.amount ? `${order.tax.amount.toFixed(2)}$ (${order.tax.label})` : 'Aucune',
      Total: `${order.total.toFixed(2)}$ CAD`,
      Paiement: method,
      Statut: status,
      Articles: order.items.map((i) => `${i.name} (${i.size}) x${i.qty}`).join(', '),
    }),
  }).catch(() => {});
}

function siteUrl() {
  return process.env.URL || 'https://boutiquemenes.netlify.app';
}

function cents(total) {
  return Math.round(total * 100);
}

async function stripeCheckout(order, klarnaOnly = false) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { error: 'Stripe non configuré. Ajoute STRIPE_SECRET_KEY dans Netlify.' };

  const base = siteUrl();
  const params = new URLSearchParams();
  params.append('mode', 'payment');
  params.append('currency', 'cad');
  params.append('adaptive_pricing[enabled]', 'false');
  params.append('success_url', `${base}/?paid=1&order=${order.id}&method=${klarnaOnly ? 'klarna' : 'stripe'}`);
  params.append('cancel_url', `${base}/?cancel=1`);
  params.append('customer_email', order.customer.email);
  params.append('client_reference_id', order.id);
  if (klarnaOnly) {
    params.append('payment_method_types[]', 'klarna');
  } else {
    params.append('payment_method_types[]', 'card');
    params.append('payment_method_types[]', 'klarna');
  }

  order.items.forEach((item, i) => {
    params.append(`line_items[${i}][price_data][currency]`, 'cad');
    params.append(`line_items[${i}][price_data][unit_amount]`, String(cents(item.price)));
    params.append(`line_items[${i}][price_data][product_data][name]`, `${item.name} (${item.size})`);
    params.append(`line_items[${i}][quantity]`, String(item.qty));
  });

  if (order.tax?.amount > 0) {
    const i = order.items.length;
    params.append(`line_items[${i}][price_data][currency]`, 'cad');
    params.append(`line_items[${i}][price_data][unit_amount]`, String(cents(order.tax.amount)));
    params.append(`line_items[${i}][price_data][product_data][name]`, `Taxes (${order.tax.label})`);
    params.append(`line_items[${i}][quantity]`, '1');
  }

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  const data = await res.json();
  if (!res.ok) return { error: data.error?.message || 'Erreur Stripe' };

  await notifyMerchant(order, 'Carte / Klarna (Stripe)', 'Redirection paiement');
  return { checkoutUrl: data.url };
}

async function paypalCheckout(order) {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  const sandbox = process.env.PAYPAL_SANDBOX !== 'false';
  if (!clientId || !secret) return { error: 'PayPal non configuré. Ajoute PAYPAL_CLIENT_ID et PAYPAL_CLIENT_SECRET dans Netlify.' };

  const apiBase = sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';

  const authRes = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const auth = await authRes.json();
  if (!auth.access_token) return { error: 'Erreur authentification PayPal' };

  const base = siteUrl();
  const orderRes = await fetch(`${apiBase}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: order.id,
        amount: {
          currency_code: 'CAD',
          value: order.total.toFixed(2),
          breakdown: {
            item_total: {
              currency_code: 'CAD',
              value: (order.subtotal ?? order.items.reduce((s, i) => s + i.price * i.qty, 0)).toFixed(2),
            },
            tax_total: {
              currency_code: 'CAD',
              value: (order.tax?.amount || 0).toFixed(2),
            },
          },
        },
        items: order.items.map((i) => ({
          name: `${i.name} (${i.size})`,
          quantity: String(i.qty),
          unit_amount: { currency_code: 'CAD', value: i.price.toFixed(2) },
        })),
      }],
      application_context: {
        return_url: `${base}/?paid=1&order=${order.id}&method=paypal`,
        cancel_url: `${base}/?cancel=1`,
        brand_name: 'MENES',
        user_action: 'PAY_NOW',
      },
    }),
  });

  const paypalOrder = await orderRes.json();
  const approve = paypalOrder.links?.find((l) => l.rel === 'approve');
  if (!approve) return { error: 'Erreur création commande PayPal' };

  await notifyMerchant(order, 'PayPal', 'Redirection paiement');
  return { checkoutUrl: approve.href };
}

async function squareCheckout(order) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  const locationId = process.env.SQUARE_LOCATION_ID;
  const sandbox = process.env.SQUARE_SANDBOX === 'true';
  if (!token || !locationId) return { error: 'Square non configuré. Ajoute SQUARE_ACCESS_TOKEN et SQUARE_LOCATION_ID dans Netlify.' };

  const apiBase = sandbox ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';
  const base = siteUrl();

  const res = await fetch(`${apiBase}/v2/online-checkout/payment-links`, {
    method: 'POST',
    headers: {
      'Square-Version': '2024-01-18',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      idempotency_key: `${order.id}-${Date.now()}`,
      order: {
        location_id: locationId,
        reference_id: order.id,
        line_items: [
          ...order.items.map((item) => ({
            name: `${item.name} (${item.size})`,
            quantity: String(item.qty),
            base_price_money: { amount: cents(item.price), currency: 'CAD' },
          })),
          ...(order.tax?.amount > 0 ? [{
            name: `Taxes (${order.tax.label})`,
            quantity: '1',
            base_price_money: { amount: cents(order.tax.amount), currency: 'CAD' },
          }] : []),
        ],
      },
      checkout_options: {
        redirect_url: `${base}/?paid=1&order=${order.id}&method=square`,
        ask_for_shipping_address: true,
      },
      pre_populated_data: {
        buyer_email: order.customer.email,
        buyer_phone_number: order.customer.phone,
      },
    }),
  });

  const data = await res.json();
  if (!res.ok) return { error: data.errors?.[0]?.detail || 'Erreur Square' };

  await notifyMerchant(order, 'Square', 'Redirection paiement');
  return { checkoutUrl: data.payment_link?.url || data.payment_link?.long_url };
}

async function cryptoCheckout(order) {
  const apiKey = process.env.COINBASE_COMMERCE_API_KEY;
  if (!apiKey) return { error: 'Crypto non configuré. Ajoute COINBASE_COMMERCE_API_KEY dans Netlify (coinbase.com/commerce).' };

  const base = siteUrl();
  const res = await fetch('https://api.commerce.coinbase.com/charges', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CC-Api-Key': apiKey,
      'X-CC-Version': '2018-03-22',
    },
    body: JSON.stringify({
      name: `Commande MENES #${order.id}`,
      description: order.items.map((i) => `${i.name} x${i.qty}`).join(', '),
      pricing_type: 'fixed_price',
      local_price: { amount: order.total.toFixed(2), currency: 'CAD' },
      metadata: { order_id: order.id, customer_email: order.customer.email },
      redirect_url: `${base}/?paid=1&order=${order.id}&method=crypto`,
      cancel_url: `${base}/?cancel=1`,
    }),
  });

  const data = await res.json();
  const url = data.data?.hosted_url;
  if (!url) return { error: data.error?.message || 'Erreur Coinbase Commerce' };

  await notifyMerchant(order, 'Crypto (BTC/ETH/USDC)', 'Redirection paiement');
  return { checkoutUrl: url };
}

module.exports = { stripeCheckout, paypalCheckout, squareCheckout, cryptoCheckout, notifyMerchant, siteUrl };
