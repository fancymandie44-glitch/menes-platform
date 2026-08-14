// Netlify Function — Square Checkout
// Set env vars in Netlify: SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, SQUARE_SANDBOX=true

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const token = process.env.SQUARE_ACCESS_TOKEN;
  const locationId = process.env.SQUARE_LOCATION_ID;
  const sandbox = process.env.SQUARE_SANDBOX === 'true';
  const baseUrl = sandbox
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com';

  if (!token || !locationId) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        error: 'Square not configured',
        message: 'Configure SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID in Netlify env vars',
      }),
    };
  }

  try {
    const { order } = JSON.parse(event.body);
    const lineItems = order.items.map((item) => ({
      name: `${item.name} (${item.size})`,
      quantity: String(item.qty),
      base_price_money: {
        amount: Math.round(item.price * 100),
        currency: 'CAD',
      },
    }));

    const idempotencyKey = `${order.id}-${Date.now()}`;

    const response = await fetch(`${baseUrl}/v2/online-checkout/payment-links`, {
      method: 'POST',
      headers: {
        'Square-Version': '2024-01-18',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        idempotency_key: idempotencyKey,
        order: {
          location_id: locationId,
          line_items: lineItems,
          reference_id: order.id,
        },
        checkout_options: {
          redirect_url: `${process.env.URL || 'https://boutiquemenes.netlify.app'}/?paid=1&order=${order.id}&method=square`,
          ask_for_shipping_address: true,
        },
        pre_populated_data: {
          buyer_email: order.customer.email,
          buyer_phone_number: order.customer.phone,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Square error:', data);
      return { statusCode: 500, body: JSON.stringify({ error: data.errors?.[0]?.detail || 'Square error' }) };
    }

    const checkoutUrl = data.payment_link?.url || data.payment_link?.long_url;

    try {
      const { notifyMerchant } = require('../lib/notify');
      await notifyMerchant(order, 'Square', 'En attente de paiement');
    } catch (e) {
      console.log('Merchant notify failed:', e.message);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ checkoutUrl, orderId: order.id }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
