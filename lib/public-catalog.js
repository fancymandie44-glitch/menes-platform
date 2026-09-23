'use strict';

/** Show remaining units to customers only when strictly below this. */
const LOW_STOCK_LIMIT = 10;

function isLowStock(n) {
  return Number.isFinite(n) && n > 0 && n < LOW_STOCK_LIMIT;
}

/**
 * Public stock:
 * - variants: 0 = sold out, 1-9 = exact, null = 10+ (hide warehouse size)
 * - product-level with no variants: 0 = untracked (legacy), same 1-9 / null rules
 */
function publicStockCount(raw, { trackedZero = false } = {}) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  if (!trackedZero && n === 0) return null;
  if (n >= LOW_STOCK_LIMIT) return LOW_STOCK_LIMIT;
  return n;
}

function publicProduct(p) {
  if (!p || p.active === false) return null;
  const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    comparePrice: p.comparePrice,
    category: p.category,
    collection: p.collection,
    image: p.image,
    images: p.images,
    videoUrl: p.videoUrl,
    options: p.options,
    sizes: p.sizes,
    stock: publicStockCount(p.stock, { trackedZero: hasVariants }),
    variants: hasVariants
      ? p.variants.map((v) => ({
        key: v.key,
        label: v.label,
        options: v.options,
        stock: publicStockCount(v.stock, { trackedZero: true }),
      }))
      : undefined,
    featured: p.featured,
    preorder: !!p.preorder,
    preorderNote: p.preorderNote || '',
    active: true,
  };
}

function rewriteLegacyIgText(str) {
  return String(str || '').replace(/@?menes_jewelry/gi, '@menes_vs1');
}

function publicInstagram(site = {}) {
  const handle = String(site.instagramHandle || '').trim();
  const url = String(site.instagram || '').trim();
  if (!handle && !url) {
    return { instagram: 'https://www.instagram.com/menes_vs1', instagramHandle: '@menes_vs1' };
  }
  if (/menes_jewelry/i.test(handle) || /menes_jewelry/i.test(url)) {
    return { instagram: 'https://www.instagram.com/menes_vs1', instagramHandle: '@menes_vs1' };
  }
  return {
    instagram: url || 'https://www.instagram.com/menes_vs1',
    instagramHandle: handle || '@menes_vs1',
  };
}

function publicSite(site = {}) {
  const {
    announcement, name, tagline, heroTitle, heroSubtitle, heroCta, heroImage, heroVideo,
    logo, favicon, currency, language, sections, sectionOrder, trust, why, faq, guarantee,
    gallery, galleryTitle, gallerySubtitle, emailCapture, bundle, instagram, instagramHandle,
    email, phone, freeShippingThreshold, theme, seo, i18n, appearance, crypto, design,
  } = site;
  const ig = publicInstagram({ instagram, instagramHandle });
  const nextI18n = i18n && typeof i18n === 'object'
    ? Object.fromEntries(Object.entries(i18n).map(([lang, pack]) => [
      lang,
      pack && typeof pack === 'object'
        ? { ...pack, gallerySubtitle: rewriteLegacyIgText(pack.gallerySubtitle) }
        : pack,
    ]))
    : i18n;
  return {
    announcement, name, tagline, heroTitle, heroSubtitle, heroCta, heroImage, heroVideo,
    logo, favicon, currency, language: language === 'fr' ? 'fr' : 'en',
    sections: { ...(sections || {}), bundle: false, guarantee: false },
    sectionOrder: Array.isArray(sectionOrder) ? sectionOrder.filter((id) => id !== 'bundle' && id !== 'guarantee') : sectionOrder,
    trust, why, faq, guarantee: '',
    gallery, galleryTitle, gallerySubtitle: rewriteLegacyIgText(gallerySubtitle),
    emailCapture, bundle,
    instagram: ig.instagram, instagramHandle: ig.instagramHandle,
    email, phone, freeShippingThreshold, theme, seo, i18n, appearance, design,
    crypto: Array.isArray(crypto) ? crypto.map((w) => ({
      label: w.label, symbol: w.symbol, network: w.network, address: w.address,
    })) : [],
  };
}

function publicStore(data) {
  return {
    site: publicSite(data.site || {}),
    products: (data.products || []).map(publicProduct).filter(Boolean),
    collections: (data.collections || []).filter((c) => c.active !== false),
    discounts: (data.discounts || [])
      .filter((d) => d.active !== false)
      .filter((d) => {
        const code = String(d.code || '').toUpperCase();
        return code !== 'VIP10' && code !== 'WELCOME10';
      })
      .map((d) => ({
        code: d.code,
        type: d.type,
        value: d.value,
        minCart: d.minCart || 0,
        active: true,
        ambassadorId: d.ambassadorId || null,
        source: d.source || null,
      })),
    reviews: (data.reviews || [])
      .filter((r) => r.status === 'approved')
      .map(({ authorEmail, ...pub }) => pub),
    _siteId: data._siteId,
  };
}

module.exports = {
  LOW_STOCK_LIMIT,
  isLowStock,
  publicStockCount,
  publicProduct,
  publicSite,
  publicStore,
};
