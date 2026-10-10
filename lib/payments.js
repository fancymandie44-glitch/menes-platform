function siteUrl() {
  return process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://www.mymenes.com';
}

function cents(total) {
  return Math.round(Number(total || 0) * 100);
}

function isoCountry(code) {
  const raw = String(code || 'CA').trim().toUpperCase();
  if (raw === 'OTHER' || raw.length !== 2) return 'CA';
  return raw;
}

/** Spread MENES promo onto line items so Stripe/Square charge the same total. */
function buildProviderLines(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const lines = items.map((item) => ({
    name: String(item.name || 'MENES'),
    size: String(item.size || item.variantStr || '—'),
    qty: Math.max(1, parseInt(item.qty, 10) || 1),
    unitCents: cents(item.price),
  }));
  const discountCents = Math.max(0, cents(order?.discount || 0));
  const subtotalCents = lines.reduce((s, l) => s + l.unitCents * l.qty, 0);
  if (discountCents > 0 && subtotalCents > 0) {
    let remaining = Math.min(discountCents, subtotalCents);
    lines.forEach((line, idx) => {
      const lineTotal = line.unitCents * line.qty;
      const share = idx === lines.length - 1
        ? remaining
        : Math.min(remaining, Math.round((discountCents * lineTotal) / subtotalCents));
      remaining -= share;
      const nextLine = Math.max(0, lineTotal - share);
      line.unitCents = Math.max(0, Math.round(nextLine / line.qty));
    });
    const goods = lines.reduce((s, l) => s + l.unitCents * l.qty, 0);
    const target = Math.max(0, subtotalCents - Math.min(discountCents, subtotalCents));
    const drift = goods - target;
    if (drift && lines.length) {
      const last = lines[lines.length - 1];
      last.unitCents = Math.max(0, last.unitCents - drift);
    }
  }
  return {
    lines,
    taxCents: cents(order?.tax?.amount || 0),
    taxLabel: order?.tax?.label || 'Taxes',
    promo: String(order?.discountCode || '').trim(),
    discountCents,
  };
}

function appendStripeShipping(params, order) {
  const c = order?.customer || {};
  if (!c.address || !c.name) return;
  params.append('payment_intent_data[shipping][name]', c.name);
  if (c.phone) params.append('payment_intent_data[shipping][phone]', String(c.phone).slice(0, 20));
  params.append('payment_intent_data[shipping][address][line1]', String(c.address).slice(0, 200));
  if (c.city) params.append('payment_intent_data[shipping][address][city]', String(c.city).slice(0, 80));
  if (c.province) params.append('payment_intent_data[shipping][address][state]', String(c.province).slice(0, 40));
  if (c.postal) params.append('payment_intent_data[shipping][address][postal_code]', String(c.postal).slice(0, 20));
  params.append('payment_intent_data[shipping][address][country]', isoCountry(c.country));
}

