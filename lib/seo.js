'use strict';

const SITE_ORIGIN = 'https://www.mymenes.com';
const BRAND = 'MENES';

function siteOrigin() {
  return SITE_ORIGIN;
}

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'produit';
}

function productSlug(product) {
  if (!product) return '';
  if (product.slug) return slugify(product.slug);
  return slugify(product.id || product.name);
}

function productPath(product) {
  const slug = productSlug(product);
  return slug ? `/produit/${slug}` : '/';
}

function productCanonicalUrl(product, origin = SITE_ORIGIN) {
  const base = String(origin || SITE_ORIGIN).replace(/\/$/, '');
  return `${base}${productPath(product)}`;
}

function productSlugFromPath(pathname) {
  const parts = String(pathname || '').replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts[0] === 'produit' && parts[1]) return slugify(decodeURIComponent(parts[1]));
  return '';
}

function findProductBySlug(products, slug) {
  const want = slugify(slug);
  if (!want) return null;
  const list = Array.isArray(products) ? products : [];
  return list.find((p) => productSlug(p) === want)
    || list.find((p) => slugify(p.id) === want)
    || list.find((p) => slugify(p.name) === want)
    || null;
}

function absoluteUrl(origin, url) {
  const raw = String(url || '').trim();
  if (!raw || raw.startsWith('data:')) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  const base = String(origin || SITE_ORIGIN).replace(/\/$/, '');
  return `${base}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function productImages(product) {
  const out = [];
  const push = (url) => {
    const abs = absoluteUrl(SITE_ORIGIN, typeof url === 'string' ? url : url?.url);
    if (abs && !out.includes(abs)) out.push(abs);
  };
  if (Array.isArray(product?.images)) product.images.forEach(push);
  if (product?.image) push(product.image);
  return out;
}

function approvedProductReviews(reviews, productId) {
  return (reviews || []).filter((r) => (
    r
    && r.status === 'approved'
    && r.productId
    && r.productId === productId
    && String(r.body || r.title || '').trim()
  ));
}

function reviewStats(list) {
  const count = list.length;
  if (!count) return { count: 0, avg: 0 };
  const sum = list.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
  return { count, avg: Math.round((sum / count) * 10) / 10 };
}

function availability(product) {
  if (product?.preorder) return 'https://schema.org/PreOrder';
  const stock = Number(product?.stock);
  if (Number.isFinite(stock) && stock <= 0) return 'https://schema.org/OutOfStock';
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (variants.length) {
    const any = variants.some((v) => {
      const n = Number(v.stock);
      return !Number.isFinite(n) || n > 0;
    });
    if (!any) return 'https://schema.org/OutOfStock';
  }
  return 'https://schema.org/InStock';
}

function homepageSeo(site = {}) {
  const seo = site.seo || {};
  const enSeo = seo.en || {};
  const title = enSeo.title || seo.titleEn || `${BRAND} | Luxury Streetwear`;
  const description = enSeo.description || seo.descriptionEn
    || 'MENES. Luxury streetwear. Premium clothing, secure checkout, fast shipping across Quebec and Canada.';
  const image = absoluteUrl(SITE_ORIGIN, site.logo || site.heroImage || site.favicon || '');
  return {
    title,
    description,
    url: `${SITE_ORIGIN}/`,
    image,
    type: 'website',
  };
}

function productSeo(product, site = {}) {
  const name = product?.name || BRAND;
  const brand = site.name || BRAND;
  const description = String(product?.description || '').trim()
    || `${name} — ${brand} luxury streetwear.`;
  const images = productImages(product);
  const home = homepageSeo(site);
  return {
    title: `${name} | ${brand}`,
    description: description.slice(0, 320),
    url: productCanonicalUrl(product),
    image: images[0] || home.image,
    images,
    type: 'product',
  };
}

function productJsonLd(product, reviews, site = {}) {
  const seo = productSeo(product, site);
  const list = approvedProductReviews(reviews, product.id);
  const stats = reviewStats(list);
  const price = Number(product.price);
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: seo.description,
    sku: String(product.id || productSlug(product)),
    brand: { '@type': 'Brand', name: site.name || BRAND },
    url: seo.url,
    image: seo.images.length ? seo.images : undefined,
    offers: {
      '@type': 'Offer',
      url: seo.url,
      priceCurrency: site.currency || 'CAD',
      price: Number.isFinite(price) ? price.toFixed(2) : undefined,
      availability: availability(product),
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: site.name || BRAND },
    },
  };
  if (stats.count > 0) {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: String(stats.avg),
      reviewCount: String(stats.count),
      bestRating: '5',
      worstRating: '1',
    };
    data.review = list.slice(0, 20).map((r) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: String(r.authorName || r.name || 'Client MENES').slice(0, 80) },
      datePublished: r.createdAt || r.date || undefined,
      name: r.title || undefined,
      reviewBody: String(r.body || r.title || '').slice(0, 1200),
      reviewRating: {
        '@type': 'Rating',
        ratingValue: String(Math.max(1, Math.min(5, Number(r.rating) || 5))),
        bestRating: '5',
        worstRating: '1',
      },
    }));
  }
  return data;
}

function organizationJsonLd(site = {}) {
  const home = homepageSeo(site);
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.name || BRAND,
    url: SITE_ORIGIN,
    logo: home.image || undefined,
    sameAs: [],
  };
}

function websiteJsonLd(site = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name || BRAND,
    url: SITE_ORIGIN,
  };
}

function upsertTag(html, pattern, tag) {
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace(/<\/head>/i, `  ${tag}\n</head>`);
}

function injectHead(html, seo, jsonLd) {
  let out = String(html || '');
  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(seo.title)}</title>`);
  out = upsertTag(
    out,
    /<meta\s+name=["']description["'][^>]*>/i,
    `<meta name="description" content="${escapeAttr(seo.description)}">`,
  );
  out = upsertTag(
    out,
    /<link\s+rel=["']canonical["'][^>]*>/i,
    `<link rel="canonical" href="${escapeAttr(seo.url)}">`,
  );
  out = upsertTag(
    out,
    /<meta\s+property=["']og:title["'][^>]*>/i,
    `<meta property="og:title" content="${escapeAttr(seo.title)}">`,
  );
  out = upsertTag(
    out,
    /<meta\s+property=["']og:description["'][^>]*>/i,
    `<meta property="og:description" content="${escapeAttr(seo.description)}">`,
  );
  out = upsertTag(
    out,
    /<meta\s+property=["']og:url["'][^>]*>/i,
    `<meta property="og:url" content="${escapeAttr(seo.url)}">`,
  );
  out = upsertTag(
    out,
    /<meta\s+property=["']og:type["'][^>]*>/i,
    `<meta property="og:type" content="${escapeAttr(seo.type || 'website')}">`,
  );
  if (seo.image) {
    out = upsertTag(
      out,
      /<meta\s+property=["']og:image["'][^>]*>/i,
      `<meta property="og:image" content="${escapeAttr(seo.image)}">`,
    );
  }
  const ld = `<script type="application/ld+json" id="menes-jsonld">${JSON.stringify(jsonLd)}</script>`;
  if (/id=["']menes-jsonld["']/.test(out)) {
    out = out.replace(/<script type="application\/ld\+json" id="menes-jsonld">[\s\S]*?<\/script>/i, ld);
  } else {
    out = out.replace(/<\/head>/i, `  ${ld}\n</head>`);
  }
  return out;
}

function injectProductPage(html, product, reviews, site) {
  return injectHead(html, productSeo(product, site), productJsonLd(product, reviews, site));
}

function injectHomePage(html, site) {
  return injectHead(html, homepageSeo(site), [organizationJsonLd(site), websiteJsonLd(site)]);
}

function sitemapXml(products, origin = SITE_ORIGIN) {
  const base = String(origin || SITE_ORIGIN).replace(/\/$/, '');
  const today = new Date().toISOString().slice(0, 10);
  const urls = [`${base}/`].concat(
    (products || [])
      .filter((p) => p && p.active !== false)
      .map((p) => `${base}${productPath(p)}`),
  );
  const body = urls.map((loc) => (
    `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n  </url>`
  )).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

function escapeXml(str) {
  return escapeAttr(str);
}

module.exports = {
  SITE_ORIGIN,
  siteOrigin,
  slugify,
  productSlug,
  productPath,
  productCanonicalUrl,
  productSlugFromPath,
  findProductBySlug,
  absoluteUrl,
  productImages,
  approvedProductReviews,
  homepageSeo,
  productSeo,
  productJsonLd,
  organizationJsonLd,
  websiteJsonLd,
  injectProductPage,
  injectHomePage,
  sitemapXml,
};
