const { readSiteStore, writeSiteStore, resolveSiteId, setLambdaEvent } = require('../lib/platform');
const { corsHeaders } = require('../lib/cors');
const { checkAdminAuth } = require('../lib/admin-auth');
const { notifySimple, brandShell, escHtml, resendConfigured } = require('../lib/notify');

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function cleanEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

exports.handler = async (event) => {
  setLambdaEvent(event);
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const host = event.headers['x-forwarded-host'] || event.headers.host || '';
  const params = event.queryStringParameters || {};
  const headerSiteId = event.headers['x-site-id'] || event.headers['X-Site-Id'];
  const siteId = await resolveSiteId(host, params.site || headerSiteId);

  try {
    if (event.httpMethod === 'GET') {
      const store = await readSiteStore(siteId);
      const list = Array.isArray(store.reviews) ? store.reviews : [];
      const productId = params.productId || '';
      const status = params.status || 'approved';
      let out = list.filter((r) => (status === 'all' ? true : r.status === status));
      if (productId) out = out.filter((r) => r.productId === productId);
      out = out
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .slice(0, Math.min(100, parseInt(params.limit || '40', 10) || 40))
        .map(({ authorEmail, ...pub }) => pub);
      return { statusCode: 200, headers, body: JSON.stringify({ reviews: out }) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const store = await readSiteStore(siteId);
      if (!Array.isArray(store.reviews)) store.reviews = [];

      // Admin moderation
      if (body.action) {
        const auth = checkAdminAuth(event);
        if (!auth.ok) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };
        const review = store.reviews.find((r) => r.id === body.id);
        if (!review) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Avis introuvable' }) };
        if (body.action === 'approve') review.status = 'approved';
        else if (body.action === 'reject') review.status = 'rejected';
        else if (body.action === 'delete') store.reviews = store.reviews.filter((r) => r.id !== body.id);
        else return { statusCode: 400, headers, body: JSON.stringify({ error: 'Action invalide' }) };
        await writeSiteStore(siteId, store);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, reviews: store.reviews }) };
      }

      // Public submit
      const productId = String(body.productId || '').trim();
      const authorName = String(body.authorName || '').trim().slice(0, 60);
      const authorEmail = cleanEmail(body.authorEmail);
      const title = String(body.title || '').trim().slice(0, 80);
      const text = String(body.body || body.text || '').trim().slice(0, 1200);
      const rating = Math.max(1, Math.min(5, parseInt(body.rating, 10) || 0));

      if (!productId || !authorName || !text || rating < 1) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nom, note et avis requis' }) };
      }
      if (authorEmail && !isEmail(authorEmail)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email invalide' }) };
      }

      const product = (store.products || []).find((p) => p.id === productId);
      if (!product) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Produit introuvable' }) };

      // Light anti-spam: same email+product within 24h
      const dayAgo = Date.now() - 86400000;
      const dup = store.reviews.find((r) =>
        r.productId === productId
        && ((authorEmail && r.authorEmail === authorEmail) || r.authorName.toLowerCase() === authorName.toLowerCase())
        && new Date(r.createdAt).getTime() > dayAgo
      );
      if (dup) {
        return { statusCode: 429, headers, body: JSON.stringify({ error: 'Tu as déjà laissé un avis récemment sur ce produit' }) };
      }

      const review = {
        id: uid('rev'),
        productId,
        productName: product.name || '',
        authorName,
        authorEmail: authorEmail || '',
        rating,
        title,
        body: text,
        status: 'pending',
        createdAt: new Date().toISOString(),
        locale: body.locale === 'en' ? 'en' : 'fr',
        orderId: body.orderId ? String(body.orderId).slice(0, 40) : '',
      };
      store.reviews.unshift(review);
      await writeSiteStore(siteId, store);

      if (resendConfigured()) {
        notifySimple({
          store,
          subject: `Nouvel avis MENES · ${product.name} · ${rating}/5`,
          html: brandShell({
            title: 'Nouvel avis en attente',
            bodyHtml: `<p style="color:#9a958c">${escHtml(product.name)} · ${rating}/5 · ${escHtml(authorName)}</p><p style="color:#f4f2ee">${escHtml(title || '')}</p><p style="color:#9a958c">${escHtml(text)}</p>`,
          }),
        }).catch(() => {});
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, id: review.id, message: 'Merci — votre avis sera publié après validation' }),
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Erreur avis' }) };
  }
};
