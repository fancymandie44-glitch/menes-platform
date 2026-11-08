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

  const BOXER_SIZES = ['S', 'M', 'L', 'XL'];
  const BOXER_OPTIONS = [
    { id: 'red', name: { fr: 'Red', en: 'Red' }, swatch: '#c41e3a', image: '/images/products/boxers/red.jpg?v=crop1' },
    { id: 'grey', name: { fr: 'Grey', en: 'Grey' }, swatch: '#8a8a8a', image: '/images/products/boxers/grey.jpg?v=crop1' },
  ];

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
        fr: 'Pack Kultur Steps : 1 paire Kultur charcoal (toujours incluse) + 2 paires de couleur au choix (noir, jaune, rouge, vert, violet, cyan, rose). Street luxe, prêt à porter.',
        en: 'Kultur Steps pack: 1 charcoal Kultur pair (always included) + 2 color pairs of your choice (black, yellow, red, green, purple, cyan, pink). Street luxe, ready to wear.',
      },
      seoTitle: {
        fr: 'KULTUR STEPS | 1 paire Kultur + 2 paires au choix',
        en: 'KULTUR STEPS | 1 Kultur pair + 2 color pairs',
      },
      seoDescription: {
        fr: 'Bundle KULTUR STEPS MENES 34,99 $ : 1 paire Kultur charcoal et 2 paires de couleur au choix. Livraison Québec et Canada.',
        en: 'MENES KULTUR STEPS bundle 34.99: 1 charcoal Kultur pair and 2 color pairs of your choice. Ships Quebec and Canada.',
      },
      image: '/images/bundles/kultur-steps-noir-jaune.jpg',
      price: 34.99,
      comparePrice: null,
      currency: 'CAD',
      urgency: { fr: 'Prêt à partir', en: 'Ready to ship' },
      highlights: {
        fr: ['1 paire Kultur charcoal (fixe)', '2 paires de couleur au choix', '34,99 $ CAD'],
        en: ['1 charcoal Kultur pair (fixed)', '2 color pairs of your choice', '34.99 CAD'],
      },
      included: {
        fr: ['1 paire Kultur charcoal', '2 paires de couleur au choix'],
        en: ['1 charcoal Kultur pair', '2 color pairs of your choice'],
      },
      pairCount: 2,
      pairOptions: COLOR_PAIR_OPTIONS,
      fixedPairId: 'kultur',
      sizes: [],
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
        fr: 'Pack MENES Essentials : 1 casquette Kultur MENES, 2 paires de chaussettes au choix, 1 boxer Red ou Grey (tailles S à XL). Le quotidien street luxe, en un pack.',
        en: 'MENES Essentials pack: 1 Kultur MENES cap, 2 sock pairs of your choice, 1 Red or Grey boxer (sizes S to XL). Daily street luxe, one pack.',
      },
      seoTitle: {
        fr: 'MENES ESSENTIALS | Casquette, 2 paires et boxer',
        en: 'MENES ESSENTIALS | Cap, 2 pairs and boxer',
      },
      seoDescription: {
        fr: 'Bundle MENES Essentials 99,99 $ : casquette Kultur, 2 paires de chaussettes au choix et 1 boxer au choix. Livraison Québec et Canada.',
        en: 'MENES Essentials bundle 99.99: Kultur cap, 2 sock pairs of your choice and 1 boxer of your choice. Ships Quebec and Canada.',
      },
      image: '/images/bundles/essentials.jpg',
      price: 99.99,
      comparePrice: null,
      currency: 'CAD',
      urgency: { fr: 'Le pack de tous les jours', en: 'The everyday pack' },
      highlights: {
        fr: ['1 casquette Kultur MENES', '2 paires au choix', '1 boxer Red ou Grey, S à XL', '99,99 $ CAD'],
        en: ['1 Kultur MENES cap', '2 pairs of your choice', '1 Red or Grey boxer, S to XL', '99.99 CAD'],
      },
      included: {
        fr: ['1 casquette Kultur MENES', '2 paires Kultur Steps au choix', '1 boxer MENES au choix (Red ou Grey)'],
        en: ['1 Kultur MENES cap', '2 Kultur Steps pairs of your choice', '1 MENES boxer of your choice (Red or Grey)'],
      },
      pairCount: 2,
      pairOptions: PAIR_OPTIONS,
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
        fr: 'Casquette. Sac. Trois paires à toi de composer.',
        en: 'Hat. Bag. Three pairs you build yourself.',
      },
      description: {
        fr: 'Holiday Exclusive MENES : casquette camo, sac M Keyz, plus 3 paires de chaussettes au choix. Édition limitée. Tu construis le pack paire par paire.',
        en: 'MENES Holiday Exclusive: camo trucker, M Keyz bag, plus 3 sock pairs you choose. Limited edition. Build the pack pair by pair.',
      },
      seoTitle: {
        fr: 'HOLIDAY EXCLUSIVE | Casquette, sac et 3 paires MENES',
        en: 'HOLIDAY EXCLUSIVE | Hat, bag and 3 MENES pairs',
      },
      seoDescription: {
        fr: 'Bundle Holiday Exclusive MENES : casquette, sac M Keyz et 3 paires de chaussettes au choix. Édition limitée. Livraison Québec et Canada.',
        en: 'MENES Holiday Exclusive bundle: hat, M Keyz bag and 3 sock pairs of your choice. Limited edition. Ships Quebec and Canada.',
      },
      image: '/images/bundles/holiday-exclusive.jpg',
      price: 329.99,
      comparePrice: null,
      currency: 'CAD',
      urgency: { fr: 'Quantités limitées', en: 'Limited quantities' },
      highlights: {
        fr: ['Casquette MENES camo', 'Sac M Keyz', '3 paires au choix', 'Édition limitée'],
        en: ['MENES camo trucker', 'M Keyz bag', '3 pairs of your choice', 'Limited edition'],
      },
      included: {
        fr: ['1 casquette MENES Holiday', '1 sac M Keyz', '3 paires Kultur Steps au choix'],
        en: ['1 MENES Holiday trucker', '1 M Keyz bag', '3 Kultur Steps pairs of your choice'],
      },
      pairCount: 3,
      pairOptions: PAIR_OPTIONS,
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
    CLIENT_DISCOUNT,
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
