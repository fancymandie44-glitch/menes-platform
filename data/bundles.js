/**
 * MENES shop bundles — single source of truth.
 * Add or edit a bundle here only. UI, cart, and checkout read this file.
 *
 * To publish the middle bundle:
 *  1. Set name.fr / name.en
 *  2. Set price (CAD number) and optional comparePrice
 *  3. Set image (path under /images/bundles/)
 *  4. Fill highlights + included
 *  5. Set published: true
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
    { id: 'noir', name: { fr: 'Noir / blanc', en: 'Black / white' }, swatch: '#1a1a1a', image: '/images/bundles/kultur-steps-noir-jaune.jpg', inStock: true },
    { id: 'jaune', name: { fr: 'Jaune', en: 'Yellow' }, swatch: '#e6c200', image: '/images/bundles/kultur-steps-noir-jaune.jpg', inStock: true },
    { id: 'rouge', name: { fr: 'Rouge', en: 'Red' }, swatch: '#c41e3a', image: '/images/bundles/kultur-steps-rouge-noir.jpg', inStock: true },
    { id: 'vert', name: { fr: 'Vert', en: 'Green' }, swatch: '#2e8b57', image: '/images/bundles/kultur-steps-vert-jaune.jpg', inStock: true },
    { id: 'violet', name: { fr: 'Violet', en: 'Purple' }, swatch: '#6b3fa0', image: '/images/bundles/kultur-steps-violet-cyan.jpg', inStock: true },
    { id: 'cyan', name: { fr: 'Cyan', en: 'Cyan' }, swatch: '#2aa8d4', image: '/images/bundles/kultur-steps-violet-cyan.jpg', inStock: true },
    { id: 'rose', name: { fr: 'Rose', en: 'Pink' }, swatch: '#e85aad', image: '/images/bundles/kultur-steps-rose-cyan.jpg', inStock: true },
    { id: 'kultur', name: { fr: 'Kultur charcoal', en: 'Kultur charcoal' }, swatch: '#2b2b2b', image: '/images/bundles/kultur-steps-noir-jaune.jpg', inStock: true },
  ];

  const BUNDLES = [
    {
      id: 'bundle-kultur-steps',
      slug: 'kultur-steps',
      published: true,
      featured: false,
      kind: 'combo',
      order: 1,
      badge: { fr: 'Entrée de gamme', en: 'Starter pack' },
      name: { fr: 'KULTUR STEPS', en: 'KULTUR STEPS' },
      tagline: {
        fr: 'Trois paires. Une vibe. Le pack pour partir.',
        en: 'Three pairs. One vibe. The pack that starts it.',
      },
      description: {
        fr: 'Pack Kultur Steps : trois paires MENES (bas Kultur charcoal au centre + deux paires colorblock). Tu choisis le combo photo. Street luxe, prêt à porter.',
        en: 'Kultur Steps pack: three MENES pairs (charcoal Kultur sock in the center + two colorblock pairs). Pick the photo combo. Street luxe, ready to wear.',
      },
      seoTitle: {
        fr: 'KULTUR STEPS | Pack 3 paires MENES',
        en: 'KULTUR STEPS | MENES 3-pair pack',
      },
      seoDescription: {
        fr: 'Bundle KULTUR STEPS MENES : 3 paires de chaussettes streetwear. Combos noir, jaune, rouge, vert, violet, cyan, rose. Livraison Québec et Canada.',
        en: 'MENES KULTUR STEPS bundle: 3 pairs of streetwear socks. Combos in black, yellow, red, green, purple, cyan, pink. Ships Quebec and Canada.',
      },
      image: '/images/bundles/kultur-steps-noir-jaune.jpg',
      price: null,
      comparePrice: null,
      currency: 'CAD',
      urgency: '',
      highlights: {
        fr: ['3 paires Kultur Steps', 'Combo de couleurs au choix', 'Photo studio officielle', 'Livraison Québec & Canada'],
        en: ['3 Kultur Steps pairs', 'Color combo of your choice', 'Official studio photo', 'Ships Quebec & Canada'],
      },
      included: {
        fr: ['1 paire Kultur charcoal (centre)', '2 paires colorblock selon le combo choisi'],
        en: ['1 charcoal Kultur pair (center)', '2 colorblock pairs from the chosen combo'],
      },
      combos: [
        { id: 'noir-jaune', name: { fr: 'Noir + Kultur + Jaune', en: 'Black + Kultur + Yellow' }, swatch: '#1a1a1a', image: '/images/bundles/kultur-steps-noir-jaune.jpg' },
        { id: 'rouge-noir', name: { fr: 'Rouge + Kultur + Noir', en: 'Red + Kultur + Black' }, swatch: '#c41e3a', image: '/images/bundles/kultur-steps-rouge-noir.jpg' },
        { id: 'vert-jaune', name: { fr: 'Vert + Kultur + Jaune', en: 'Green + Kultur + Yellow' }, swatch: '#2e8b57', image: '/images/bundles/kultur-steps-vert-jaune.jpg' },
        { id: 'violet-cyan', name: { fr: 'Violet + Kultur + Cyan', en: 'Purple + Kultur + Cyan' }, swatch: '#6b3fa0', image: '/images/bundles/kultur-steps-violet-cyan.jpg' },
        { id: 'violet-jaune', name: { fr: 'Violet + Kultur + Jaune', en: 'Purple + Kultur + Yellow' }, swatch: '#7a4cb8', image: '/images/bundles/kultur-steps-violet-jaune.jpg' },
        { id: 'rose-cyan', name: { fr: 'Rose + Kultur + Cyan', en: 'Pink + Kultur + Cyan' }, swatch: '#e85aad', image: '/images/bundles/kultur-steps-rose-cyan.jpg' },
      ],
      sizes: [],
      stock: null,
      allowDuplicatePairs: true,
    },
    {
      id: 'bundle-moyen',
      slug: 'bundle-moyen',
      published: false,
      featured: true,
      kind: 'combo',
      order: 2,
      badge: { fr: 'Le plus populaire', en: 'Most popular' },
      name: { fr: '[NOM DU BUNDLE MOYEN]', en: '[MID BUNDLE NAME]' },
      tagline: {
        fr: 'Le choix ancre. On le remplit dès que le pack est prêt.',
        en: 'The anchor pick. Filled when the pack is ready.',
      },
      description: {
        fr: 'Emplacement du bundle milieu. Ajoute nom, prix, image et highlights dans data/bundles.js, puis published: true.',
        en: 'Middle bundle slot. Add name, price, image and highlights in data/bundles.js, then published: true.',
      },
      seoTitle: { fr: 'Bundle MENES', en: 'MENES bundle' },
      seoDescription: { fr: 'Bundle MENES — bientôt.', en: 'MENES bundle — coming soon.' },
      image: '',
      price: null,
      comparePrice: null,
      currency: 'CAD',
      urgency: '',
      highlights: { fr: [], en: [] },
      included: { fr: [], en: [] },
      combos: [],
      sizes: [],
      stock: null,
      allowDuplicatePairs: true,
    },
    {
      id: 'bundle-holiday-exclusive',
      slug: 'holiday-exclusive',
      published: true,
      featured: false,
      kind: 'builder',
      order: 3,
      badge: { fr: 'Édition limitée', en: 'Limited edition' },
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
      price: null,
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
    return (bundle?.pairOptions || PAIR_OPTIONS).find((p) => p.id === pairId) || null;
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
      const need = Number(bundle.pairCount) || 3;
      const picks = Array.isArray(variant?.pairs) ? variant.pairs.map(String) : [];
      if (picks.length !== need) return { error: `Choisis ${need} paires` };
      const allowDup = bundle.allowDuplicatePairs !== false;
      if (!allowDup && new Set(picks).size !== picks.length) return { error: 'Paires en double non permises' };
      for (const id of picks) {
        const pair = pairById(bundle, id);
        if (!pair) return { error: `Paire inconnue: ${id}` };
        if (pair.inStock === false) return { error: `Rupture: ${id}` };
      }
      return { ok: true, variant: { pairs: picks } };
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
      return picks.map((id) => loc(pairById(bundle, id)?.name, lang) || id).join(' · ');
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
    validateLine,
    variantLabel,
    clientDiscountRule,
  };
});
