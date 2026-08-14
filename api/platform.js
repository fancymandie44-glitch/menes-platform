const {
  readPlatform, writePlatform, readSiteStore, writeSiteStore, slugify, newSiteTemplate, normalizeHost, setLambdaEvent,
} = require('../lib/platform');
const { corsHeaders } = require('../lib/cors');
const { checkAdminAuth } = require('../lib/admin-auth');

function auth(event) {
  return checkAdminAuth(event).ok;
}

exports.handler = async (event) => {
  setLambdaEvent(event);
  const cors = corsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  try {
    const host = event.headers['x-forwarded-host'] || event.headers.host || '';

    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      if (params.resolve === '1') {
        const platform = await readPlatform();
        const siteId = (platform.sites || []).find((s) => (s.domains || []).some((d) => normalizeHost(d) === normalizeHost(host)))?.id
          || platform.defaultSiteId;
        return { statusCode: 200, headers: cors, body: JSON.stringify({ siteId, host: normalizeHost(host) }) };
      }

      if (!auth(event)) {
        return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Non autorisé' }) };
      }

      const platform = await readPlatform();
      const sites = await Promise.all((platform.sites || []).map(async (s) => {
        const store = await readSiteStore(s.id);
        return {
          ...s,
          stats: {
            products: (store.products || []).filter((p) => p.active).length,
            orders: (store.orders || []).length,
            revenue: (store.orders || []).filter((o) => o.status === 'paid').reduce((sum, o) => sum + (o.total || 0), 0),
          },
        };
      }));

      return { statusCode: 200, headers: cors, body: JSON.stringify({ ...platform, sites }) };
    }

    if (event.httpMethod === 'POST') {
      if (!auth(event)) {
        return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Non autorisé' }) };
      }

      const body = JSON.parse(event.body || '{}');
      const platform = await readPlatform();

      if (body.action === 'create-site') {
        const name = String(body.name || '').trim();
        if (!name) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Nom requis' }) };
        const slug = slugify(body.slug || name);
        const id = slug;
        if (platform.sites.some((s) => s.id === id)) {
          return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Cette boutique existe déjà' }) };
        }
        const site = {
          id,
          name,
          slug,
          brand: body.brand || name,
          domains: (body.domains || []).map(normalizeHost).filter(Boolean),
          netlifyUrl: body.netlifyUrl || '',
          status: 'active',
          plan: 'starter',
          createdAt: new Date().toISOString(),
        };
        platform.sites.push(site);
        await writePlatform(platform);
        await writeSiteStore(id, body.duplicateFrom
          ? JSON.parse(JSON.stringify(await readSiteStore(body.duplicateFrom)))
          : newSiteTemplate(name, slug));
        return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, site }) };
      }

      if (body.action === 'update-site') {
        const idx = platform.sites.findIndex((s) => s.id === body.id);
        if (idx < 0) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Boutique introuvable' }) };
        platform.sites[idx] = {
          ...platform.sites[idx],
          name: body.name ?? platform.sites[idx].name,
          brand: body.brand ?? platform.sites[idx].brand,
          domains: body.domains ? body.domains.map(normalizeHost).filter(Boolean) : platform.sites[idx].domains,
          netlifyUrl: body.netlifyUrl ?? platform.sites[idx].netlifyUrl,
          status: body.status ?? platform.sites[idx].status,
          plan: body.plan ?? platform.sites[idx].plan,
        };
        if (body.setDefault) platform.defaultSiteId = body.id;
        await writePlatform(platform);
        return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, site: platform.sites[idx] }) };
      }

      if (body.action === 'delete-site') {
        if (body.id === 'menes' || body.id === platform.defaultSiteId) {
          return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Impossible de supprimer la boutique principale' }) };
        }
        platform.sites = platform.sites.filter((s) => s.id !== body.id);
        await writePlatform(platform);
        return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
      }

      if (body.action === 'save-platform') {
        platform.defaultSiteId = body.defaultSiteId || platform.defaultSiteId;
        await writePlatform(platform);
        return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
      }

      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Action invalide' }) };
    }

    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
