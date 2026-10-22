'use strict';

const fs = require('fs');
const path = require('path');
const { readSiteStore, resolveSiteId, setLambdaEvent } = require('../lib/platform');
const {
  injectProductPage,
  injectHomePage,
  findProductBySlug,
  productSlugFromPath,
  SITE_ORIGIN,
} = require('../lib/seo');

function htmlHeaders(status) {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': status === 200 ? 'public, max-age=120, must-revalidate' : 'no-store',
  };
}

function loadLocalIndex() {
  const candidates = [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, '../index.html'),
    path.join(process.cwd(), 'index.html'),
    path.join(process.cwd(), 'dist/index.html'),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > 200) {
        return fs.readFileSync(file, 'utf8');
      }
    } catch {
      /* try next */
    }
  }
  return '';
}

async function loadIndexHtml() {
  const local = loadLocalIndex();
  if (local.includes('<title>')) return local;
  const origin = String(process.env.URL || SITE_ORIGIN).replace(/\/$/, '');
  try {
    const res = await fetch(`${origin}/index.html`);
    if (res.ok) return await res.text();
  } catch {
    /* fall through */
  }
  return '';
}

exports.handler = async (event) => {
  setLambdaEvent(event);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: htmlHeaders(204), body: '' };
  }
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
    return { statusCode: 405, headers: htmlHeaders(405), body: 'Method not allowed' };
  }

  const rawPath = event.path || event.rawUrl || '';
  let pathname = rawPath;
  try {
    if (/^https?:\/\//i.test(rawPath)) pathname = new URL(rawPath).pathname;
  } catch {
    pathname = event.path || '/';
  }

  const slug = productSlugFromPath(pathname)
    || productSlugFromPath(`/${event.pathParameters?.splat || ''}`)
    || String(event.queryStringParameters?.product || '');

  const html = await loadIndexHtml();
  if (!html) {
    return {
      statusCode: 302,
      headers: { Location: slug ? `${SITE_ORIGIN}/?product=${encodeURIComponent(slug)}` : `${SITE_ORIGIN}/` },
      body: '',
    };
  }

  const host = event.headers?.['x-forwarded-host'] || event.headers?.host || '';
  const siteId = await resolveSiteId(host, event.queryStringParameters?.site);
  const data = await readSiteStore(siteId);
  const site = data?.site || {};
  const products = data?.products || [];
  const reviews = data?.reviews || [];
  const product = findProductBySlug(products.filter((p) => p && p.active !== false), slug);

  if (slug && product) {
    return {
      statusCode: 200,
      headers: htmlHeaders(200),
      body: event.httpMethod === 'HEAD' ? '' : injectProductPage(html, product, reviews, site),
    };
  }

  if (slug && !product) {
    return {
      statusCode: 404,
      headers: htmlHeaders(404),
      body: event.httpMethod === 'HEAD' ? '' : injectHomePage(html, site),
    };
  }

  return {
    statusCode: 200,
    headers: htmlHeaders(200),
    body: event.httpMethod === 'HEAD' ? '' : injectHomePage(html, site),
  };
};
