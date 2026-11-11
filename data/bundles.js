/**
 * MENES shop bundles — single source of truth.
 * Add or edit a bundle here only. UI, cart, and checkout read this file.
 *
 * Bundles: Kultur Steps (1 Kultur pair + 2 color pairs), Essentials (2 pairs + boxer), Holiday Exclusive (3 pairs).
 *
 * clientDiscount.percent: fill with a number (e.g. 10) to activate member pricing.
 * Member price applies with code MENESFAM, or automatically if a MENES Passport
 * email is stored on the device (existing customer).
 */
(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.MENES_BUNDLES = data;
})(typeof self !== 'undefined' ? self : this, function () {
  const SITE_ORIGIN = 'https://www.mymenes.com';

  const DROP_TZ = 'America/Toronto';
  const DROP_AT = '2026-11-20T00:00:00-05:00';

  const CLIENT_DISCOUNT = {
    code: 'MENESFAM',
    percent: null,
    autoIfPassport: true,
    label: { fr: 'Prix client', en: 'Member price' },
  };

  const PAIR_OPTIONS = [
    { id: 'noir', name: { fr: 'Noir / blanc', en: 'Black / white' }, swatch: '#1a1a1a', image: '/images/bundles/pairs/noir.jpg?v=1', inStock: true },
    { id: 'jaune', name: { fr: 'Jaune', en: 'Yellow' }, swatch: '#e6c200', image: '/images/bundles/pairs/jaune.jpg?v=1', inStock: true },
    { id: 'rouge', name: { fr: 'Rouge', en: 'Red' }, swatch: '#c41e3a', image: '/images/bundles/pairs/rouge.jpg?v=1', inStock: true },
    { id: 'vert', name: { fr: 'Vert', en: 'Green' }, swatch: '#2e8b57', image: '/images/bundles/pairs/vert.jpg?v=1', inStock: true },
    { id: 'violet', name: { fr: 'Violet', en: 'Purple' }, swatch: '#6b3fa0', image: '/images/bundles/pairs/violet.jpg?v=1', inStock: true },
    { id: 'cyan', name: { fr: 'Cyan', en: 'Cyan' }, swatch: '#2aa8d4', image: '/images/bundles/pairs/cyan.jpg?v=1', inStock: true },
    { id: 'rose', name: { fr: 'Rose', en: 'Pink' }, swatch: '#e85aad', image: '/images/bundles/pairs/rose.jpg?v=1', inStock: true },
    { id: 'kultur', name: { fr: 'Kultur charcoal', en: 'Kultur charcoal' }, swatch: '#2b2b2b', image: '/images/bundles/pairs/kultur.jpg?v=1', inStock: true },
  ];
  const COLOR_PAIR_OPTIONS = PAIR_OPTIONS.filter((p) => p.id !== 'kultur');

  const PAIR_STOCK = {
    noir: { productId: 'summer-socks', color: 'Black' },
    jaune: { productId: 'summer-socks', color: 'Yellow' },
    rouge: { productId: 'summer-socks', color: 'Red' },
    vert: { productId: 'summer-socks', color: 'Green' },
    violet: { productId: 'summer-socks', color: 'Purple' },
    cyan: { productId: 'summer-socks', color: 'Cyan' },
    rose: { productId: 'summer-socks', color: 'Pink' },
    kultur: { productId: 'menes-kltr-socks' },
  };
  const BOXER_PRODUCT_ID = 'menes-boxer';
  const HAT_PRODUCT_ID = 'menes-kltr-trucker-hat';
  const BAG_PRODUCT_ID = 'menes-m-keyz-crossbody-bag-';
  const CAMO_HAT_STOCK = 5;
  const HAT_OPTIONS = [
    {
      id: 'camo',
      name: { fr: 'Camo', en: 'Camo' },
      swatch: '#5c5c5c',
      image: '/images/bundles/holiday-exclusive.jpg',
      virtual: true,
      defaultStock: CAMO_HAT_STOCK,
      priority: true,
    },
    {
      id: 'orange',
      name: { fr: 'Orange', en: 'Orange' },
      swatch: '#d26512',
      image: '/images/community/hat-orange-studio.jpg',
      productId: HAT_PRODUCT_ID,
      color: 'Orange',
    },
    {
      id: 'black',
      name: { fr: 'Noir', en: 'Black' },
      swatch: '#111111',
      image: '/images/community/hat-black-studio.jpg',
      productId: HAT_PRODUCT_ID,
      color: 'Black',
    },
    {
      id: 'brown',
      name: { fr: 'Brun', en: 'Brown' },
      swatch: '#6b4a2b',
      image: '/images/community/hat-beige-studio.jpg',
      productId: HAT_PRODUCT_ID,
      color: 'Brown',
    },
  ];
  const PENDING_RESERVE_MS = 45 * 60 * 1000;

  const BOXER_SIZES = ['S', 'M', 'L', 'XL'];
  const BOXER_OPTIONS = [
    { id: 'red', name: { fr: 'Red', en: 'Red' }, swatch: '#c41e3a', image: '/images/products/boxers/red.jpg?v=crop1' },
    { id: 'grey', name: { fr: 'Grey', en: 'Grey' }, swatch: '#8a8a8a', image: '/images/products/boxers/grey.jpg?v=crop1' },
  ];

  const UNIT_PRICES = {
    pairColor: 13,
    pairKultur: 22,
    boxer: 19.99,
    capKultur: 99.99,
    capCamo: 99.99,
    bagKeyz: 300,
  };

  function cad(n) {
    return Math.round(Number(n) * 100) / 100;
  }

  const KULTUR_STEPS_COMPARE = cad(UNIT_PRICES.pairKultur + UNIT_PRICES.pairColor * 2);
  const ESSENTIALS_COMPARE = cad(UNIT_PRICES.capKultur + UNIT_PRICES.pairColor * 2 + UNIT_PRICES.boxer);
  const HOLIDAY_COMPARE = cad(UNIT_PRICES.capCamo + UNIT_PRICES.bagKeyz + UNIT_PRICES.pairColor * 3);

  function moneyFr(n) {
    const x = cad(n);
    return Number.isInteger(x) ? String(x) : x.toFixed(2).replace('.', ',');
  }
  function moneyEn(n) {
    const x = cad(n);
    return Number.isInteger(x) ? String(x) : x.toFixed(2);
  }
  function dealCopy(compare, price) {
    const save = cad(compare - price);
    return {
      fr: `À l’unité ça fait ${moneyFr(compare)} $. Le pack est à ${moneyFr(price)} $. Tu gardes ${moneyFr(save)} $.`,
      en: `Separate that’s ${moneyEn(compare)}. The pack is ${moneyEn(price)}. You keep ${moneyEn(save)}.`,
      hitFr: `Valait ${moneyFr(compare)} $. Pack ${moneyFr(price)} $`,
      hitEn: `Was ${moneyEn(compare)}. Pack ${moneyEn(price)}`,
    };
  }
  const KULTUR_DEAL = dealCopy(KULTUR_STEPS_COMPARE, 34.99);
  const ESSENTIALS_DEAL = dealCopy(ESSENTIALS_COMPARE, 99.99);
  const HOLIDAY_DEAL = dealCopy(HOLIDAY_COMPARE, 329.99);

  const BUNDLES = [
    {
      id: 'bundle-kultur-steps',
      slug: 'kultur-steps',
      published: true,
      featured: false,
      kind: 'builder',
      order: 3,
      badge: { fr: 'Le plus rapide', en: 'Easiest gift' },
      name: { fr: 'KULTUR STEPS', en: 'KULTUR STEPS' },
      tagline: {
        fr: '1 paire Kultur. 2 paires de couleur à toi.',
        en: '1 Kultur pair. 2 color pairs of your choice.',
      },
      description: {
        fr: `1 paire Kultur charcoal + 2 paires de couleur au choix. ${KULTUR_DEAL.fr}`,
        en: `1 charcoal Kultur pair + 2 color pairs you pick. ${KULTUR_DEAL.en}`,
      },
      seoTitle: {
        fr: 'KULTUR STEPS | 1 paire Kultur + 2 paires au choix',
        en: 'KULTUR STEPS | 1 Kultur pair + 2 color pairs',
      },
      seoDescription: {
        fr: 'KULTUR STEPS MENES. Valait 48 $. À toi pour 34,99 $. 1 paire Kultur + 2 paires de couleur au choix.',
        en: 'MENES KULTUR STEPS. Was 48. Yours for 34.99. 1 Kultur pair + 2 color pairs of your choice.',
      },
      image: '/images/bundles/kultur-steps-noir-jaune.jpg',
      price: 34.99,
      comparePrice: KULTUR_STEPS_COMPARE,
      currency: 'CAD',
      urgency: { fr: 'Prêt à partir', en: 'Ready to ship' },
      highlights: {
        fr: ['1 paire Kultur charcoal (fixe)', '2 paires de couleur au choix', KULTUR_DEAL.hitFr],
        en: ['1 charcoal Kultur pair (fixed)', '2 color pairs of your choice', KULTUR_DEAL.hitEn],
      },
      included: {
        fr: ['1 paire Kultur charcoal', '2 paires de couleur au choix'],
        en: ['1 charcoal Kultur pair', '2 color pairs of your choice'],
      },
      pairCount: 2,
      pairOptions: COLOR_PAIR_OPTIONS,
      fixedPairId: 'kultur',
      sizes: [],
      limit: null,
      stock: null,
      allowDuplicatePairs: true,
    },
    {
      id: 'bundle-essentials',
      slug: 'essentials',
      published: true,
      featured: true,
      kind: 'builder',
      order: 2,
      badge: { fr: 'Le plus populaire', en: 'Most popular' },
      name: { fr: 'MENES ESSENTIALS', en: 'MENES ESSENTIALS' },
      tagline: {
        fr: 'Casquette Kultur. Deux paires. Un boxer. Tu choisis.',
        en: 'Kultur cap. Two pairs. One boxer. You choose.',
      },
      description: {
        fr: `Casquette Kultur, 2 paires au choix, 1 boxer. ${ESSENTIALS_DEAL.fr}`,
        en: `Kultur cap, 2 pairs you pick, 1 boxer. ${ESSENTIALS_DEAL.en}`,
      },
      seoTitle: {
        fr: 'MENES ESSENTIALS | Casquette, 2 paires et boxer',
        en: 'MENES ESSENTIALS | Cap, 2 pairs and boxer',
      },
      seoDescription: {
        fr: 'MENES ESSENTIALS. Valait 145,98 $. À toi pour 99,99 $. Casquette Kultur, 2 paires et 1 boxer.',
        en: 'MENES ESSENTIALS. Was 145.98. Yours for 99.99. Kultur cap, 2 pairs and 1 boxer.',
      },
      image: '/images/bundles/essentials.jpg',
      price: 99.99,
      comparePrice: ESSENTIALS_COMPARE,
      currency: 'CAD',
      urgency: { fr: 'Le pack de tous les jours', en: 'The everyday pack' },
      highlights: {
        fr: ['1 casquette Kultur MENES', '2 paires au choix', '1 boxer Red ou Grey', ESSENTIALS_DEAL.hitFr],
        en: ['1 Kultur MENES cap', '2 pairs of your choice', '1 Red or Grey boxer', ESSENTIALS_DEAL.hitEn],
      },
      included: {
        fr: ['1 casquette Kultur MENES (orange, noire ou brune)', '2 paires Kultur Steps au choix', '1 boxer MENES au choix (Red ou Grey)'],
        en: ['1 Kultur MENES cap (orange, black or brown)', '2 Kultur Steps pairs of your choice', '1 MENES boxer of your choice (Red or Grey)'],
      },
      pairCount: 2,
      pairOptions: PAIR_OPTIONS,
      limit: 3,
      hat: true,
      hatOptions: HAT_OPTIONS.filter((h) => !h.virtual),
      defaultHatId: 'orange',
      boxer: true,
      boxerOptions: BOXER_OPTIONS,
      boxerSizes: BOXER_SIZES,
      sizes: [],
      stock: null,
      allowDuplicatePairs: true,
    },
    {
      id: 'bundle-holiday-exclusive',
      slug: 'holiday-exclusive',
      published: true,
      featured: true,
      kind: 'builder',
      order: 1,
      badge: { fr: 'Cadeau des fêtes', en: 'Holiday gift' },
      name: { fr: 'HOLIDAY EXCLUSIVE', en: 'HOLIDAY EXCLUSIVE' },
      tagline: {
        fr: 'Casquette au choix. Sac. Trois paires à toi de composer.',
        en: 'Hat of your choice. Bag. Three pairs you build yourself.',
      },
      description: {
        fr: `Casquette au choix (camo en premier), sac M Keyz, 3 paires. ${HOLIDAY_DEAL.fr}`,
        en: `Hat of your choice (camo first), M Keyz bag, 3 pairs. ${HOLIDAY_DEAL.en}`,
      },
      seoTitle: {
        fr: 'HOLIDAY EXCLUSIVE | Casquette, sac et 3 paires MENES',
        en: 'HOLIDAY EXCLUSIVE | Hat, bag and 3 MENES pairs',
      },
      seoDescription: {
        fr: 'HOLIDAY EXCLUSIVE MENES. Valait 438,99 $. À toi pour 329,99 $. Casquette, sac M Keyz, 3 paires.',
        en: 'MENES HOLIDAY EXCLUSIVE. Was 438.99. Yours for 329.99. Hat, M Keyz bag, 3 pairs.',
      },
      image: '/images/bundles/holiday-exclusive.jpg',
      price: 329.99,
      comparePrice: HOLIDAY_COMPARE,
      currency: 'CAD',
      urgency: { fr: 'Drop limité', en: 'Limited drop' },
      highlights: {
        fr: ['Casquette au choix, camo en premier', 'Sac M Keyz', '3 paires au choix', HOLIDAY_DEAL.hitFr],
        en: ['Hat of your choice, camo first', 'M Keyz bag', '3 pairs of your choice', HOLIDAY_DEAL.hitEn],
      },
      included: {
        fr: ['1 casquette au choix (camo, orange, noire ou brune)', '1 sac M Keyz', '3 paires Kultur Steps au choix'],
        en: ['1 hat of your choice (camo, orange, black or brown)', '1 M Keyz bag', '3 Kultur Steps pairs of your choice'],
      },
      pairCount: 3,
      pairOptions: PAIR_OPTIONS,
      hat: true,
      hatOptions: HAT_OPTIONS,
      defaultHatId: 'camo',
      limit: 5,
      sizes: [],
      stock: null,
      allowDuplicatePairs: true,
    },
  ];

  function loc(map, lang) {
    if (!map || typeof map !== 'object') return '';
    const l = lang === 'fr' ? 'fr' : 'en';
    return map[l] || map.en || map.fr || '';
  }

  function isPriced(bundle) {
    return Number.isFinite(Number(bundle?.price)) && Number(bundle.price) > 0;
  }

  function isBrowsable(bundle) {
    if (!bundle || bundle.published === false) return false;
    if (!loc(bundle.name, 'en') || String(loc(bundle.name, 'en')).includes('[NOM')) return false;
    return Boolean(bundle.image);
  }

  function isReady(bundle) {
    return isBrowsable(bundle) && isPriced(bundle);
  }

  function dropAtMs() {
    const n = Date.parse(DROP_AT);
    return Number.isFinite(n) ? n : Date.parse('2026-11-20T05:00:00.000Z');
  }

  function isDropLive(now) {
    const t = now == null ? Date.now() : Number(now);
    return Number.isFinite(t) && t >= dropAtMs();
  }

  function bundleLimit(bundle) {
    if (bundle?.limit == null || bundle.limit === '') return null;
    const n = Number(bundle.limit);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  }

  function countsTowardBundleLimit(order) {
    const s = String(order?.status || '').toLowerCase();
    if (['cancelled', 'canceled', 'failed', 'expired', 'refunded'].includes(s)) return false;
    if (['paid', 'processing', 'shipped', 'delivered', 'completed', 'fulfilled'].includes(s)) return true;
    if (s === 'pending' || s === 'awaiting_payment') {
      const t = Date.parse(order.date || order.createdAt || '');
      return Number.isFinite(t) && (Date.now() - t) < PENDING_RESERVE_MS;
    }
    return false;
  }

  function countCommitted(store, bundleId) {
    let n = 0;
    for (const order of store?.orders || []) {
      if (!countsTowardBundleLimit(order)) continue;
      for (const item of order.items || []) {
        if (item && (item.id === bundleId || item.productId === bundleId)) {
          n += Math.max(1, parseInt(item.qty, 10) || 1);
        }
      }
    }
    return n;
  }

  function bundleRemaining(store, bundle) {
    const limit = bundleLimit(bundle);
    if (limit == null) return Infinity;
    if (store?.bundles?.soldOut && Object.prototype.hasOwnProperty.call(store.bundles.soldOut, bundle.id) && !Array.isArray(store.orders)) {
      return store.bundles.soldOut[bundle.id] ? 0 : 1;
    }
    return Math.max(0, limit - countCommitted(store, bundle.id));
  }

  function findProduct(store, id) {
    return (store?.products || []).find((p) => p && p.id === id) || null;
  }

  function optionColor(vo) {
    return String(vo?.Color || vo?.Couleur || vo?.color || vo?.couleur || '').toLowerCase();
  }

  function optionSize(vo) {
    return String(vo?.Size || vo?.Taille || vo?.size || vo?.taille || '').toLowerCase();
  }

  function unitsForProduct(product, optionMap) {
    if (!product) return Infinity;
    const list = Array.isArray(product.variants) ? product.variants : [];
    if (!list.length) {
      const s = Number(product.stock);
      if (!Number.isFinite(s)) return Infinity;
      return Math.max(0, s);
    }
    const opts = optionMap || {};
    const wantColor = optionColor(opts);
    const wantSize = optionSize(opts);
    const hit = list.find((v) => {
      const vo = v.options || {};
      if (wantColor && optionColor(vo) !== wantColor) return false;
      if (wantSize && optionSize(vo) !== wantSize) return false;
      if (!wantColor && !wantSize) {
        return Object.keys(opts).every((k) => String(vo[k] || '').toLowerCase() === String(opts[k] || '').toLowerCase());
      }
      return true;
    });
    if (!hit) return 0;
    const s = Number(hit.stock);
    if (!Number.isFinite(s)) return 0;
    return Math.max(0, s);
  }

  function pairUnitsLeft(store, pairId) {
    if (store?.bundles?.pairs && typeof store.bundles.pairs[pairId] === 'boolean' && !Array.isArray(store.orders)) {
      return store.bundles.pairs[pairId] ? Infinity : 0;
    }
    const spec = PAIR_STOCK[pairId];
    if (!spec) return Infinity;
    const product = findProduct(store, spec.productId);
    if (!product) return Infinity;
    return unitsForProduct(product, spec.color ? { Color: spec.color } : {});
  }

  function pairAvailable(store, pairId) {
    return pairUnitsLeft(store, pairId) > 0;
  }

  function hatById(id) {
    return HAT_OPTIONS.find((h) => h.id === String(id || '')) || null;
  }

  function hatUnitsLeft(store, hatId) {
    const id = String(hatId || '').toLowerCase();
    if (store?.bundles?.hats && typeof store.bundles.hats[id] === 'boolean' && !Array.isArray(store.orders)) {
      return store.bundles.hats[id] ? Infinity : 0;
    }
    const hat = hatById(id);
    if (!hat) return 0;
    if (hat.virtual) {
      const raw = store?.inventory?.hats?.[hat.id];
      const n = Number(raw);
      if (Number.isFinite(n)) return Math.max(0, n);
      return Math.max(0, Number(hat.defaultStock) || 0);
    }
    const product = findProduct(store, hat.productId || HAT_PRODUCT_ID);
    if (!product) return Infinity;
    return unitsForProduct(product, hat.color ? { Color: hat.color } : {});
  }

  function hatAvailable(store, hatId) {
    return hatUnitsLeft(store, hatId) > 0;
  }

  function boxerUnitsLeft(store, color, size) {
    const key = `${String(color || '').toLowerCase()}:${String(size || '').toUpperCase()}`;
    if (store?.bundles?.boxers && typeof store.bundles.boxers[key] === 'boolean' && !Array.isArray(store.orders)) {
      return store.bundles.boxers[key] ? Infinity : 0;
    }
    const product = findProduct(store, BOXER_PRODUCT_ID);
    if (!product) return Infinity;
    const colorName = String(color || '').toLowerCase() === 'grey' ? 'Grey' : 'Red';
    return unitsForProduct(product, { Color: colorName, Size: String(size || '').toUpperCase() });
  }

  function canHold(bundle, now, store) {
    if (!isReady(bundle)) return false;
    return bundleRemaining(store, bundle) > 0;
  }

  function canPurchase(bundle, now, store) {
    return isDropLive(now) && canHold(bundle, now, store);
  }

  function soldOutMessage(bundle, lang) {
    const name = loc(bundle?.name, lang) || 'Bundle';
    return lang === 'en' ? `${name} is sold out.` : `${name} est épuisé.`;
  }

  function validateBundleStock(store, bundle, variant, qty) {
    const q = Math.max(1, parseInt(qty, 10) || 1);
    if (bundleRemaining(store, bundle) < q) {
      return { error: soldOutMessage(bundle, 'fr') };
    }
    const picks = [];
    if (bundle.fixedPairId) {
      for (let i = 0; i < q; i += 1) picks.push(bundle.fixedPairId);
    }
    (Array.isArray(variant?.pairs) ? variant.pairs : []).forEach((id) => {
      for (let i = 0; i < q; i += 1) picks.push(String(id));
    });
    const need = {};
    picks.forEach((id) => { need[id] = (need[id] || 0) + 1; });
    for (const [id, n] of Object.entries(need)) {
      const left = pairUnitsLeft(store, id);
      if (left < n) return { error: `Paire indisponible: ${id}` };
    }
    if (bundle.boxer) {
      const left = boxerUnitsLeft(store, variant?.boxerColor, variant?.boxerSize);
      if (left < q) return { error: 'Boxer indisponible dans cette taille' };
    }
    if (bundle.hat) {
      const left = hatUnitsLeft(store, variant?.hatColor || variant?.hat);
      if (left < q) return { error: 'Casquette indisponible' };
    }
    return { ok: true };
  }

  function publicBundleState(store) {
    const soldOut = {};
    BUNDLES.forEach((b) => {
      const left = bundleRemaining(store, b);
      soldOut[b.id] = Number.isFinite(left) ? left <= 0 : false;
    });
    const pairs = {};
    Object.keys(PAIR_STOCK).forEach((id) => {
      pairs[id] = pairAvailable(store, id);
    });
    const boxers = {};
    BOXER_OPTIONS.forEach((b) => {
      BOXER_SIZES.forEach((size) => {
        boxers[`${b.id}:${size}`] = boxerUnitsLeft(store, b.id, size) > 0;
      });
    });
    const hats = {};
    HAT_OPTIONS.forEach((h) => {
      hats[h.id] = hatAvailable(store, h.id);
    });
    return { soldOut, pairs, boxers, hats };
  }

  function payLockMessage(lang) {
    return lang === 'en'
      ? 'Your pack stays in the cart. Payment opens Nov 20 at midnight Eastern. Stock locks when you pay.'
      : 'Le pack reste dans le panier. Le paiement ouvre le 20 novembre à minuit (Montréal). Le stock se confirme au paiement.';
  }

  function dropLockMessage(lang) {
    return payLockMessage(lang);
  }

  function countdownParts(now) {
    const t = now == null ? Date.now() : Number(now);
    let ms = dropAtMs() - t;
    if (!Number.isFinite(ms) || ms < 0) ms = 0;
    const total = Math.floor(ms / 1000);
    return {
      live: ms <= 0,
      days: Math.floor(total / 86400),
      hours: Math.floor((total % 86400) / 3600),
      minutes: Math.floor((total % 3600) / 60),
      seconds: total % 60,
      ms,
    };
  }

  function visibleOnGrid(bundle) {
    return Boolean(bundle);
  }

  function bySlug(slug) {
    return BUNDLES.find((b) => b.slug === String(slug || '')) || null;
  }

  function byId(id) {
    return BUNDLES.find((b) => b.id === String(id || '')) || null;
  }

  function sorted() {
    return BUNDLES.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  function memberMultiplier() {
    const p = Number(CLIENT_DISCOUNT.percent);
    if (!Number.isFinite(p) || p <= 0 || p >= 100) return 1;
    return 1 - p / 100;
  }

  function memberPrice(price, isMember) {
    const n = Number(price);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (!isMember || memberMultiplier() === 1) return Math.round(n * 100) / 100;
    return Math.round(n * memberMultiplier() * 100) / 100;
  }

  function savings(bundle) {
    const price = Number(bundle?.price);
    const compare = Number(bundle?.comparePrice);
    if (!Number.isFinite(price) || !Number.isFinite(compare) || compare <= price) return null;
    const amount = Math.round((compare - price) * 100) / 100;
    const pct = Math.round((amount / compare) * 100);
    return { amount, pct };
  }

  function comboById(bundle, comboId) {
    return (bundle?.combos || []).find((c) => c.id === comboId) || null;
  }

  function pairById(bundle, pairId) {
    const id = String(pairId || '');
    const list = bundle?.pairOptions || PAIR_OPTIONS;
    return list.find((p) => p.id === id) || PAIR_OPTIONS.find((p) => p.id === id) || null;
  }

  function boxerById(bundle, boxerId) {
    return (bundle?.boxerOptions || BOXER_OPTIONS).find((b) => b.id === String(boxerId || '')) || null;
  }

  function pairNeed(bundle) {
    if (bundle?.pairCount == null) return bundle?.kind === 'builder' ? 3 : 0;
    const n = Number(bundle.pairCount);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function validateLine(bundle, variant) {
    if (!bundle) return { error: 'Bundle introuvable' };
    if (bundle.kind === 'combo') {
      const combos = bundle.combos || [];
      if (!combos.length) return { ok: true, variant: variant || {} };
      const combo = comboById(bundle, variant?.combo);
      if (!combo) return { error: 'Choisis un combo de couleurs' };
      return { ok: true, variant: { combo: combo.id } };
    }
    if (bundle.kind === 'builder') {
      const need = pairNeed(bundle);
      const picks = Array.isArray(variant?.pairs) ? variant.pairs.map(String) : [];
      if (picks.length !== need) return { error: `Choisis ${need} paires` };
      const allowDup = bundle.allowDuplicatePairs !== false;
      if (!allowDup && new Set(picks).size !== picks.length) return { error: 'Paires en double non permises' };
      for (const id of picks) {
        if (bundle.fixedPairId && id === bundle.fixedPairId) return { error: 'La paire Kultur est déjà incluse' };
        const pair = pairById(bundle, id);
        if (!pair) return { error: `Paire inconnue: ${id}` };
        if (pair.inStock === false) return { error: `Rupture: ${id}` };
      }
      const out = { pairs: picks };
      if (bundle.fixedPairId) {
        const fixed = pairById(bundle, bundle.fixedPairId);
        if (!fixed) return { error: 'Paire Kultur introuvable' };
        out.fixedPair = fixed.id;
      }
      if (bundle.boxer) {
        const color = String(variant?.boxerColor || variant?.boxer?.color || '').toLowerCase();
        const size = String(variant?.boxerSize || variant?.boxer?.size || '').toUpperCase();
        const boxer = boxerById(bundle, color);
        const sizes = bundle.boxerSizes || BOXER_SIZES;
        if (!boxer) return { error: 'Choisis un boxer' };
        if (!sizes.includes(size)) return { error: 'Choisis une taille de boxer' };
        out.boxerColor = boxer.id;
        out.boxerSize = size;
      }
      if (bundle.hat) {
        const list = bundle.hatOptions || HAT_OPTIONS;
        const hat = list.find((h) => h.id === String(variant?.hatColor || variant?.hat || '')) || null;
        if (!hat) return { error: 'Choisis une casquette' };
        out.hatColor = hat.id;
      }
      return { ok: true, variant: out };
    }
    return { ok: true, variant: variant || {} };
  }

  function variantLabel(bundle, variant, lang) {
    if (!bundle) return '';
    if (bundle.kind === 'combo') {
      const combo = comboById(bundle, variant?.combo);
      return combo ? loc(combo.name, lang) : '';
    }
    if (bundle.kind === 'builder') {
      const picks = Array.isArray(variant?.pairs) ? variant.pairs : [];
      const parts = [];
      if (bundle.fixedPairId) {
        parts.push(loc(pairById(bundle, variant?.fixedPair || bundle.fixedPairId)?.name, lang) || bundle.fixedPairId);
      }
      picks.forEach((id) => parts.push(loc(pairById(bundle, id)?.name, lang) || id));
      if (bundle.boxer && (variant?.boxerColor || variant?.boxerSize)) {
        const boxer = boxerById(bundle, variant.boxerColor);
        const color = loc(boxer?.name, lang) || variant.boxerColor;
        parts.push([color, variant.boxerSize].filter(Boolean).join(' '));
      }
      if (bundle.hat && variant?.hatColor) {
        parts.push(loc(hatById(variant.hatColor)?.name, lang) || variant.hatColor);
      }
      return parts.filter(Boolean).join(' · ');
    }
    return '';
  }

  function clientDiscountRule(code) {
    const c = String(code || '').trim().toUpperCase();
    if (!c || c !== String(CLIENT_DISCOUNT.code).toUpperCase()) return null;
    const p = Number(CLIENT_DISCOUNT.percent);
    if (!Number.isFinite(p) || p <= 0) return null;
    return { code: CLIENT_DISCOUNT.code, type: 'percent', value: p, active: true };
  }

  return {
    SITE_ORIGIN,
    DROP_TZ,
    DROP_AT,
    PAIR_STOCK,
    BOXER_PRODUCT_ID,
    HAT_PRODUCT_ID,
    HAT_OPTIONS,
    CAMO_HAT_STOCK,
    BAG_PRODUCT_ID,
    dropAtMs,
    isDropLive,
    bundleLimit,
    bundleRemaining,
    pairAvailable,
    pairUnitsLeft,
    boxerUnitsLeft,
    hatById,
    hatUnitsLeft,
    hatAvailable,
    canHold,
    canPurchase,
    soldOutMessage,
    validateBundleStock,
    publicBundleState,
    payLockMessage,
    dropLockMessage,
    countdownParts,
    CLIENT_DISCOUNT,
    UNIT_PRICES,
    PAIR_OPTIONS,
    COLOR_PAIR_OPTIONS,
    BOXER_OPTIONS,
    BOXER_SIZES,
    BUNDLES,
    loc,
    isPriced,
    isBrowsable,
    isReady,
    visibleOnGrid,
    bySlug,
    byId,
    sorted,
    memberPrice,
    savings,
    comboById,
    pairById,
    boxerById,
    pairNeed,
    validateLine,
    variantLabel,
    clientDiscountRule,
  };
});
