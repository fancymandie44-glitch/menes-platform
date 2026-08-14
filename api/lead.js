const { corsHeaders } = require('../lib/cors');
const { notifySimple, brandShell, escHtml, resendConfigured } = require('../lib/notify');

exports.handler = async (event) => {
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    if (!resendConfigured()) {
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({ error: 'Service email non configuré. Contactez-nous sur Instagram.' }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const name = String(body.name || '').trim().slice(0, 80);
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim().slice(0, 40);
    const collection = String(body.collection || '').trim().slice(0, 80);
    const karat = String(body.karat || '').trim().slice(0, 80);
    const config = String(body.config || '').trim().slice(0, 200);
    const message = String(body.message || '').trim().slice(0, 2000);
    const source = String(body.source || 'grillz').slice(0, 40);

    if (!name || !email || !phone) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nom, email et téléphone requis' }) };
    }

    const html = brandShell({
      title: 'Nouvelle demande grillz',
      bodyHtml: `<table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:8px 0;color:#9a958c">Nom</td><td style="padding:8px 0">${escHtml(name)}</td></tr>
        <tr><td style="padding:8px 0;color:#9a958c">Email</td><td style="padding:8px 0">${escHtml(email)}</td></tr>
        <tr><td style="padding:8px 0;color:#9a958c">Téléphone</td><td style="padding:8px 0">${escHtml(phone)}</td></tr>
        <tr><td style="padding:8px 0;color:#9a958c">Collection</td><td style="padding:8px 0">${escHtml(collection)}</td></tr>
        <tr><td style="padding:8px 0;color:#9a958c">Karat</td><td style="padding:8px 0">${escHtml(karat)}</td></tr>
        <tr><td style="padding:8px 0;color:#9a958c">Config</td><td style="padding:8px 0">${escHtml(config)}</td></tr>
        <tr><td style="padding:8px 0;color:#9a958c">Message</td><td style="padding:8px 0">${escHtml(message)}</td></tr>
        <tr><td style="padding:8px 0;color:#9a958c">Source</td><td style="padding:8px 0">${escHtml(source)}</td></tr>
      </table>`,
    });

    const sent = await notifySimple({
      subject: `MENES Grillz · demande de ${name}`,
      html,
    });

    if (!sent.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: sent.error || 'Envoi impossible' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Erreur' }) };
  }
};
