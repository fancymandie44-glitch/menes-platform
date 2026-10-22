'use strict';

const { readSiteStore, readPlatform } = require('./platform');
const { emailConfigured } = require('./notify');

function severityScore(severity) {
  if (severity === 'critical') return 35;
  if (severity === 'warning') return 12;
  return 3;
}

function issue(partial) {
  return {
    id: partial.id || `iss_${Math.random().toString(36).slice(2, 8)}`,
    status: partial.status || (partial.severity === 'info' ? 'ok' : 'fail'),
    severity: partial.severity || 'warning',
    title: partial.title || 'Issue',
    evidence: partial.evidence || '',
    suggestedFix: partial.suggestedFix || '',
    autoFix: partial.autoFix || null,
  };
}

async function timedFetch(url, { method = 'GET', timeoutMs = 8000 } = {}) {
  const started = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method, redirect: 'manual', signal: ctrl.signal, headers: { Accept: '*/*' } });
    return { ok: res.status >= 200 && res.status < 400, status: res.status, ms: Date.now() - started, url };
  } catch (err) {
    return { ok: false, status: 0, ms: Date.now() - started, url, error: err.message };
  } finally {
    clearTimeout(t);
  }
}

function storefrontOrigin(site) {
  const url = site?.netlifyUrl || (site?.domains || []).map((d) => `https://${d}`)[0] || 'https://www.mymenes.com';
  return String(url).replace(/\/$/, '');
}

function productUrl(origin, product) {
  const slug = product.slug || product.id;
  return `${origin}/?product=${encodeURIComponent(slug)}`;
}

async function checkUptime(origin, mode) {
  const paths = mode === 'full'
    ? ['/', '/paiement.html', '/livraison.html', '/api/health']
    : ['/', '/api/health'];
  const out = [];
  for (const path of paths) {
    const hit = await timedFetch(`${origin}${path}`);
    if (!hit.ok) {
      out.push(issue({
        id: `up:${path}`,
        severity: path === '/' || path === '/api/health' ? 'critical' : 'warning',
        title: `Storefront ${path} is down`,
        evidence: `${hit.status || 'network'} in ${hit.ms}ms`,
        suggestedFix: `Check Netlify deploy and ${origin}${path}`,
      }));
    } else if (hit.ms > 2500) {
      out.push(issue({
        id: `slow:${path}`,
        severity: 'warning',
        title: `${path} is slow`,
        evidence: `${hit.ms}ms`,
        suggestedFix: 'Inspect Netlify function cold starts and image weight',
      }));
    }
  }
  return out;
}

function productIssues(products) {
  const out = [];
  for (const p of products || []) {
    const stock = Number(p.stock);
    const hasImage = Boolean(p.image || (Array.isArray(p.images) && p.images.length));
    if (p.active !== false && Number.isFinite(stock) && stock <= 0) {
      out.push(issue({
        id: `oos:${p.id}`,
        severity: 'warning',
        title: `${p.name || p.id} is listed but out of stock`,
        evidence: `stock=${p.stock}`,
        suggestedFix: 'Hide the product until inventory returns',
        autoFix: { type: 'hide_product', productId: p.id, reversible: true },
      }));
    }
    if (!p.name) {
      out.push(issue({
        id: `name:${p.id}`,
        severity: 'critical',
        title: `Product ${p.id} is missing a title`,
        evidence: 'name empty',
        suggestedFix: 'Add a title in the product editor',
      }));
    }
    if (!hasImage && p.active !== false) {
      out.push(issue({
        id: `img:${p.id}`,
        severity: 'warning',
        title: `${p.name || p.id} has no photo`,
        evidence: 'image empty',
        suggestedFix: 'Upload a product photo',
      }));
    }
    if (!String(p.description || '').trim() && p.active !== false) {
      out.push(issue({
        id: `desc:${p.id}`,
        severity: 'info',
        title: `${p.name || p.id} has no description`,
        evidence: 'description empty',
        suggestedFix: 'Write a short English/French product story',
      }));
    }
    const price = Number(p.price);
    const cost = Number(p.cost || p.supplierCost || 0);
    if (price > 0 && cost > 0 && price <= cost) {
      out.push(issue({
        id: `margin:${p.id}`,
        severity: 'warning',
        title: `${p.name || p.id} sells at or below cost`,
        evidence: `price=${price} cost=${cost}`,
        suggestedFix: 'Review price before the next ad push',
      }));
    }
  }
  return out;
}

async function supplierIssues(suppliers) {
  const out = [];
  for (const s of suppliers || []) {
    const url = s.url || s.link;
    if (!url) {
      out.push(issue({
        id: `sup:${s.id}:url`,
        severity: 'info',
        title: `Supplier ${s.name || s.id} has no link`,
        evidence: 'url empty',
        suggestedFix: 'Add the supplier catalog URL',
      }));
      continue;
    }
    const hit = await timedFetch(url, { method: 'GET', timeoutMs: 7000 });
    if (!hit.ok) {
      out.push(issue({
        id: `sup:${s.id}:dead`,
        severity: 'warning',
        title: `Supplier link is dead: ${s.name || s.id}`,
        evidence: `${url} → ${hit.status || hit.error}`,
        suggestedFix: 'Flag the supplier and pause products that depend on it',
        autoFix: { type: 'flag_supplier', supplierId: s.id, reversible: true },
      }));
    }
  }
  return out;
}

