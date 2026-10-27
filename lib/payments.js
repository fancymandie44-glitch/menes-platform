function siteUrl() {
  const url = process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://www.mymenes.com';
  if (/netlify\.app$/i.test(String(url).replace(/\/$/, '')) && process.env.URL) return process.env.URL;
  return url;
}

function cents(total) {
  return Math.round(Number(total || 0) * 100);
}

function discountCents(order) {
  return Math.max(0, cents(order.discount || 0));
}

function appendStripeLineItems(params, order) {
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
}

function buildStripeSessionParams(order, { klarnaOnly = false, couponId = '' } = {}) {
  const base = siteUrl();
  const method = klarnaOnly ? 'klarna' : 'stripe';
  const params = new URLSearchParams();
  params.append('mode', 'payment');
  params.append('currency', 'cad');
  params.append('adaptive_pricing[enabled]', 'false');
  params.append('success_url', `${base}/?paid=1&order=${order.id}&method=${method}`);
  params.append('cancel_url', `${base}/?cancel=1`);
  params.append('customer_email', order.customer.email);
  params.append('client_reference_id', order.id);
  if (order.discountCode) params.append('metadata[promo_code]', String(order.discountCode).slice(0, 40));
  if (discountCents(order) > 0) params.append('metadata[discount_cents]', String(discountCents(order)));
  if (klarnaOnly) {
    params.append('payment_method_types[]', 'klarna');
  } else {
    params.append('payment_method_types[]', 'card');
    params.append('payment_method_types[]', 'klarna');
  }
  appendStripeLineItems(params, order);
  if (couponId) params.append('discounts[0][coupon]', couponId);
  return params;
}

async function createStripeCoupon(key, order) {
  const amount = discountCents(order);
  if (!(amount > 0)) return { id: '' };
  const params = new URLSearchParams();
  params.append('amount_off', String(amount));
  params.append('currency', 'cad');
  params.append('duration', 'once');
  params.append('name', String(order.discountCode || 'Promo').slice(0, 40));
  params.append('metadata[order_id]', String(order.id || '').slice(0, 40));
  const res = await fetch('https://api.stripe.com/v1/coupons', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.error?.message || 'Erreur coupon Stripe' };
  return { id: data.id || '' };
}

async function stripeCheckout(order, klarnaOnly = false) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { error: 'Stripe non configuré. Ajoute STRIPE_SECRET_KEY dans Netlify.' };

  let couponId = '';
  if (discountCents(order) > 0) {
    const coupon = await createStripeCoupon(key, order);
    if (coupon.error) return { error: coupon.error };
    couponId = coupon.id || '';
  }

  const params = buildStripeSessionParams(order, { klarnaOnly, couponId });
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
  const itemTotal = Number(order.subtotal ?? order.items.reduce((s, i) => s + i.price * i.qty, 0));
  const taxTotal = Number(order.tax?.amount || 0);
  const discount = Math.max(0, Number(order.discount || 0));
  const breakdown = {
    item_total: { currency_code: 'CAD', value: itemTotal.toFixed(2) },
    tax_total: { currency_code: 'CAD', value: taxTotal.toFixed(2) },
  };
  if (discount > 0) {
    breakdown.discount = { currency_code: 'CAD', value: discount.toFixed(2) };
  }
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
          value: Number(order.total).toFixed(2),
          breakdown,
        },
        items: order.items.map((i) => ({
          name: `${i.name} (${i.size})`,
          quantity: String(i.qty),
          unit_amount: { currency_code: 'CAD', value: Number(i.price).toFixed(2) },
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
            name: `${item.name} (${item.size || '—'})`,
            quantity: String(item.qty),
            base_price_money: { amount: cents(item.price), currency: 'CAD' },
          })),
          ...(order.tax?.amount > 0 ? [{
            name: `Taxes (${order.tax.label})`,
            quantity: '1',
            base_price_money: { amount: cents(order.tax.amount), currency: 'CAD' },
          }] : []),
        ],
        ...(discountCents(order) > 0 ? {
          discounts: [{
            uid: 'promo',
            name: String(order.discountCode || 'Promo').slice(0, 40),
            type: 'FIXED_AMOUNT',
            amount_money: { amount: discountCents(order), currency: 'CAD' },
            scope: 'ORDER',
          }],
        } : {}),
      },
      checkout_options: {
        redirect_url: `${base}/?paid=1&order=${order.id}&method=square`,
        ask_for_shipping_address: true,
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

module.exports = {
  stripeCheckout,
  paypalCheckout,
  squareCheckout,
  cryptoCheckout,
  siteUrl,
  cents,
  discountCents,
  buildStripeSessionParams,
  appendStripeLineItems,
};