async function stripeCheckout(order, klarnaOnly = false) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { error: 'Stripe non configuré. Ajoute STRIPE_SECRET_KEY dans Netlify.' };

  const base = siteUrl();
  const priced = buildProviderLines(order);
  const params = new URLSearchParams();
  params.append('mode', 'payment');
  params.append('currency', 'cad');
  params.append('adaptive_pricing[enabled]', 'false');
  params.append('success_url', `${base}/?paid=1&order=${order.id}&method=${klarnaOnly ? 'klarna' : 'stripe'}`);
  params.append('cancel_url', `${base}/?cancel=1`);
  params.append('customer_email', order.customer.email);
  params.append('client_reference_id', order.id);
  params.append('billing_address_collection', 'auto');
  params.append('metadata[order_id]', String(order.id || ''));
  if (priced.promo) params.append('metadata[promo]', priced.promo);
  params.append('payment_intent_data[metadata][order_id]', String(order.id || ''));
  if (priced.promo) params.append('payment_intent_data[metadata][promo]', priced.promo);
  appendStripeShipping(params, order);
  if (klarnaOnly) {
    params.append('payment_method_types[]', 'klarna');
  } else {
    params.append('payment_method_types[]', 'card');
    params.append('payment_method_types[]', 'klarna');
  }

  priced.lines.forEach((item, i) => {
    const label = priced.promo
      ? `${item.name} (${item.size}) · ${priced.promo}`
      : `${item.name} (${item.size})`;
    params.append(`line_items[${i}][price_data][currency]`, 'cad');
    params.append(`line_items[${i}][price_data][unit_amount]`, String(item.unitCents));
    params.append(`line_items[${i}][price_data][product_data][name]`, label);
    params.append(`line_items[${i}][quantity]`, String(item.qty));
  });

  if (priced.taxCents > 0) {
    const i = priced.lines.length;
    params.append(`line_items[${i}][price_data][currency]`, 'cad');
    params.append(`line_items[${i}][price_data][unit_amount]`, String(priced.taxCents));
    params.append(`line_items[${i}][price_data][product_data][name]`, `Taxes (${priced.taxLabel})`);
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

  return { checkoutUrl: data.url, provider: 'stripe' };
}

async function paypalCheckout(order) {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  const sandbox = process.env.PAYPAL_SANDBOX === 'true';
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
  const priced = buildProviderLines(order);
  const goods = priced.lines.reduce((s, l) => s + l.unitCents * l.qty, 0);
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
              value: (goods / 100).toFixed(2),
            },
            tax_total: {
              currency_code: 'CAD',
              value: (order.tax?.amount || 0).toFixed(2),
            },
          },
        },
        items: priced.lines.map((i) => ({
          name: `${i.name} (${i.size})`,
          quantity: String(i.qty),
          unit_amount: { currency_code: 'CAD', value: (i.unitCents / 100).toFixed(2) },
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

  return { checkoutUrl: approve.href, provider: 'paypal' };
}

async function squareCheckout(order) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  const locationId = process.env.SQUARE_LOCATION_ID;
  const sandbox = process.env.SQUARE_SANDBOX === 'true';
  if (!token || !locationId) return { error: 'Square non configuré. Ajoute SQUARE_ACCESS_TOKEN et SQUARE_LOCATION_ID dans Netlify.' };

  const apiBase = sandbox ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';
  const base = siteUrl();

  let phone = String(order.customer?.phone || '').replace(/[^\d+]/g, '');
  if (phone && !phone.startsWith('+')) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) phone = `+1${digits}`;
    else if (digits.length === 11 && digits.startsWith('1')) phone = `+${digits}`;
    else phone = '';
  }

  const prePopulated = { buyer_email: order.customer.email };
  if (phone) prePopulated.buyer_phone_number = phone;
  const priced = buildProviderLines(order);
  const lineItems = [
    ...priced.lines.map((item) => ({
      name: priced.promo ? `${item.name} (${item.size}) · ${priced.promo}` : `${item.name} (${item.size})`,
      quantity: String(item.qty),
      base_price_money: { amount: item.unitCents, currency: 'CAD' },
    })),
    ...(priced.taxCents > 0 ? [{
      name: `Taxes (${priced.taxLabel})`,
      quantity: '1',
      base_price_money: { amount: priced.taxCents, currency: 'CAD' },
    }] : []),
  ];

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
        line_items: lineItems,
      },
      checkout_options: {
        redirect_url: `${base}/?paid=1&order=${order.id}&method=square`,
        ask_for_shipping_address: false,
      },
      pre_populated_data: prePopulated,
    }),
  });

  const data = await res.json();
  if (!res.ok) return { error: data.errors?.[0]?.detail || 'Erreur Square' };

  return { checkoutUrl: data.payment_link?.url || data.payment_link?.long_url, provider: 'square' };
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

  return { checkoutUrl: url, provider: 'crypto' };
}

module.exports = { stripeCheckout, paypalCheckout, squareCheckout, cryptoCheckout, siteUrl, buildProviderLines, cents };