async function adIssues(ads, origin, products) {
  const out = [];
  const byId = new Map((products || []).map((p) => [p.id, p]));
  for (const ad of ads || []) {
    if (ad.status === 'rejected' || ad.status === 'disapproved') {
      out.push(issue({
        id: `ad:${ad.id}:rej`,
        severity: 'critical',
        title: `Ad rejected: ${ad.campaignName || ad.id}`,
        evidence: ad.rejectReason || ad.status,
        suggestedFix: 'Rewrite copy with the compliance checker and resubmit',
      }));
    }
    const land = ad.landingPageUrl || '';
    if (land) {
      const hit = await timedFetch(land, { timeoutMs: 7000 });
      if (!hit.ok) {
        out.push(issue({
          id: `ad:${ad.id}:404`,
          severity: 'critical',
          title: `Ad points to a dead page`,
          evidence: `${land} → ${hit.status || hit.error}`,
          suggestedFix: 'Pause the ad until the landing page is restored',
          autoFix: { type: 'pause_ad', adId: ad.id, reversible: true },
        }));
      }
    }
    if (ad.productId && byId.get(ad.productId)?.active === false) {
      out.push(issue({
        id: `ad:${ad.id}:oos`,
        severity: 'warning',
        title: `Ad targets a hidden/out product`,
        evidence: ad.productId,
        suggestedFix: 'Pause the ad or retarget an in-stock product',
        autoFix: { type: 'pause_ad', adId: ad.id, reversible: true },
      }));
    }
    if (ad.utm && (!ad.utm.utm_source || !ad.utm.utm_campaign)) {
      out.push(issue({
        id: `ad:${ad.id}:utm`,
        severity: 'info',
        title: `Ad ${ad.campaignName || ad.id} is missing UTM tags`,
        evidence: JSON.stringify(ad.utm || {}),
        suggestedFix: 'Add utm_source and utm_campaign',
      }));
    }
  }
  return out;
}

function seoIssues(html, origin) {
  const out = [];
  if (!html) return out;
  if (!/<title>[^<]{3,}/i.test(html)) {
    out.push(issue({
      id: 'seo:title',
      severity: 'warning',
      title: 'Homepage is missing a title tag',
      evidence: origin,
      suggestedFix: 'Set site.heroTitle / title in the storefront',
    }));
  }
  if (!/name=["']description["']/i.test(html)) {
    out.push(issue({
      id: 'seo:desc',
      severity: 'info',
      title: 'Homepage meta description is missing',
      evidence: origin,
      suggestedFix: 'Add a meta description on index.html',
    }));
  }
  return out;
}

async function runHealthCheck({ storeId, mode = 'full' }) {
  const platform = await readPlatform();
  const site = (platform.sites || []).find((s) => s.id === storeId) || platform.sites?.[0] || {};
  const store = await readSiteStore(storeId);
  const origin = storefrontOrigin(site);
  const products = store.products || [];
  const ads = store.ads || [];
  const suppliers = store.suppliers || [];
  const issues = [];

  issues.push(...await checkUptime(origin, mode));
  issues.push(...productIssues(products));
  issues.push(...await supplierIssues(mode === 'full' ? suppliers : suppliers.slice(0, 4)));
  issues.push(...await adIssues(ads, origin, products));

  if (mode === 'full') {
    const home = await timedFetch(`${origin}/`);
    if (home.ok) {
      try {
        const res = await fetch(`${origin}/`, { signal: AbortSignal.timeout(8000) });
        const html = await res.text();
        issues.push(...seoIssues(html, origin));
        const imgs = [...html.matchAll(/<img[^>]+src=["']([^"']+)/gi)].map((m) => m[1]).slice(0, 8);
        for (const src of imgs) {
          const abs = src.startsWith('http') ? src : `${origin}${src.startsWith('/') ? '' : '/'}${src}`;
          const hit = await timedFetch(abs, { method: 'GET', timeoutMs: 5000 });
          if (!hit.ok) {
            issues.push(issue({
              id: `imgurl:${abs.slice(-24)}`,
              severity: 'warning',
              title: 'Broken storefront image',
              evidence: abs,
              suggestedFix: 'Replace or re-upload the image',
            }));
          }
        }
      } catch (err) {
        issues.push(issue({
          id: 'seo:fetch',
          severity: 'info',
          title: 'Could not download homepage HTML for SEO checks',
          evidence: err.message,
          suggestedFix: 'Retry the full audit',
        }));
      }
    }
    const pay = store.site?.payments || {};
    if (!process.env.STRIPE_SECRET_KEY && !process.env.SQUARE_ACCESS_TOKEN) {
      issues.push(issue({
        id: 'pay:keys',
        severity: 'warning',
        title: 'No card processor secret is configured on the server',
        evidence: 'STRIPE_SECRET_KEY and SQUARE_ACCESS_TOKEN empty',
        suggestedFix: 'Set a test key on Netlify to smoke-test checkout',
      }));
    }
    if (!emailConfigured()) {
      issues.push(issue({
        id: 'mail',
        severity: 'warning',
        title: 'Transactional email is not configured',
        evidence: 'No Resend / Brevo / SMTP',
        suggestedFix: 'Set EMAIL_FROM plus a provider key',
      }));
    }
    void pay;
  }

  const penalty = issues.reduce((s, i) => s + severityScore(i.severity), 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const critical = issues.filter((i) => i.severity === 'critical').length;
  const warning = issues.filter((i) => i.severity === 'warning').length;
  const summary = critical
    ? `${critical} issue${critical > 1 ? 's' : ''} need you today`
    : warning
      ? `${warning} warning${warning > 1 ? 's' : ''} to review`
      : 'Store looks healthy';

  return {
    storeId,
    origin,
    mode,
    at: new Date().toISOString(),
    score,
    summary,
    counts: {
      critical,
      warning,
      info: issues.filter((i) => i.severity === 'info').length,
      ok: issues.filter((i) => i.status === 'ok').length,
    },
    issues,
  };
}

module.exports = { runHealthCheck, productIssues, issue, storefrontOrigin, productUrl };
