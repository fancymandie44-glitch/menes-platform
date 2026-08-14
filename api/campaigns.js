const { readSiteStore, writeSiteStore, resolveSiteId, setLambdaEvent } = require('../lib/platform');
const { corsHeaders } = require('../lib/cors');
const { checkAdminAuth } = require('../lib/admin-auth');
const { resendConfigured, sendResend } = require('../lib/notify');

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function brandShell({ subject, preheader, bodyHtml, ctaLabel, ctaUrl, siteName }) {
  const name = siteName || 'MENES';
  const gold = '#c9a84c';
  const bg = '#050505';
  const surface = '#0f0f0f';
  const text = '#f4f2ee';
  const muted = '#9a958c';
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${subject}</title>
  <style>body{margin:0;background:${bg};color:${text};font-family:'DM Sans',Helvetica,Arial,sans-serif}
  .wrap{max-width:560px;margin:0 auto;padding:32px 20px}
  .brand{font-family:Georgia,'Times New Roman',serif;letter-spacing:0.28em;font-size:13px;color:${gold};text-align:center;margin-bottom:28px}
  .card{background:${surface};border:1px solid #2a2a2a;padding:28px 24px}
  h1{font-family:Georgia,'Times New Roman',serif;font-weight:600;font-size:28px;line-height:1.2;margin:0 0 14px;color:${text}}
  p{font-size:15px;line-height:1.65;color:${muted};margin:0 0 14px}
  .cta{display:inline-block;margin-top:10px;padding:14px 22px;background:${gold};color:#050505;text-decoration:none;font-weight:700;letter-spacing:0.04em;font-size:13px;text-transform:uppercase}
  .foot{margin-top:28px;text-align:center;font-size:11px;color:#6b665e;line-height:1.5}
  .pre{display:none;max-height:0;overflow:hidden}</style></head>
  <body><div class="pre">${preheader || ''}</div>
  <div class="wrap">
    <div class="brand">${name}</div>
    <div class="card">${bodyHtml}
      ${ctaLabel && ctaUrl ? `<p style="margin-top:22px"><a class="cta" href="${ctaUrl}">${ctaLabel}</a></p>` : ''}
    </div>
    <div class="foot">© ${new Date().getFullYear()} ${name}<br>Tu reçois cet email car tu es sur la liste VIP.</div>
  </div></body></html>`;
}

const TEMPLATES = {
  welcome: {
    name: 'Bienvenue VIP',
    subject: 'Bienvenue dans le cercle MENES',
    preheader: 'Ton accès anticipé commence ici.',
    bodyHtml: `<h1>Tu es dedans.</h1>
      <p>Merci de rejoindre la liste VIP MENES. Tu auras les drops en avant-première, les codes exclusifs, et le droit de porter ce que les autres suivront.</p>
      <p>Les −10% publics sont terminés. Trouve un <strong style="color:#c9a84c">ambassadeur MENES</strong> — son code exclusif débloque −10% sur ta commande.</p>`,
    ctaLabel: 'Voir la boutique',
  },
  drop: {
    name: 'Nouveau drop',
    subject: 'Drop MENES · maintenant en ligne',
    preheader: 'Pièces limitées. Pas de restock.',
    bodyHtml: `<h1>Le drop est live.</h1>
      <p>Nouvelles pièces disponibles. Qualité premium, quantités limitées — quand c’est parti, c’est parti.</p>`,
    ctaLabel: 'Shopper le drop',
  },
  review: {
    name: 'Demande d’avis',
    subject: 'Ton look MENES mérite un avis',
    preheader: '2 minutes pour inspirer la communauté.',
    bodyHtml: `<h1>Comment tu le portes?</h1>
      <p>Ta voix compte. Laisse un avis sur ta pièce MENES — ça aide la communauté à choisir, et ça nous pousse à rester exigeants.</p>`,
    ctaLabel: 'Laisser un avis',
    ctaPath: '/?review=1',
  },
  promo: {
    name: 'Offre exclusive',
    subject: 'Offre VIP MENES · réservée à la liste',
    preheader: 'Un avantage réservé aux initiés.',
    bodyHtml: `<h1>Offre privée.</h1>
      <p>En tant que membre VIP, tu as accès à une offre exclusive. Connecte-toi à la boutique et applique ton code au checkout.</p>`,
    ctaLabel: 'Profiter de l’offre',
  },
};

function segmentEmails(store, segment) {
  const subs = (store.subscribers || []).filter((s) => s.active !== false && s.email);
  const orders = store.orders || [];
  const buyers = [...new Set(orders.map((o) => (o.customer?.email || '').toLowerCase()).filter(Boolean))];

  if (segment === 'subscribers' || segment === 'vip') return subs.map((s) => s.email);
  if (segment === 'buyers') return buyers;
  if (segment === 'all') return [...new Set([...subs.map((s) => s.email), ...buyers])];
  return subs.map((s) => s.email);
}

async function sendWithResend({ to, subject, html }) {
  if (!resendConfigured()) {
    return { error: 'Email non configuré : RESEND_API_KEY + RESEND_FROM (domaine vérifié) requis.' };
  }
  const result = await sendResend({ to, subject, html });
  if (!result.ok) return { error: result.error };
  return { id: result.id };
}

exports.handler = async (event) => {
  setLambdaEvent(event);
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const auth = checkAdminAuth(event);
  if (!auth.ok) {
    return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };
  }

  const host = event.headers['x-forwarded-host'] || event.headers.host || '';
  const params = event.queryStringParameters || {};
  const headerSiteId = event.headers['x-site-id'] || event.headers['X-Site-Id'];
  const siteId = await resolveSiteId(host, params.site || headerSiteId);

  try {
    if (event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          templates: Object.entries(TEMPLATES).map(([id, t]) => ({ id, name: t.name, subject: t.subject })),
          resendConfigured: resendConfigured(),
          merchantEmailSet: Boolean(process.env.MERCHANT_EMAIL),
        }),
      };
    }

    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const store = await readSiteStore(siteId);
    if (!Array.isArray(store.campaigns)) store.campaigns = [];
    const siteName = store.site?.name || 'MENES';
    const storeUrl = process.env.URL || 'https://boutiquemenes.netlify.app';

    if (body.action === 'preview') {
      const tpl = TEMPLATES[body.template] || TEMPLATES.welcome;
      const subject = body.subject || tpl.subject;
      const html = brandShell({
        subject,
        preheader: body.preheader || tpl.preheader,
        bodyHtml: body.bodyHtml || tpl.bodyHtml,
        ctaLabel: body.ctaLabel || tpl.ctaLabel,
        ctaUrl: body.ctaUrl || (tpl.ctaPath ? `${storeUrl}${tpl.ctaPath}` : storeUrl),
        siteName,
      });
      return { statusCode: 200, headers, body: JSON.stringify({ subject, html }) };
    }

    if (body.action === 'test') {
      const to = String(body.to || '').trim().toLowerCase();
      if (!to) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email test requis' }) };
      const tpl = TEMPLATES[body.template] || TEMPLATES.welcome;
      const subject = `[TEST] ${body.subject || tpl.subject}`;
      const html = brandShell({
        subject,
        preheader: body.preheader || tpl.preheader,
        bodyHtml: body.bodyHtml || tpl.bodyHtml,
        ctaLabel: body.ctaLabel || tpl.ctaLabel,
        ctaUrl: body.ctaUrl || (tpl.ctaPath ? `${storeUrl}${tpl.ctaPath}` : storeUrl),
        siteName,
      });
      const sent = await sendWithResend({ to, subject, html });
      if (sent.error) {
        return {
          statusCode: 503,
          headers,
          body: JSON.stringify({
            error: sent.error,
            hint: 'Netlify → Environment : RESEND_API_KEY, RESEND_FROM (domaine vérifié), MERCHANT_EMAIL.',
          }),
        };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, id: sent.id }) };
    }

    if (body.action === 'send') {
      const tpl = TEMPLATES[body.template] || TEMPLATES.welcome;
      const segment = body.segment || 'subscribers';
      const emails = segmentEmails(store, segment);
      if (!emails.length) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Aucun destinataire dans ce segment' }) };
      }
      if (!resendConfigured()) {
        return {
          statusCode: 503,
          headers,
          body: JSON.stringify({
            error: 'Resend non configuré',
            hint: 'Ajoutez RESEND_API_KEY + RESEND_FROM (domaine vérifié) dans Netlify.',
            audience: emails.length,
          }),
        };
      }

      const subject = body.subject || tpl.subject;
      const html = brandShell({
        subject,
        preheader: body.preheader || tpl.preheader,
        bodyHtml: body.bodyHtml || tpl.bodyHtml,
        ctaLabel: body.ctaLabel || tpl.ctaLabel,
        ctaUrl: body.ctaUrl || (tpl.ctaPath ? `${storeUrl}${tpl.ctaPath}` : storeUrl),
        siteName,
      });

      let sent = 0;
      let failed = 0;
      const errors = [];
      // Cap per call to protect function timeout
      const batch = emails.slice(0, 40);
      for (const to of batch) {
        const r = await sendWithResend({ to, subject, html });
        if (r.error) { failed += 1; if (errors.length < 3) errors.push(r.error); }
        else sent += 1;
      }

      const campaign = {
        id: uid('camp'),
        name: body.name || tpl.name,
        template: body.template || 'welcome',
        subject,
        segment,
        status: 'sent',
        sentAt: new Date().toISOString(),
        stats: { audience: emails.length, attempted: batch.length, sent, failed },
      };
      store.campaigns.unshift(campaign);
      store.campaigns = store.campaigns.slice(0, 50);
      await writeSiteStore(siteId, store);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, campaign, errors }),
      };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Action invalide' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Erreur campagne' }) };
  }
};

exports.TEMPLATES = TEMPLATES;
