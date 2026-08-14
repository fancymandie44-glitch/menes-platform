const STORAGE_KEY = 'menes_store_data';
const DRAFT_KEY = 'menes_checkout_draft';
const VIP_KEY = 'menes_vip';
const PROMO_KEY = 'menes_promo_code';
const ATTR_KEY = 'menes_ambassador_attr';
const WISHLIST_KEY = 'menes_wishlist';
const VIP_DISMISSED_KEY = 'menes_vip_dismissed';
const VIP_DISMISS_DAYS = 14;
const RETIRED_PUBLIC_CODES = new Set(['VIP10', 'WELCOME10']);
const FREE_SHIPPING_THRESHOLD = 150;
const LANG_KEY = 'menes_lang_v2';
const API = '/api/store';

function getAmbassadorAttribution() {
  try {
    const raw = localStorage.getItem(ATTR_KEY);
    if (!raw) return null;
    const attr = JSON.parse(raw);
    if (!attr?.ambassadorId || !attr?.expiresAt) return null;
    if (Date.now() > new Date(attr.expiresAt).getTime()) {
      localStorage.removeItem(ATTR_KEY);
      return null;
    }
    return attr;
  } catch {
    return null;
  }
}

function saveAmbassadorAttribution(attr) {
  if (!attr?.ambassadorId) return;
  localStorage.setItem(ATTR_KEY, JSON.stringify(attr));
  if (attr.promoCode && !localStorage.getItem(PROMO_KEY)) {
    appliedPromoCode = String(attr.promoCode).toUpperCase();
    localStorage.setItem(PROMO_KEY, appliedPromoCode);
  }
}

async function captureAmbassadorRef() {
  const params = new URLSearchParams(location.search);
  let slug = params.get('ref') || params.get('amb') || '';
  if (!slug) {
    const parts = location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    if (parts[0] === 'r' && parts[1]) slug = parts[1];
  }
  if (!slug) return;
  try {
    const res = await fetch(shopApi(`/api/ambassador-track?slug=${encodeURIComponent(slug)}`));
    const data = await res.json().catch(() => ({}));
    if (data.ok && data.attribution) {
      saveAmbassadorAttribution(data.attribution);
      const clean = new URL(location.href);
      clean.searchParams.delete('ref');
      clean.searchParams.delete('amb');
      if (location.pathname.startsWith('/r/')) {
        history.replaceState({}, '', `/${clean.search}`);
      } else {
        history.replaceState({}, '', clean.pathname + (clean.search || '') + clean.hash);
      }
    }
  } catch {}
}

function shippingThreshold() {
  const n = Number(storeData?.site?.freeShippingThreshold);
  return Number.isFinite(n) && n > 0 ? n : FREE_SHIPPING_THRESHOLD;
}

function siteId() {
  return window.MENES_CONFIG?.SITE_ID || '';
}

function shopApi(path) {
  const base = (window.MENES_CONFIG?.API_BASE || '').replace(/\/$/, '');
  const url = base ? `${base}${path}` : path;
  const id = siteId();
  if (!id || !path.startsWith('/api/')) return url;
  return `${url}${url.includes('?') ? '&' : '?'}site=${encodeURIComponent(id)}`;
}

function shopHeaders(extra = {}) {
  const headers = { ...extra };
  const id = siteId();
  if (id) headers['X-Site-Id'] = id;
  return headers;
}
let storeData = null;
let cart = [];
let wishlist = [];
try {
  cart = JSON.parse(localStorage.getItem('menes_cart') || '[]');
  if (!Array.isArray(cart)) cart = [];
} catch {
  cart = [];
  localStorage.removeItem('menes_cart');
}
try {
  wishlist = JSON.parse(localStorage.getItem(WISHLIST_KEY) || '[]');
  if (!Array.isArray(wishlist)) wishlist = [];
} catch {
  wishlist = [];
  localStorage.removeItem(WISHLIST_KEY);
}
let currentFilter = 'all';
let searchQuery = '';
let currentSort = 'featured';
let sizeFilter = '';
let searchDebounceTimer = null;
let appliedPromoCode = (localStorage.getItem(PROMO_KEY) || '').toUpperCase();
if (RETIRED_PUBLIC_CODES.has(appliedPromoCode)) {
  appliedPromoCode = '';
  localStorage.removeItem(PROMO_KEY);
}
let activePdpId = null;

let currentLang = 'en';

const CATEGORY_LABELS_I18N = {
  fr: { all: 'Tout', vetements: 'Vêtements', grillz: 'Grillz', accessoires: 'Accessoires' },
  en: { all: 'All', vetements: 'Clothing', grillz: 'Grillz', accessoires: 'Accessories' },
};

const I18N = {
  fr: {
    nav_shop: 'Boutique', nav_community: 'Communauté', nav_why: 'Pourquoi MENES', nav_faq: 'FAQ', nav_contact: 'Contact',
    cart: 'Panier', hero_cta: 'Voir la collection', label_collection: 'Collection', label_boutique: 'Boutique',
    label_community: 'Communauté', label_questions: 'Questions', label_why: 'Pourquoi nous', label_contact: 'Contact',
    label_signature: 'Signature MENES', label_faq: 'FAQ', why_title: 'Pourquoi MENES',
    contact_sub: 'Une question? On répond sous 24h.', foot_ssl: 'SSL Sécurisé', foot_pay: 'Paiement chiffré',
    foot_pci: 'Paiement sécurisé via Square / PayPal', foot_shipping: 'Livraison', foot_returns: 'Retours et échanges', foot_privacy: 'Confidentialité',
    foot_rights: 'Tous droits réservés', cart_title: 'Panier', cart_secure: 'Paiement 100% sécurisé',
    cart_total: 'Total :', cart_checkout: 'Commander', cart_empty: 'Panier vide',
    cart_qty_inc: 'Augmenter', cart_qty_dec: 'Diminuer', cart_remove: 'Retirer',
    checkout_title: 'Finaliser la commande', checkout_secure: 'Connexion chiffrée SSL. Données protégées',
    f_name: 'Nom complet', f_email: 'Courriel', f_phone: 'Téléphone', f_address: 'Adresse de livraison',
    pay_label: 'Mode de paiement :', pay_card: 'Carte', pay_crypto: 'Crypto', pay_submit: 'Payer par carte',
    alt_pay: 'Besoin de Klarna ou PayPal?', alt_pay_btn: 'Continuer avec Klarna / PayPal', cancel: 'Annuler',
    add_to_cart: 'Ajouter au panier', only_left: 'Plus que', added: 'Ajouté au panier', sig: 'Signature',
    coming: 'Drop bientôt. Suis-nous sur Instagram.',
    f_country: 'Pays', f_city: 'Ville', f_province: 'Province / État', f_postal: 'Code postal',
    sum_title: 'Récapitulatif', subtotal: 'Sous-total', taxes: 'Taxes', shipping: 'Livraison', free: 'Gratuite',
    grand_total: 'Total', tax_intl: 'Taxes selon la destination', discount: 'Rabais',
    promo_label: 'Code promo', promo_apply: 'Appliquer', promo_ok: 'Code appliqué', promo_bad: 'Code invalide',
    promo_vip: 'Trouve un ambassadeur MENES pour −10%', size_guide: 'Guide des tailles',
    promo_ph: 'Code ambassadeur',
    success_title: 'Merci pour ta commande!', success_msg: 'Si le paiement est validé, tu recevras un courriel de confirmation. On prépare ensuite ton colis.',
    success_close: 'Continuer mes achats',
    search_label: 'Rechercher', search_placeholder: 'Rechercher par nom, description ou catégorie...',
    sort_label: 'Trier par', sort_featured: 'En vedette', sort_price_asc: 'Prix croissant', sort_price_desc: 'Prix décroissant',
    complete_look: 'Complète le look', no_results: 'Aucun produit ne correspond à ta recherche.',
    badge_featured: 'Populaire', view_product: 'Voir le produit',
    badge_preorder: 'Précommande',
    preorder_btn: 'Précommander',
    preorder_note_default: 'Paiement maintenant · expédition plus tard',
    preorder_cart: 'Précommande',
    success_preorder: 'Certaines pièces sont en précommande : elles seront expédiées dès qu’elles seront prêtes (pas en livraison immédiate).',
    size_filter: 'Taille', size_all: 'Toutes les tailles',
    promo_min: 'Panier minimum {amount}$ CAD',
    shipping_progress: 'Plus que {amount}$ pour la livraison gratuite',
    shipping_unlocked: 'Livraison gratuite débloquée',
    viewers: '{n} personnes regardent ce produit',
    stock_left: 'Plus que {n} en stock',
    sold_out: 'Épuisé',
    sold_out_variant: 'Cette variante est épuisée',
    stock_limit: 'Stock insuffisant (max {n})',
    wishlist: 'Favoris',
    wishlist_empty: 'Aucun favori pour le moment',
    wishlist_add: 'Ajouté aux favoris',
    wishlist_remove: 'Retiré des favoris',
    purchase_ticker: '<strong>{name}</strong> de {city} vient d\'acheter {product}',
    vip_overlay_label: 'Cercle ambassadeurs',
    vip_overlay_title: 'Les −10% ne sont pas publics',
    vip_overlay_sub: 'Seuls les ambassadeurs MENES détiennent la clé. Trouve le tien, entre son code exclusif, et débloque −10% sur ta commande.',
    vip_overlay_btn: 'Recevoir les drops',
    vip_overlay_skip: 'Je vais trouver un ambassadeur',
    vip_welcome: 'Bienvenue dans le cercle MENES!',
    gallery_empty: 'Photos clients bientôt. Tag',
    gallery_empty_ig: 'sur Instagram.',
    email_ph: 'ton@email.com',
    addr_ph: 'Commence à taper ton adresse...',
    proof_pay: 'Paiement sécurisé',
    proof_ship: 'Livraison CA',
    proof_ex: 'Échange 14 jours',
    upsell_cart_title: 'Complète ton panier',
    upsell_eyebrow: 'Avant de continuer',
    upsell_title: 'Les gens ajoutent aussi ça',
    upsell_sub: 'Une pièce de plus. Look plus fort. Livraison plus proche du gratuit.',
    upsell_add: 'Ajouter au panier',
    upsell_skip: 'Non merci, continuer',
    upsell_add_look: 'Ajouter le look (+1 pièce)',
    upsell_ship_unlock: 'Ajoute {name} ({price}$) : livraison gratuite débloquée',
    upsell_ship_cta: 'Ajouter et débloquer',
    upsell_quick_add: 'Ajouter',
    only_left_suffix: 'restants',
    close: 'Fermer',
    reviews_label: 'Avis clients',
    reviews_title: 'Ce qu\'ils disent',
    reviews_sub: 'Notes vérifiées par la communauté MENES.',
    reviews_empty: 'Aucun avis pour le moment. Sois le premier.',
    reviews_write: 'Écrire un avis',
    reviews_modal_title: 'Écrire un avis',
    reviews_modal_sub: 'Partage ton expérience MENES. Ton avis sera publié après validation.',
    reviews_product: 'Produit',
    reviews_rating: 'Note',
    reviews_name: 'Ton nom',
    reviews_email: 'Courriel (optionnel)',
    reviews_title_field: 'Titre',
    reviews_body: 'Ton avis',
    reviews_submit: 'Envoyer l\'avis',
    reviews_thanks: 'Merci — ton avis sera publié après validation',
    reviews_after_order: 'Laisser un avis',
    reviews_count: '{n} avis',
    reviews_based: 'Basé sur {n} avis',
    reviews_write_product: 'Avis sur ce produit',
    reviews_no_product: 'Aucun produit disponible pour un avis',
    reviews_error: 'Impossible d\'envoyer l\'avis. Réessaie.',
    size_guide_btn: 'Guide des tailles',
    crypto_title: 'Paiement en crypto',
    crypto_send: 'Envoie le montant exact avant la fin du minuteur',
    crypto_order: 'Commande',
    crypto_total: 'Total :',
    crypto_timer: 'Temps restant pour payer',
    crypto_expired: '⏱ Le délai est écoulé. Le taux de change a peut-être changé.',
    crypto_restart: 'Recommencer le paiement',
    crypto_help: 'Le paiement est confirmé automatiquement dès réception sur la blockchain. On expédie ensuite ta commande.',
    crypto_paid: 'J\'ai envoyé le paiement ✓',
    country_ca: 'Canada',
    country_us: 'États-Unis',
    country_fr: 'France',
    country_be: 'Belgique',
    country_ch: 'Suisse',
    country_other: 'Autre',
  },
  en: {
    nav_shop: 'Shop', nav_community: 'Community', nav_why: 'Why MENES', nav_faq: 'FAQ', nav_contact: 'Contact',
    cart: 'Cart', hero_cta: 'Shop the collection', label_collection: 'Collection', label_boutique: 'Shop',
    label_community: 'Community', label_questions: 'Questions', label_why: 'Why us', label_contact: 'Contact',
    label_signature: 'MENES Signature', label_faq: 'FAQ', why_title: 'Why MENES',
    contact_sub: 'Got a question? We reply within 24h.', foot_ssl: 'SSL Secured', foot_pay: 'Encrypted payment',
    foot_pci: 'Secure payment via Square / PayPal', foot_shipping: 'Shipping', foot_returns: 'Returns and exchanges', foot_privacy: 'Privacy',
    foot_rights: 'All rights reserved', cart_title: 'Cart', cart_secure: '100% secure checkout',
    cart_total: 'Total:', cart_checkout: 'Checkout', cart_empty: 'Your cart is empty',
    cart_qty_inc: 'Increase', cart_qty_dec: 'Decrease', cart_remove: 'Remove',
    checkout_title: 'Complete your order', checkout_secure: 'SSL encrypted connection. Protected data',
    f_name: 'Full name', f_email: 'Email', f_phone: 'Phone', f_address: 'Shipping address',
    pay_label: 'Payment method:', pay_card: 'Card', pay_crypto: 'Crypto', pay_submit: 'Pay by card',
    alt_pay: 'Need Klarna or PayPal?', alt_pay_btn: 'Continue with Klarna / PayPal', cancel: 'Cancel',
    add_to_cart: 'Add to cart', only_left: 'Only', added: 'Added to cart', sig: 'Signature',
    coming: 'Drop coming soon. Follow us on Instagram.',
    f_country: 'Country', f_city: 'City', f_province: 'Province / State', f_postal: 'Postal code',
    sum_title: 'Summary', subtotal: 'Subtotal', taxes: 'Taxes', shipping: 'Shipping', free: 'Free',
    grand_total: 'Total', tax_intl: 'Taxes based on destination', discount: 'Discount',
    promo_label: 'Promo code', promo_apply: 'Apply', promo_ok: 'Code applied', promo_bad: 'Invalid code',
    promo_vip: 'Find a MENES ambassador for 10% off', size_guide: 'Size guide',
    promo_ph: 'Ambassador code',
    success_title: 'Thank you for your order!', success_msg: 'Once payment is confirmed, you will receive a confirmation email. We then pack your order.',
    success_close: 'Continue shopping',
    search_label: 'Search', search_placeholder: 'Search by name, description, or category...',
    sort_label: 'Sort by', sort_featured: 'Featured', sort_price_asc: 'Price low to high', sort_price_desc: 'Price high to low',
    complete_look: 'Complete the look', no_results: 'No products match your search.',
    badge_featured: 'Popular', view_product: 'View product',
    badge_preorder: 'Pre-order',
    preorder_btn: 'Pre-order',
    preorder_note_default: 'Pay now · ships later',
    preorder_cart: 'Pre-order',
    success_preorder: 'Some items are pre-order: they ship when ready (not immediate delivery).',
    size_filter: 'Size', size_all: 'All sizes',
    promo_min: 'Minimum cart {amount}$ CAD',
    shipping_progress: '{amount}$ more for free shipping',
    shipping_unlocked: 'Free shipping unlocked',
    viewers: '{n} people are viewing this product',
    stock_left: 'Only {n} left in stock',
    sold_out: 'Sold out',
    sold_out_variant: 'This option is sold out',
    stock_limit: 'Not enough stock (max {n})',
    wishlist: 'Wishlist',
    wishlist_empty: 'No saved items yet',
    wishlist_add: 'Added to wishlist',
    wishlist_remove: 'Removed from wishlist',
    purchase_ticker: '<strong>{name}</strong> from {city} just bought {product}',
    vip_overlay_label: 'Ambassador circle',
    vip_overlay_title: 'Your 10% isn’t on the shelf',
    vip_overlay_sub: 'MENES ambassadors hold the exclusive invite. Find yours, enter their code, and unlock 10% off — the public codes are gone.',
    vip_overlay_btn: 'Get drop alerts',
    vip_overlay_skip: 'I’ll find an ambassador',
    vip_welcome: 'Welcome to the MENES circle!',
    gallery_empty: 'Customer photos soon. Tag',
    gallery_empty_ig: 'on Instagram.',
    email_ph: 'you@email.com',
    addr_ph: 'Start typing your address...',
    proof_pay: 'Secure payment',
    proof_ship: 'Ships to CA',
    proof_ex: '14-day exchange',
    upsell_cart_title: 'Complete your cart',
    upsell_eyebrow: 'Before you go',
    upsell_title: 'People also add this',
    upsell_sub: 'One more piece. Stronger look. Closer to free shipping.',
    upsell_add: 'Add to cart',
    upsell_skip: 'No thanks, continue',
    upsell_add_look: 'Add the look (+1 piece)',
    upsell_ship_unlock: 'Add {name} ({price}$): unlock free shipping',
    upsell_ship_cta: 'Add and unlock',
    upsell_quick_add: 'Add',
    only_left_suffix: 'left',
    close: 'Close',
    reviews_label: 'Customer reviews',
    reviews_title: 'What they say',
    reviews_sub: 'Verified ratings from the MENES community.',
    reviews_empty: 'No reviews yet. Be the first.',
    reviews_write: 'Write a review',
    reviews_modal_title: 'Write a review',
    reviews_modal_sub: 'Share your MENES experience. Your review will go live after approval.',
    reviews_product: 'Product',
    reviews_rating: 'Rating',
    reviews_name: 'Your name',
    reviews_email: 'Email (optional)',
    reviews_title_field: 'Title',
    reviews_body: 'Your review',
    reviews_submit: 'Submit review',
    reviews_thanks: 'Thanks — your review will go live after approval',
    reviews_after_order: 'Leave a review',
    reviews_count: '{n} reviews',
    reviews_based: 'Based on {n} reviews',
    reviews_write_product: 'Review this product',
    reviews_no_product: 'No products available to review',
    reviews_error: 'Could not submit your review. Try again.',
    size_guide_btn: 'Size guide',
    crypto_title: 'Pay with crypto',
    crypto_send: 'Send the exact amount before the timer ends',
    crypto_order: 'Order',
    crypto_total: 'Total:',
    crypto_timer: 'Time left to pay',
    crypto_expired: '⏱ Time is up. The exchange rate may have changed.',
    crypto_restart: 'Restart payment',
    crypto_help: 'Payment confirms automatically once received on-chain. We then ship your order.',
    crypto_paid: 'I sent the payment ✓',
    country_ca: 'Canada',
    country_us: 'United States',
    country_fr: 'France',
    country_be: 'Belgium',
    country_ch: 'Switzerland',
    country_other: 'Other',
  },
};

/** English CMS fallbacks when blob/store has no site.i18n.en yet */
const DEFAULT_SITE_EN = {
  tagline: 'Luxury streetwear. Premium quality.',
  heroTitle: 'Street luxe.\nThis is MENES.',
  heroSubtitle: 'Clothes and accessories for people who set the trend. Not the ones who follow it.',
  heroCta: 'Shop the collection',
  announcement: 'Limited drop · Ships Quebec & Canada · Find a MENES ambassador — unlock exclusive 10% off',
  galleryTitle: 'They wear MENES',
  gallerySubtitle: 'Join the community. Tag @menes_jewelry to get featured.',
  guarantee: 'SSL 256-bit encrypted checkout. Your card details never sit on our servers. Square, Stripe and PayPal handle payments, PCI-DSS certified.',
  trust: [
    { icon: '◆', title: '100% secure payment', text: 'Card, Crypto, Klarna, PayPal' },
    { icon: '◆', title: 'Fast shipping', text: 'Ships in 3-5 business days' },
    { icon: '◆', title: 'Premium quality', text: 'Selected materials, clean finishes' },
    { icon: '◆', title: 'Happy or exchange', text: '14 days to exchange' },
  ],
  why: [
    { title: 'Exclusive design', text: 'Every MENES piece is built to stand out. No mass market. Real luxury streetwear.' },
    { title: 'Direct producer price', text: 'No middleman markup. You pay the fair price for boutique quality.' },
    { title: 'Personal service', text: 'Questions? Hit us on Instagram or email. Reply within 24h.' },
  ],
  faq: [
    { q: 'How do I order?', a: 'Add items to cart, enter your info, pay by card or crypto. Klarna and PayPal are also on the alternate payment page.' },
    { q: 'What payment methods do you accept?', a: 'Card (Square), crypto (BTC, ETH, USDT), Klarna (4 interest-free payments) and PayPal.' },
    { q: 'How long is shipping?', a: '3 to 5 business days in Quebec. 5 to 10 days for the rest of Canada.' },
    { q: 'Can I exchange an item?', a: 'Yes, within 14 days of delivery if the item is unused with tags.' },
  ],
  bundle: {
    title: 'Complete the look',
    text: 'Grillz + streetwear = your MENES signature. Mix your favorite pieces in one checkout.',
    cta: 'Shop the collection',
  },
  emailCapture: {
    title: 'Join the MENES inner circle',
    subtitle: 'Early drops and exclusive access. Want 10% off? Find a MENES ambassador — their code is the only key.',
    button: 'Sign me up',
    placeholder: 'you@email.com',
  },
};

function softHeroTitle(str) {
  const s = String(str || '').replace(/\\n/g, '\n').trim();
  if (!s) return s;
  // Soften shouting ALL-CAPS CMS titles into editorial case
  if (s === s.toUpperCase() && /[A-Z]/.test(s)) {
    return s
      .toLowerCase()
      .replace(/(^|[.\n]\s*)([a-zàâäéèêëïîôùûüç])/g, (_, a, b) => a + b.toUpperCase())
      .replace(/\bmenes\b/gi, 'MENES');
  }
  return s;
}

function humanizeCopy(str) {
  return String(str || '')
    .replace(/[—–]/g, ', ')
    .replace(/\s*·\s*/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function looksLikeRetiredVipPromo(str) {
  return /VIP10|WELCOME10|liste VIP|VIP list|-10%\s*(sur|on)?\s*(ta |your )?premi|premiere commande|première commande|first order with code/i.test(String(str || ''));
}

function ambassadorAnnouncement(lang) {
  return lang === 'en'
    ? 'Limited drop · Ships Quebec & Canada · Find a MENES ambassador — unlock exclusive 10% off'
    : 'Drop limité · Livraison Québec & Canada · Trouve un ambassadeur MENES — débloque −10% exclusifs';
}

function migrateEmailCapture(ec, lang) {
  const out = { ...(ec || {}) };
  if (looksLikeRetiredVipPromo(out.subtitle) || /-10%/.test(String(out.subtitle || ''))) {
    out.subtitle = lang === 'en'
      ? 'Early drops and exclusive access. Want 10% off? Find a MENES ambassador — their code is the only key.'
      : 'Drops en avant-première et accès exclusif. Tu veux −10% ? Trouve un ambassadeur MENES — son code est la seule clé.';
  }
  if (/liste VIP|VIP list/i.test(String(out.title || ''))) {
    out.title = lang === 'en' ? 'Join the MENES inner circle' : 'Rejoins le cercle MENES';
  }
  return out;
}

function siteCopy(lang = currentLang) {
  const s = storeData?.site || {};
  if (lang !== 'en') {
    const fr = { ...(s.i18n?.fr || {}) };
    let announcement = humanizeCopy(fr.announcement || s.announcement);
    if (looksLikeRetiredVipPromo(announcement)) announcement = ambassadorAnnouncement('fr');
    return {
      ...s,
      tagline: humanizeCopy(fr.tagline || s.tagline),
      heroTitle: softHeroTitle(fr.heroTitle || s.heroTitle),
      heroSubtitle: humanizeCopy(fr.heroSubtitle || s.heroSubtitle),
      heroCta: fr.heroCta || s.heroCta,
      announcement,
      trust: fr.trust || s.trust,
      why: fr.why || s.why,
      faq: fr.faq || s.faq,
      galleryTitle: fr.galleryTitle || s.galleryTitle,
      gallerySubtitle: humanizeCopy(fr.gallerySubtitle || s.gallerySubtitle),
      guarantee: humanizeCopy(fr.guarantee || s.guarantee),
      bundle: { ...(s.bundle || {}), ...(fr.bundle || {}) },
      emailCapture: migrateEmailCapture({ ...(s.emailCapture || {}), ...(fr.emailCapture || {}) }, 'fr'),
    };
  }
  // English is the official storefront language — never fall back to French CMS strings
  const en = { ...DEFAULT_SITE_EN, ...(s.i18n?.en || {}) };
  let announcement = humanizeCopy(en.announcement);
  if (looksLikeRetiredVipPromo(announcement)) announcement = ambassadorAnnouncement('en');
  return {
    ...s,
    tagline: humanizeCopy(en.tagline),
    heroTitle: softHeroTitle(en.heroTitle),
    heroSubtitle: humanizeCopy(en.heroSubtitle),
    heroCta: en.heroCta || DEFAULT_SITE_EN.heroCta,
    announcement,
    trust: en.trust || DEFAULT_SITE_EN.trust,
    why: en.why || DEFAULT_SITE_EN.why,
    faq: en.faq || DEFAULT_SITE_EN.faq,
    galleryTitle: en.galleryTitle || DEFAULT_SITE_EN.galleryTitle,
    gallerySubtitle: humanizeCopy(en.gallerySubtitle || DEFAULT_SITE_EN.gallerySubtitle),
    guarantee: humanizeCopy(en.guarantee || DEFAULT_SITE_EN.guarantee),
    bundle: { ...DEFAULT_SITE_EN.bundle, ...(en.bundle || {}) },
    emailCapture: migrateEmailCapture({ ...DEFAULT_SITE_EN.emailCapture, ...(en.emailCapture || {}) }, 'en'),
  };
}

function tFill(key, vars = {}) {
  let s = t(key);
  Object.entries(vars).forEach(([k, v]) => { s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), v); });
  return s;
}

function saveWishlist() {
  localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
  updateWishlistUI();
}

function isWishlisted(id) {
  return wishlist.includes(id);
}

function toggleWishlist(id) {
  const idx = wishlist.indexOf(id);
  if (idx >= 0) {
    wishlist.splice(idx, 1);
    showToast(t('wishlist_remove'));
  } else {
    wishlist.push(id);
    showToast(t('wishlist_add'));
  }
  saveWishlist();
  document.querySelectorAll(`.wishlist-btn[data-id="${CSS.escape(id)}"]`).forEach((btn) => {
    btn.classList.toggle('active', isWishlisted(id));
    btn.innerHTML = isWishlisted(id) ? '&#9829;' : '&#9825;';
    btn.setAttribute('aria-label', isWishlisted(id) ? t('wishlist_remove') : t('wishlist_add'));
  });
}

function updateWishlistUI() {
  const count = wishlist.length;
  const navCount = document.getElementById('wishlistNavCount');
  if (navCount) {
    navCount.textContent = count;
    navCount.classList.toggle('hidden', count === 0);
  }
  const filterCount = document.getElementById('filterWishlistCount');
  if (filterCount) {
    filterCount.textContent = count;
    filterCount.classList.toggle('hidden', count === 0);
  }
}

function renderShippingBar() {
  const bar = document.getElementById('cartShippingBar');
  const text = document.getElementById('cartShippingText');
  const fill = document.getElementById('cartShippingFill');
  if (!bar || !text || !fill) return;

  if (!cart.length) {
    bar.classList.add('hidden');
    return;
  }

  const subtotal = cartSubtotal();
  const threshold = shippingThreshold();
  const remaining = Math.max(0, threshold - subtotal);
  const pct = Math.min(100, (subtotal / threshold) * 100);

  bar.classList.remove('hidden');
  fill.style.width = `${pct}%`;

  if (remaining <= 0) {
    text.textContent = t('shipping_unlocked');
    text.classList.add('is-unlocked');
  } else {
    text.textContent = tFill('shipping_progress', { amount: remaining.toFixed(2) });
    text.classList.remove('is-unlocked');
  }
}

function renderPdpUrgency(product) {
  const el = document.getElementById('pdpUrgency');
  if (!el || !product) return;
  const panel = document.getElementById('pdpPanel');
  const variant = readSelectedVariant(panel);
  const left = availableStockFor(product, variant);
  const bits = [];
  if (Number.isFinite(left) && left > 0 && left <= 5) {
    bits.push(tFill('stock_left', { n: left }));
  } else if (Number.isFinite(left) && left <= 0) {
    bits.push(t('sold_out_variant'));
  }
  if (bits.length) {
    el.textContent = bits.join(' · ');
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

/* ---------- Purchase ticker (disabled — no fake social proof) ---------- */
function setupPurchaseTicker() {
  const el = document.getElementById('purchaseTicker');
  if (el) el.classList.add('hidden');
}

/* ---------- VIP exit overlay ---------- */
function isVipDismissed() {
  const raw = localStorage.getItem(VIP_DISMISSED_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < VIP_DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

function shouldShowVipOverlay() {
  if (isVipMember()) return false;
  if (isVipDismissed()) return false;
  return true;
}

function markVipOverlayShown() {
  localStorage.setItem(VIP_DISMISSED_KEY, String(Date.now()));
}

function showVipOverlay() {
  if (!shouldShowVipOverlay()) return;
  markVipOverlayShown();
  const overlay = document.getElementById('vipOverlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  syncScrollLock();
}

function hideVipOverlay() {
  const overlay = document.getElementById('vipOverlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  syncScrollLock();
}

async function submitVipEmail(email, btn, source = 'vip') {
  if (!email) return false;
  const oldText = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    const res = await fetch(shopApi('/api/subscribe'), {
      method: 'POST',
      headers: shopHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
      body: JSON.stringify({
        email,
        source,
        locale: currentLang,
        tags: ['vip'],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'subscribe failed');
    showToast(t('vip_welcome'));
    localStorage.setItem(VIP_KEY, '1');
    syncPromoField();
    hideVipOverlay();
    return true;
  } catch {
    showToast(currentLang === 'en' ? 'Error, try again or contact us' : 'Erreur, réessaie ou écris-nous');
    return false;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldText || t('vip_overlay_btn'); }
  }
}

function isOverlayOpen() {
  return ['cartPanel', 'pdpPanel', 'checkoutModal', 'cryptoModal', 'successModal', 'vipOverlay', 'reviewModal', 'upsellModal', 'sizeGuideModal']
    .some((id) => !document.getElementById(id)?.classList.contains('hidden'));
}

let scrollLockY = 0;
function lockPageScroll() {
  if (document.body.classList.contains('scroll-locked')) return;
  scrollLockY = window.scrollY || window.pageYOffset || 0;
  document.body.classList.add('scroll-locked');
  document.documentElement.classList.add('scroll-locked');
  document.body.style.top = `-${scrollLockY}px`;
}

function unlockPageScroll() {
  if (!document.body.classList.contains('scroll-locked')) return;
  document.body.classList.remove('scroll-locked');
  document.documentElement.classList.remove('scroll-locked');
  document.body.style.top = '';
  window.scrollTo(0, scrollLockY || 0);
}

function syncScrollLock() {
  if (isOverlayOpen()) lockPageScroll();
  else unlockPageScroll();
}

function setupVipOverlay() {
  if (!shouldShowVipOverlay()) return;

  const isDesktop = () => window.matchMedia('(pointer: fine) and (hover: hover)').matches
    && window.innerWidth >= 768;

  let exitReady = false;
  setTimeout(() => { exitReady = true; }, 8000);

  document.addEventListener('mouseout', (e) => {
    if (!isDesktop() || !shouldShowVipOverlay() || isOverlayOpen()) return;
    if (e.clientY <= 0 && e.relatedTarget == null && exitReady) showVipOverlay();
  });

  document.getElementById('vipOverlayClose')?.addEventListener('click', () => {
    markVipOverlayShown();
    hideVipOverlay();
  });
  document.getElementById('vipOverlaySkip')?.addEventListener('click', () => {
    markVipOverlayShown();
    hideVipOverlay();
  });
  document.getElementById('vipOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'vipOverlay') {
      markVipOverlayShown();
      hideVipOverlay();
    }
  });
  document.getElementById('vipOverlayForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (document.getElementById('vipOverlayHoney')?.value) return;
    await submitVipEmail(document.getElementById('vipOverlayEmail')?.value.trim(), document.getElementById('vipOverlayBtn'));
  });
}

/* ---------- Taxes (Canadian merchant) ---------- */
const CA_TAXES = {
  AB: { rate: 5, label: 'TPS 5%' },
  BC: { rate: 12, label: 'TPS 5% + TVP 7%' },
  MB: { rate: 12, label: 'TPS 5% + TVP 7%' },
  NB: { rate: 15, label: 'TVH 15%' },
  NL: { rate: 15, label: 'TVH 15%' },
  NS: { rate: 14, label: 'TVH 14%' },
  NT: { rate: 5, label: 'TPS 5%' },
  NU: { rate: 5, label: 'TPS 5%' },
  ON: { rate: 13, label: 'TVH 13%' },
  PE: { rate: 15, label: 'TVH 15%' },
  QC: { rate: 14.975, label: 'TPS 5% + TVQ 9,975%' },
  SK: { rate: 11, label: 'TPS 5% + TVP 6%' },
  YT: { rate: 5, label: 'TPS 5%' },
};

const CA_PROVINCES = [
  ['QC', 'Québec', 'Quebec'], ['ON', 'Ontario', 'Ontario'], ['BC', 'Colombie-Britannique', 'British Columbia'],
  ['AB', 'Alberta', 'Alberta'], ['MB', 'Manitoba', 'Manitoba'], ['SK', 'Saskatchewan', 'Saskatchewan'],
  ['NB', 'Nouveau-Brunswick', 'New Brunswick'], ['NS', 'Nouvelle-Écosse', 'Nova Scotia'],
  ['PE', 'Île-du-Prince-Édouard', 'Prince Edward Island'], ['NL', 'Terre-Neuve-et-Labrador', 'Newfoundland and Labrador'],
  ['NT', 'Territoires du Nord-Ouest', 'Northwest Territories'], ['YT', 'Yukon', 'Yukon'], ['NU', 'Nunavut', 'Nunavut'],
];

const US_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];

function computeTax(country, province, subtotal) {
  if (country === 'CA') {
    const info = CA_TAXES[province];
    if (info) return { rate: info.rate, amount: subtotal * (info.rate / 100), label: info.label };
    return { rate: 0, amount: 0, label: '' };
  }
  return { rate: 0, amount: 0, label: '' };
}

function cartSubtotal() {
  return cart.reduce((s, c) => s + c.price * c.qty, 0);
}

function isVipMember() {
  return localStorage.getItem(VIP_KEY) === '1';
}

function findDiscount(code) {
  const c = (code || '').trim().toUpperCase();
  if (!c) return null;
  if (RETIRED_PUBLIC_CODES.has(c)) return null;
  return (storeData?.discounts || []).find((d) => d && d.active !== false && String(d.code || '').toUpperCase() === c) || null;
}

function discountEligible(discount, subtotal) {
  if (!discount) return false;
  const min = Number(discount.minCart) || 0;
  return subtotal >= min;
}

function getActiveDiscount() {
  const subtotal = cartSubtotal();
  if (appliedPromoCode) {
    const manual = findDiscount(appliedPromoCode);
    if (manual && discountEligible(manual, subtotal)) return manual;
  }
  return null;
}

function computeDiscount(subtotal, discount) {
  if (!discount || !(subtotal > 0)) return { amount: 0, code: '', label: '' };
  let amount = 0;
  if (discount.type === 'fixed') amount = Math.min(subtotal, Number(discount.value) || 0);
  else amount = subtotal * ((Number(discount.value) || 0) / 100);
  amount = Math.round(amount * 100) / 100;
  return { amount, code: discount.code, label: discount.code };
}

function applyPromoCode(code, opts = {}) {
  const msg = document.getElementById('promoMsg');
  const cleaned = (code || '').trim().toUpperCase();
  if (!cleaned) {
    appliedPromoCode = '';
    localStorage.removeItem(PROMO_KEY);
    if (msg) { msg.textContent = ''; msg.className = 'promo-msg'; }
    renderCheckoutSummary();
    updateCartUI();
    return false;
  }
  const d = findDiscount(cleaned);
  if (!d) {
    if (msg) { msg.textContent = t('promo_bad'); msg.className = 'promo-msg err'; }
    if (!opts.silent) showToast(t('promo_bad'));
    return false;
  }
  const min = Number(d.minCart) || 0;
  if (cartSubtotal() < min) {
    const tip = currentLang === 'en'
      ? `Minimum cart ${min.toFixed(2)}$ CAD`
      : `Panier minimum ${min.toFixed(2)}$ CAD`;
    if (msg) { msg.textContent = tip; msg.className = 'promo-msg err'; }
    if (!opts.silent) showToast(tip);
    return false;
  }
  appliedPromoCode = cleaned;
  localStorage.setItem(PROMO_KEY, cleaned);
  if (msg) { msg.textContent = `${t('promo_ok')}: ${cleaned}`; msg.className = 'promo-msg ok'; }
  if (!opts.silent) showToast(`${t('promo_ok')}: ${cleaned}`);
  renderCheckoutSummary();
  updateCartUI();
  return true;
}

function t(key) {
  return (I18N[currentLang] || I18N.en)[key] ?? I18N.en[key] ?? I18N.fr[key] ?? key;
}

function CATEGORY_LABELS_GET(cat) {
  const map = CATEGORY_LABELS_I18N[currentLang] || CATEGORY_LABELS_I18N.fr;
  return map[cat] || cat;
}

const FONT_OPTIONS = {
  'Bebas Neue': { google: 'Bebas+Neue', stack: "'Bebas Neue', sans-serif" },
  'Syne': { google: 'Syne:wght@500;600;700;800', stack: "'Syne', sans-serif" },
  'DM Sans': { google: 'DM+Sans:wght@400;500;600;700', stack: "'DM Sans', sans-serif" },
  'Inter': { google: 'Inter:wght@300;400;500;600;700', stack: "'Inter', sans-serif" },
  'Poppins': { google: 'Poppins:wght@400;500;600;700', stack: "'Poppins', sans-serif" },
  'Montserrat': { google: 'Montserrat:wght@400;500;600;700;800', stack: "'Montserrat', sans-serif" },
  'Oswald': { google: 'Oswald:wght@400;500;600;700', stack: "'Oswald', sans-serif" },
  'Anton': { google: 'Anton', stack: "'Anton', sans-serif" },
  'Archivo Black': { google: 'Archivo+Black', stack: "'Archivo Black', sans-serif" },
  'Playfair Display': { google: 'Playfair+Display:wght@400;500;600;700;800', stack: "'Playfair Display', serif" },
  'Cormorant Garamond': { google: 'Cormorant+Garamond:wght@400;500;600;700', stack: "'Cormorant Garamond', serif" },
  'Space Grotesk': { google: 'Space+Grotesk:wght@400;500;600;700', stack: "'Space Grotesk', sans-serif" },
  'Roboto': { google: 'Roboto:wght@400;500;700', stack: "'Roboto', sans-serif" },
  'Rubik': { google: 'Rubik:wght@400;500;600;700', stack: "'Rubik', sans-serif" },
};

const loadedFonts = new Set();
function loadGoogleFont(family) {
  const opt = FONT_OPTIONS[family];
  if (!opt || loadedFonts.has(family)) return;
  loadedFonts.add(family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${opt.google}&display=swap`;
  document.head.appendChild(link);
}

const THEME_MODES = {
  light: { bg: '#f4f2ee', surface: '#ffffff', text: '#0a0a0a', muted: '#555555', border: '#e0e0e0', navbg: 'rgba(244,242,238,0.95)', btnBg: '#0a0a0a', btnText: '#fafafa' },
  dark: { bg: '#050505', surface: '#0f0f0f', text: '#f4f2ee', muted: '#a8a8a8', border: '#2a2a2a', navbg: 'rgba(5,5,5,0.88)', btnBg: '', btnText: '#050505' },
};

const ASPECT_MAP = { '': '', square: '1 / 1', portrait45: '4 / 5', portrait34: '3 / 4', landscape: '16 / 9', wide: '3 / 2' };

function applyTheme() {
  const th = storeData.site?.theme || {};
  const accent = th.accent || '#c9a84c';
  const accentDark = th.accentDark || '#e0c078';
  const radius = th.radius != null ? th.radius : 2;
  const btnRadius = th.buttonRadius != null ? th.buttonRadius : radius;

  const mode = th.mode || 'dark';
  let pal;
  if (mode === 'custom') {
    pal = {
      bg: th.bg || '#050505', surface: th.surface || '#0f0f0f', text: th.text || '#f4f2ee',
      muted: th.muted || 'rgba(168,168,168,0.9)', border: th.border || '#2a2a2a',
      navbg: th.surface || 'rgba(5,5,5,0.88)', btnBg: '', btnText: '#050505',
    };
  } else {
    pal = { ...(THEME_MODES[mode] || THEME_MODES.dark) };
  }
  const btnBg = th.buttonBg || pal.btnBg || (mode === 'dark' ? accent : '#0a0a0a');
  const btnText = th.buttonText || pal.btnText || (mode === 'dark' ? '#050505' : '#fafafa');

  const headingFont = FONT_OPTIONS[th.headingFont]?.stack || "'Syne', sans-serif";
  const bodyFont = FONT_OPTIONS[th.bodyFont]?.stack || "'DM Sans', sans-serif";
  if (th.headingFont) loadGoogleFont(th.headingFont);
  if (th.bodyFont) loadGoogleFont(th.bodyFont);

  const imgH = th.productImgHeight != null ? th.productImgHeight : 360;
  const imgFit = th.productImgFit || 'cover';
  const aspect = ASPECT_MAP[th.productAspect || ''] || '';
  const gridMin = th.gridMin != null ? th.gridMin : 260;
  const heroH = th.heroHeight != null ? th.heroHeight : 92;
  const overlay = (th.heroOverlay != null ? th.heroOverlay : 48) / 100;
  const annBg = th.announceBg || '#050505';
  const annColor = th.announceColor || accent;

  const css = `
:root { --gold: ${accent}; --gold-dark: ${accentDark}; --radius: ${radius}px; --black: ${pal.bg}; --white: ${pal.text}; --hairline: ${pal.border}; }
body { background: ${pal.bg}; color: ${pal.text}; font-family: ${bodyFont}; }
.hero h1, .section-head h2, .nav-brand span, .product-price, .bundle-copy h2, .cart-header h3, .modal-box h3, .contact-section h2, .pdp-body h2, .product-title-btn { font-family: ${headingFont}; }
.nav { background: ${pal.navbg}; border-bottom-color: ${pal.border}; }
.nav-brand span, .nav-links a { color: ${pal.text}; }
.product-card, .modal-box, .cart-panel, .pdp-panel, .why-card { background: ${pal.surface}; border-color: ${pal.border}; color: ${pal.text}; }
.product-title-btn, .cart-item, .cart-total { color: ${pal.text}; }
.product-body p, .section-sub, .contact-sub, .pdp-desc { color: ${pal.muted}; }
.product-card select, .modal-box input, .modal-box textarea, .modal-box select { background: ${mode === 'dark' ? '#161616' : '#fff'}; color: ${pal.text}; border-color: ${pal.border}; }
.products-grid { grid-template-columns: repeat(auto-fill, minmax(${gridMin}px, 1fr)); }
.product-img { height: ${aspect ? 'auto' : `${imgH}px`}; ${aspect ? `aspect-ratio: ${aspect};` : ''} }
.product-img img { object-fit: ${imgFit}; }
.hero { min-height: ${heroH}vh; }
.hero-bg.has-image::after, .hero-bg.has-video::after { background: linear-gradient(180deg, rgba(5,5,5,${overlay * 0.6}) 0%, rgba(5,5,5,${Math.min(0.95, overlay + 0.25)}) 100%); }
.announce { background: ${annBg}; color: ${annColor}; }
.product-card button.add-btn, .btn-checkout, .cart-btn, .sticky-atc-btn { background: ${btnBg}; color: ${btnText}; border-radius: ${btnRadius}px; }
.hero-cta { border-radius: ${btnRadius}px; }
.filter { border-radius: ${btnRadius}px; }
`;
  let styleEl = document.getElementById('menes-theme');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'menes-theme';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = css;

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = annBg;
}

function detectVisitorLang() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === 'en' || saved === 'fr') return saved;
  // Official site language wins over browser (boutique is English-first)
  const siteLang = storeData?.site?.language;
  if (siteLang === 'en' || siteLang === 'fr') return siteLang;
  const nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
  if (nav.startsWith('fr')) return 'fr';
  if (nav.startsWith('en')) return 'en';
  return 'en';
}

function setVisitorLang(lang, opts = {}) {
  currentLang = lang === 'en' ? 'en' : 'fr';
  localStorage.setItem(LANG_KEY, currentLang);
  applyLanguage({ skipDetect: true });
  if (!opts.silent) {
    renderSite();
    applySectionOrder();
    renderFilters();
    renderProducts();
    applySeo();
    updateCartUI();
    populateProvinces();
    if (activePdpId) openPdp(activePdpId);
  }
}

function applyLanguage(opts = {}) {
  if (!opts.skipDetect) {
    currentLang = detectVisitorLang();
    if (!localStorage.getItem(LANG_KEY)) localStorage.setItem(LANG_KEY, currentLang);
  }
  document.documentElement.lang = currentLang;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    const val = t(key);
    if (val) el.textContent = val;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const val = t(el.dataset.i18nPlaceholder);
    if (val) el.placeholder = val;
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    const val = t(el.dataset.i18nAria);
    if (val) el.setAttribute('aria-label', val);
  });
  const langBtn = document.getElementById('langToggle');
  if (langBtn) {
    langBtn.textContent = currentLang === 'en' ? 'FR' : 'EN';
    langBtn.setAttribute('aria-label', currentLang === 'en' ? 'Passer en français' : 'Switch to English');
  }
  const closeCart = document.getElementById('closeCart');
  if (closeCart) closeCart.setAttribute('aria-label', t('close'));
  const closePdp = document.getElementById('closePdp');
  if (closePdp) closePdp.setAttribute('aria-label', t('close'));
  syncDiscoveryLabels();
  renderShippingBar();
  syncCountryLabels();
  if (activePdpId) {
    const p = storeData?.products?.find((x) => x.id === activePdpId);
    if (p) renderPdpUrgency(p);
  }
  updateWishlistUI();
}

function syncCountryLabels() {
  const sel = document.getElementById('checkoutCountry');
  if (!sel) return;
  const map = {
    CA: 'country_ca', US: 'country_us', FR: 'country_fr', BE: 'country_be', CH: 'country_ch', OTHER: 'country_other',
  };
  Array.from(sel.options).forEach((opt) => {
    const key = map[opt.value];
    if (key) opt.textContent = t(key);
  });
}

function applySeo() {
  const s = storeData.site || {};
  const seo = s.seo || {};
  const name = s.name || 'MENES';
  const enSeo = seo.en || {};
  if (currentLang === 'en') {
    document.title = enSeo.title || seo.titleEn || 'MENES | Luxury Streetwear';
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta); }
    meta.content = enSeo.description || seo.descriptionEn || 'MENES. Luxury streetwear. Premium clothing, secure checkout, fast shipping across Quebec and Canada.';
  } else {
    document.title = seo.title || `${name} | ${s.tagline || 'Luxe Streetwear'}`;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta); }
    if (seo.description) meta.content = seo.description;
  }
  if (s.favicon) {
    let icon = document.querySelector('link[rel="icon"]');
    if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.appendChild(icon); }
    icon.href = s.favicon;
  }
}

function cachedStoreScore(data) {
  const products = Array.isArray(data?.products) ? data.products : [];
  const withImage = products.filter((p) => p && (p.image || (Array.isArray(p.images) && p.images.length))).length;
  return products.length * 10 + withImage * 100;
}

async function loadStoreData() {
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (_) { cached = null; }
  try {
    const res = await fetch(shopApi(API), { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      delete data._siteId;
      if (cached && cachedStoreScore(cached) > cachedStoreScore(data)) {
        return cached;
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (_) {
        // Quota exceeded (grosses photos base64) — garder la data API fraîche quand même
        try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* ignore */ }
      }
      return data;
    }
  } catch (_) { /* fall through */ }
  if (cached) return cached;
  try {
    const res = await fetch('/data/store.json');
    if (res.ok) return await res.json();
  } catch (_) { /* ignore */ }
  return null;
}

async function refreshStore(opts = {}) {
  if (document.hidden && !opts.force) return;
  const next = await loadStoreData();
  if (!next) return;
  if (!Array.isArray(next.discounts)) next.discounts = [];
  next.discounts = next.discounts.filter((d) => !RETIRED_PUBLIC_CODES.has(String(d.code || '').toUpperCase()));
  // Skip expensive full re-render when catalog/site unchanged
  const fingerprint = `${(next.products || []).length}:${(next.products || []).map((p) => `${p.id}:${p.price}:${p.stock}:${p.active}`).join('|')}:${next.site?.name}:${next.site?.heroTitle}:${(next.discounts || []).map((d) => d.code + d.value).join(',')}`;
  if (!opts.force && fingerprint === window.__menesStoreFp && storeData) {
    storeData = next;
    return;
  }
  window.__menesStoreFp = fingerprint;
  storeData = next;
  applyLanguage();
  applyTheme();
  renderSite();
  applySectionOrder();
  renderFilters();
  renderProducts();
  applySeo();
  setupReveal();
  syncPromoField();
  setupDiscoveryControls();
}

const DEFAULT_SECTION_ORDER = ['trustBar', 'products', 'gallery', 'reviews', 'why', 'emailCapture', 'faq', 'contact', 'guarantee'];

function applySectionOrder() {
  const order = Array.isArray(storeData?.site?.sectionOrder) && storeData.site.sectionOrder.length
    ? storeData.site.sectionOrder
    : DEFAULT_SECTION_ORDER;
  const hero = document.getElementById('heroSection');
  if (!hero) return;
  let ref = hero;
  order.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    ref.after(el);
    ref = el;
  });
}

function renderSite() {
  const raw = storeData.site || {};
  const s = siteCopy();
  const sec = raw.sections || {};

  document.title = `${raw.name || 'MENES'} | ${currentLang === 'en' ? 'Luxury Streetwear' : 'Luxe Streetwear'}`;
  document.getElementById('navBrand').textContent = raw.name || 'MENES';
  document.getElementById('footerBrand').textContent = raw.name || 'MENES';

  if (raw.logo) {
    const logo = document.getElementById('navLogo');
    logo.src = raw.logo;
    logo.classList.remove('hidden');
  }

  toggle('announceBar', sec.announcement !== false && s.announcement);
  if (s.announcement) document.getElementById('announceBar').textContent = s.announcement;

  document.getElementById('heroTag').textContent = s.tagline || '';
  document.getElementById('heroTitle').textContent = (s.heroTitle || raw.name || 'MENES').replace(/\\n/g, '\n');
  document.getElementById('heroSubtitle').textContent = s.heroSubtitle || '';
  document.getElementById('heroCta').textContent = s.heroCta || t('hero_cta');

  const heroBg = document.getElementById('heroBg');
  const heroVideo = document.getElementById('heroVideo');
  heroBg.classList.remove('has-image', 'has-video');
  heroBg.style.backgroundImage = '';
  if (heroVideo) {
    heroVideo.classList.add('hidden');
    heroVideo.removeAttribute('src');
    heroVideo.load?.();
  }
  if (raw.heroVideo && heroVideo) {
    heroVideo.src = raw.heroVideo;
    if (raw.heroImage) heroVideo.poster = raw.heroImage;
    heroVideo.classList.remove('hidden');
    heroBg.classList.add('has-video');
    heroVideo.play?.().catch(() => {});
  } else if (raw.heroImage) {
    heroBg.style.backgroundImage = `url(${raw.heroImage})`;
    heroBg.classList.add('has-image');
  }

  toggle('trustBar', sec.trustBar !== false);
  if (sec.trustBar !== false && s.trust?.length) {
    document.getElementById('trustBar').innerHTML = `<div class="trust-grid">${s.trust.map((item) => `
      <div class="trust-item reveal"><div class="icon">◆</div><h4>${esc(item.title)}</h4><p>${esc(item.text)}</p></div>
    `).join('')}</div>`;
  }

  renderBundle(s, sec);
  renderGallery(s, sec, raw);
  renderReviewsSection(sec);
  renderEmailCapture(s, sec);

  toggle('why', sec.why !== false);
  if (sec.why !== false && s.why?.length) {
    document.getElementById('whyGrid').innerHTML = s.why.map((w) => `
      <div class="why-card"><h3>${esc(w.title)}</h3><p>${esc(w.text)}</p></div>
    `).join('');
  }

  toggle('faq', sec.faq !== false);
  if (sec.faq !== false && s.faq?.length) {
    document.getElementById('faqList').innerHTML = s.faq.map((f) => `
      <div class="faq-item">
        <button class="faq-q" type="button">${esc(f.q)}</button>
        <div class="faq-a">${esc(f.a)}</div>
      </div>
    `).join('');
    document.querySelectorAll('.faq-q').forEach((btn) => {
      btn.addEventListener('click', () => btn.parentElement.classList.toggle('open'));
    });
  }

  toggle('guarantee', sec.guarantee !== false && s.guarantee);
  if (s.guarantee) document.getElementById('guaranteeText').textContent = s.guarantee;

  const igHandle = raw.instagramHandle || '@menes_jewelry';
  if (raw.instagram) {
    document.getElementById('linkInstagram').href = raw.instagram;
    document.getElementById('linkInstagram').textContent = `Instagram ${igHandle}`;
  }
  if (raw.email) {
    document.getElementById('linkEmail').href = `mailto:${raw.email}`;
    document.getElementById('linkEmail').textContent = raw.email;
  }
  if (raw.phone) {
    const ph = document.getElementById('linkPhone');
    ph.href = `tel:${raw.phone}`;
    ph.textContent = raw.phone;
    ph.classList.remove('hidden');
  }
}

function renderBundle(/* s, sec */) {
  // Signature / grillz mix section retired
  toggle('bundle', false);
}

function renderGallery(s, sec, raw) {
  const src = raw || storeData.site || {};
  const items = (src.gallery || []).filter((g) => g.image || g.postUrl || g.handle);
  const allItems = src.gallery || [];
  toggle('gallery', sec.gallery !== false);
  if (sec.gallery === false) return;

  document.getElementById('galleryTitle').textContent = s.galleryTitle || (currentLang === 'en' ? 'They wear MENES' : 'Ils portent MENES');
  document.getElementById('gallerySubtitle').textContent = s.gallerySubtitle || '';
  const igLink = document.getElementById('galleryIgLink');
  if (src.instagram) {
    igLink.href = src.instagram;
    igLink.textContent = src.instagramHandle || '@menes_jewelry';
  }

  const grid = document.getElementById('galleryGrid');
  const empty = document.getElementById('galleryEmpty');

  if (!items.length) {
    grid.innerHTML = allItems.slice(0, 6).map(() => `
      <div class="gallery-item"><div class="gallery-placeholder">${currentLang === 'en' ? 'Customer photo<br>soon' : 'Photo client<br>bientôt'}</div></div>
    `).join('');
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  grid.innerHTML = items.map((g) => {
    const handle = (g.handle || '').trim();
    const caption = (g.caption || '').trim();
    const label = handle || caption || 'MENES';
    const sub = handle && caption && caption !== handle ? caption : '';
    const href = (g.postUrl || '').trim();
    const img = (g.image || '').trim();
    const displayLabel = currentLang === 'en' && /^client\s+menes$/i.test(label) ? 'MENES customer' : label;
    const media = img
      ? `<img src="${img}" alt="${esc(displayLabel)}" loading="lazy">`
      : `<div class="gallery-placeholder gallery-ig-ph"><span>${esc(handle || '@instagram')}</span><small>${currentLang === 'en' ? 'View post' : 'Voir le post'}</small></div>`;
    const cap = (handle || caption)
      ? `<div class="gallery-caption">
        <span class="gallery-handle">${esc(handle || (currentLang === 'en' && /^client\s+menes$/i.test(caption) ? 'MENES customer' : caption))}</span>
        ${sub ? `<span class="gallery-sub">${esc(sub)}</span>` : ''}
      </div>`
      : '';
    const inner = `${media}${cap}`;
    return href
      ? `<a class="gallery-item" href="${esc(href)}" target="_blank" rel="noopener">${inner}</a>`
      : `<div class="gallery-item">${inner}</div>`;
  }).join('');
}

function renderEmailCapture(s, sec) {
  const e = s.emailCapture || {};
  toggle('emailCapture', sec.emailCapture !== false && e.title);
  if (sec.emailCapture === false || !e.title) return;
  document.getElementById('emailTitle').textContent = e.title;
  document.getElementById('emailSubtitle').textContent = e.subtitle || '';
  document.getElementById('emailInput').placeholder = e.placeholder || t('email_ph');
  document.getElementById('emailBtn').textContent = e.button || (currentLang === 'en' ? 'Sign me up' : "M'inscrire");
}

/* ---------- Reviews ---------- */
let reviewDraftRating = 5;
let reviewPrefillProductId = '';

function getApprovedReviews() {
  return (storeData?.reviews || []).filter((r) => r && r.status === 'approved');
}

function reviewsForProduct(productId) {
  if (!productId) return [];
  return getApprovedReviews().filter((r) => r.productId === productId);
}

function reviewStats(list) {
  const reviews = Array.isArray(list) ? list : getApprovedReviews();
  const count = reviews.length;
  if (!count) return { count: 0, avg: 0 };
  const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
  return { count, avg: Math.round((sum / count) * 10) / 10 };
}

function starsHtml(rating, opts = {}) {
  const full = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  const cls = opts.className ? ` ${opts.className}` : '';
  let html = `<span class="stars${cls}" aria-label="${full}/5">`;
  for (let i = 1; i <= 5; i += 1) {
    html += `<span class="${i <= full ? 'star-full' : 'star-empty'}">★</span>`;
  }
  html += '</span>';
  return html;
}

function renderReviewsSection(sec) {
  const section = document.getElementById('reviews');
  if (!section) return;
  const show = sec.reviews !== false;
  toggle('reviews', show);
  if (!show) return;

  const reviews = getApprovedReviews();
  const stats = reviewStats(reviews);
  const summary = document.getElementById('reviewsSummary');
  const grid = document.getElementById('reviewsGrid');
  const empty = document.getElementById('reviewsEmpty');
  const writeBtn = document.getElementById('reviewsWriteBtn');

  if (writeBtn) writeBtn.textContent = t('reviews_write');

  if (!reviews.length) {
    if (summary) summary.innerHTML = '';
    if (grid) grid.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }

  empty?.classList.add('hidden');
  if (summary) {
    summary.innerHTML = `
      <div class="reviews-summary-score">${stats.avg.toFixed(1)}</div>
      <div class="reviews-summary-meta">
        ${starsHtml(stats.avg)}
        <p>${t('reviews_based').replace('{n}', String(stats.count))}</p>
      </div>`;
  }

  const sorted = [...reviews].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  if (grid) {
    grid.innerHTML = sorted.slice(0, 12).map((r) => `
      <article class="review-card reveal">
        <div class="review-card-top">
          ${starsHtml(r.rating)}
          <span class="review-card-product">${esc(r.productName || '')}</span>
        </div>
        ${r.title ? `<h3>${esc(r.title)}</h3>` : ''}
        <p>${esc(r.body || '')}</p>
        <div class="review-card-author"><strong>${esc(r.authorName || '')}</strong></div>
      </article>`).join('');
    observeRevealNodes([...grid.querySelectorAll('.review-card')]);
  }
}

function renderPdpReviews(productId) {
  const el = document.getElementById('pdpReviews');
  if (!el) return;
  const list = reviewsForProduct(productId);
  const stats = reviewStats(list);
  if (!list.length) {
    el.innerHTML = `
      <div class="pdp-reviews-head">
        <span class="pdp-reviews-score">${t('reviews_empty')}</span>
        <button type="button" class="pdp-reviews-write" data-review-product="${esc(productId)}">${t('reviews_write_product')}</button>
      </div>`;
    el.querySelector('.pdp-reviews-write')?.addEventListener('click', () => openReviewModal(productId));
    return;
  }
  const top = [...list].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 3);
  el.innerHTML = `
    <div class="pdp-reviews-head">
      <div class="pdp-reviews-score">
        <strong>${stats.avg.toFixed(1)}</strong>
        ${starsHtml(stats.avg)}
        <span>${t('reviews_count').replace('{n}', String(stats.count))}</span>
      </div>
      <button type="button" class="pdp-reviews-write" data-review-product="${esc(productId)}">${t('reviews_write_product')}</button>
    </div>
    <div class="pdp-reviews-list">
      ${top.map((r) => `
        <div class="pdp-review-item">
          ${starsHtml(r.rating)}
          ${r.title ? `<strong>${esc(r.title)}</strong>` : ''}
          <p>${esc(r.body || '')}</p>
          <div class="pdp-review-author">${esc(r.authorName || '')}</div>
        </div>`).join('')}
    </div>`;
  el.querySelector('.pdp-reviews-write')?.addEventListener('click', () => openReviewModal(productId));
}

function setReviewStars(rating) {
  reviewDraftRating = Math.max(1, Math.min(5, Number(rating) || 5));
  const input = document.getElementById('reviewRating');
  if (input) input.value = String(reviewDraftRating);
  document.querySelectorAll('#reviewStarInput .star-btn').forEach((btn) => {
    const n = Number(btn.dataset.star);
    btn.classList.toggle('active', n <= reviewDraftRating);
  });
}

function openReviewModal(productId = '') {
  const modal = document.getElementById('reviewModal');
  const select = document.getElementById('reviewProduct');
  if (!modal || !select) return;

  const products = (storeData?.products || []).filter((p) => p.active !== false);
  if (!products.length) {
    showToast(t('reviews_no_product'));
    return;
  }

  const preferred = productId || reviewPrefillProductId || activePdpId || '';
  select.innerHTML = products.map((p) => `
    <option value="${esc(p.id)}" ${p.id === preferred ? 'selected' : ''}>${esc(p.name)}</option>
  `).join('');
  if (preferred && !products.some((p) => p.id === preferred) && products[0]) {
    select.value = products[0].id;
  }

  document.getElementById('reviewModalTitle').textContent = t('reviews_modal_title');
  const sub = modal.querySelector('.review-modal-sub');
  if (sub) sub.textContent = t('reviews_modal_sub');
  document.getElementById('reviewSubmitBtn').textContent = t('reviews_submit');
  setReviewStars(5);
  modal.classList.remove('hidden');
  document.getElementById('successModal')?.classList.add('hidden');
}

function closeReviewModal() {
  document.getElementById('reviewModal')?.classList.add('hidden');
}

async function submitReviewForm(e) {
  e.preventDefault();
  if (document.getElementById('reviewHoney')?.value) return;

  const productId = document.getElementById('reviewProduct')?.value;
  const authorName = document.getElementById('reviewName')?.value.trim();
  const authorEmail = document.getElementById('reviewEmail')?.value.trim();
  const title = document.getElementById('reviewTitle')?.value.trim();
  const body = document.getElementById('reviewBody')?.value.trim();
  const rating = Number(document.getElementById('reviewRating')?.value) || reviewDraftRating;
  const btn = document.getElementById('reviewSubmitBtn');
  if (!productId || !authorName || !body || rating < 1) return;

  const oldText = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    const res = await fetch(shopApi('/api/reviews'), {
      method: 'POST',
      headers: shopHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
      body: JSON.stringify({
        productId,
        authorName,
        authorEmail,
        title,
        body,
        rating,
        locale: currentLang,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'review failed');
    showToast(data.message || t('reviews_thanks'));
    document.getElementById('reviewForm')?.reset();
    setReviewStars(5);
    closeReviewModal();
  } catch (err) {
    showToast(err?.message || t('reviews_error'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldText || t('reviews_submit'); }
  }
}

function setupReviewsUI() {
  document.getElementById('reviewsWriteBtn')?.addEventListener('click', () => openReviewModal());
  document.getElementById('reviewModalClose')?.addEventListener('click', closeReviewModal);
  document.getElementById('reviewModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'reviewModal') closeReviewModal();
  });
  document.getElementById('reviewForm')?.addEventListener('submit', submitReviewForm);
  document.querySelectorAll('#reviewStarInput .star-btn').forEach((btn) => {
    btn.addEventListener('click', () => setReviewStars(btn.dataset.star));
  });
  document.getElementById('successReviewBtn')?.addEventListener('click', () => {
    openReviewModal(reviewPrefillProductId || '');
  });

  const params = new URLSearchParams(location.search);
  if (params.get('review') === '1') {
    const pid = params.get('product') || '';
    reviewPrefillProductId = pid;
    setTimeout(() => openReviewModal(pid), 500);
    const clean = new URL(location.href);
    clean.searchParams.delete('review');
    clean.searchParams.delete('product');
    history.replaceState({}, '', clean.pathname + (clean.search || '') + clean.hash);
  }
}

function renderFilters() {
  const products = (storeData?.products || []).filter((p) => p.active);
  const categories = new Set(products.map((p) => p.category));
  const bar = document.getElementById('filtersBar');
  if (!bar) return;

  const dynamicCats = (storeData?.collections || []).filter((c) => c.active !== false).map((c) => c.id);
  const knownCats = dynamicCats.length ? dynamicCats : ['vetements', 'grillz', 'accessoires'];
  const cats = ['all', ...knownCats.filter((c) => categories.has(c))];
  bar.innerHTML = cats.map((cat) => {
    const col = (storeData?.collections || []).find((c) => c.id === cat);
    const label = cat === 'all' ? CATEGORY_LABELS_GET('all') : (col?.name || CATEGORY_LABELS_GET(cat));
    return `<button class="filter ${cat === currentFilter ? 'active' : ''}" data-cat="${cat}">${esc(label)}</button>`;
  }).join('')
    + `<button class="filter filter-wishlist ${currentFilter === 'wishlist' ? 'active' : ''}" data-cat="wishlist">${esc(t('wishlist'))}<span id="filterWishlistCount" class="filter-wishlist-count ${wishlist.length ? '' : 'hidden'}">${wishlist.length}</span></button>`;

  bar.querySelectorAll('.filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      bar.querySelectorAll('.filter').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.cat;
      renderProducts();
    });
  });

  if (!cats.includes(currentFilter) && currentFilter !== 'wishlist') currentFilter = 'all';
}

function productSearchHaystack(p) {
  const catLabel = CATEGORY_LABELS_GET(p.category) || p.category || '';
  return [p.name, p.description, catLabel, p.category].filter(Boolean).join(' ').toLowerCase();
}

function productHasSize(p, size) {
  if (!size) return true;
  const target = String(size).toLowerCase();
  const fromSizes = (p.sizes || []).map((s) => String(s).toLowerCase());
  if (fromSizes.includes(target)) return true;
  const opts = productOptions(p);
  return opts.some((o) => {
    if (!/taille|size/i.test(o.name || '')) return false;
    return (o.values || []).some((v) => String(v).toLowerCase() === target);
  });
}

function collectAvailableSizes() {
  const set = new Set();
  (storeData?.products || []).filter((p) => p.active).forEach((p) => {
    (p.sizes || []).forEach((s) => set.add(String(s)));
    productOptions(p).forEach((o) => {
      if (/taille|size/i.test(o.name || '')) (o.values || []).forEach((v) => set.add(String(v)));
    });
  });
  return [...set];
}

function getVisibleProducts() {
  const q = searchQuery.trim().toLowerCase();
  let products = (storeData?.products || []).filter((p) => {
    if (!p.active) return false;
    if (currentFilter === 'wishlist') return isWishlisted(p.id);
    if (currentFilter !== 'all' && p.category !== currentFilter) return false;
    if (q && !productSearchHaystack(p).includes(q)) return false;
    if (sizeFilter && !productHasSize(p, sizeFilter)) return false;
    return true;
  });

  if (currentSort === 'price-asc') {
    products.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
  } else if (currentSort === 'price-desc') {
    products.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
  } else {
    products.sort((a, b) => {
      const fa = a.featured ? 0 : 1;
      const fb = b.featured ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return (a.name || '').localeCompare(b.name || '', currentLang === 'en' ? 'en' : 'fr');
    });
  }
  return products;
}

function syncDiscoveryLabels() {
  const searchInput = document.getElementById('productSearch');
  if (searchInput) searchInput.placeholder = t('search_placeholder');
  const sortSelect = document.getElementById('productSort');
  if (sortSelect) {
    sortSelect.querySelectorAll('option').forEach((opt) => {
      const key = opt.dataset.i18n;
      if (key) opt.textContent = t(key);
    });
  }
  const sizeSelect = document.getElementById('productSizeFilter');
  const sizeLabel = document.getElementById('productSizeLabel');
  if (sizeLabel) sizeLabel.textContent = t('size_filter');
  if (sizeSelect) {
    const sizes = collectAvailableSizes();
    const prev = sizeFilter;
    sizeSelect.innerHTML = `<option value="">${esc(t('size_all'))}</option>`
      + sizes.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    sizeFilter = sizes.includes(prev) ? prev : '';
    sizeSelect.value = sizeFilter;
  }
}

function setupDiscoveryControls() {
  const searchInput = document.getElementById('productSearch');
  const sortSelect = document.getElementById('productSort');
  const sizeSelect = document.getElementById('productSizeFilter');
  if (!searchInput || !sortSelect) return;

  syncDiscoveryLabels();
  searchInput.value = searchQuery;
  sortSelect.value = currentSort;
  if (sizeSelect) sizeSelect.value = sizeFilter;

  if (!searchInput.dataset.wired) {
    searchInput.dataset.wired = '1';
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        searchQuery = searchInput.value;
        renderProducts();
      }, 150);
    });
    searchInput.addEventListener('search', () => {
      clearTimeout(searchDebounceTimer);
      searchQuery = searchInput.value;
      renderProducts();
    });
  }

  if (!sortSelect.dataset.wired) {
    sortSelect.dataset.wired = '1';
    sortSelect.addEventListener('change', () => {
      currentSort = sortSelect.value;
      renderProducts();
    });
  }

  if (sizeSelect && !sizeSelect.dataset.wired) {
    sizeSelect.dataset.wired = '1';
    sizeSelect.addEventListener('change', () => {
      sizeFilter = sizeSelect.value;
      renderProducts();
    });
  }
}

function getRecommendations(product, limit = 3) {
  const others = (storeData?.products || []).filter((p) => p.active && p.id !== product.id);
  const score = (p) => {
    let s = 0;
    if (p.category !== product.category) s += 2;
    if (p.featured) s += 1;
    return s;
  };
  return [...others].sort((a, b) => score(b) - score(a) || (a.name || '').localeCompare(b.name || '')).slice(0, limit);
}

function navigateToProduct(id) {
  const pdpOpen = !document.getElementById('pdpPanel')?.classList.contains('hidden');
  if (pdpOpen) {
    openPdp(id);
    return;
  }
  const visible = getVisibleProducts().some((p) => p.id === id);
  const card = document.querySelector(`.product-card[data-id="${CSS.escape(id)}"]`);
  if (visible && card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('product-card-highlight');
    card.focus({ preventScroll: true });
    setTimeout(() => card.classList.remove('product-card-highlight'), 1800);
    return;
  }
  openPdp(id);
}

function getCartProductIds() {
  return new Set(cart.map((c) => c.id));
}

function getCartUpsells(limit = 3) {
  const inCart = getCartProductIds();
  const cats = new Set(cart.map((c) => storeData.products.find((p) => p.id === c.id)?.category).filter(Boolean));
  const others = (storeData?.products || []).filter((p) => p.active && !inCart.has(p.id));
  const score = (p) => {
    let s = 0;
    if (!cats.has(p.category)) s += 3;
    if (p.featured) s += 2;
    if (p.stock > 0 && p.stock <= 5) s += 1;
    return s;
  };
  return [...others].sort((a, b) => score(b) - score(a) || (Number(a.price) || 0) - (Number(b.price) || 0)).slice(0, limit);
}

function findShippingUnlockProduct() {
  const subtotal = cartSubtotal();
  const threshold = shippingThreshold();
  const need = threshold - subtotal;
  if (!(need > 0) || !cart.length) return null;
  const inCart = getCartProductIds();
  const candidates = (storeData?.products || [])
    .filter((p) => p.active && !inCart.has(p.id) && Number(p.price) >= need)
    .sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
  return candidates[0] || null;
}

let pendingUpsellId = null;
const UPSELL_SESSION = 'menes_upsell_shown';

function showUpsellModal(excludeId) {
  if (sessionStorage.getItem(UPSELL_SESSION) === '1') return;
  const seed = storeData?.products?.find((p) => p.id === excludeId) || storeData?.products?.[0];
  if (!seed) return;
  const recs = getRecommendations(seed, 1).filter((p) => !getCartProductIds().has(p.id));
  const product = recs[0] || getCartUpsells(1)[0];
  if (!product) return;
  pendingUpsellId = product.id;
  sessionStorage.setItem(UPSELL_SESSION, '1');
  const box = document.getElementById('upsellProduct');
  const imgs = productImages(product);
  const thumb = imgs[0]?.url || '';
  if (box) {
    box.innerHTML = `
      <div class="upsell-card">
        <div class="upsell-img">${thumb ? `<img src="${esc(thumb)}" alt="">` : '<span>◆</span>'}</div>
        <div>
          <strong>${esc(product.name)}</strong>
          <p>${product.price}$ CAD</p>
        </div>
      </div>`;
  }
  document.getElementById('upsellModal')?.classList.remove('hidden');
  syncScrollLock();
}

function closeUpsellModal() {
  document.getElementById('upsellModal')?.classList.add('hidden');
  pendingUpsellId = null;
  syncScrollLock();
}

function quickAddProduct(id) {
  const product = (storeData?.products || []).find((p) => p.id === id);
  if (!product) return;
  const existing = cart.find((c) => c.id === id && (c.variantStr || c.size) === 'Unique');
  if (existing) existing.qty++;
  else {
    cart.push({
      id,
      name: product.name,
      price: product.price,
      variant: {},
      variantStr: 'Unique',
      size: 'Unique',
      qty: 1,
      preorder: !!product.preorder,
      preorderNote: product.preorder ? (product.preorderNote || '') : '',
    });
  }
  persistCart();
  updateCartUI({ forceList: true });
  showToast(t('added'));
}

function renderCartUpsells() {
  const wrap = document.getElementById('cartUpsells');
  const list = document.getElementById('cartUpsellsList');
  const unlock = document.getElementById('cartShipUnlock');
  if (!wrap || !list) return;

  if (!cart.length) {
    wrap.classList.add('hidden');
    list.innerHTML = '';
    if (unlock) { unlock.classList.add('hidden'); unlock.innerHTML = ''; }
    return;
  }

  const shipProd = findShippingUnlockProduct();
  if (unlock) {
    if (shipProd) {
      unlock.classList.remove('hidden');
      unlock.innerHTML = `
        <p>${esc(tFill('upsell_ship_unlock', { name: shipProd.name, price: Number(shipProd.price).toFixed(0) }))}</p>
        <button type="button" class="btn-outline-sm" data-unlock-id="${esc(shipProd.id)}">${esc(t('upsell_ship_cta'))}</button>`;
      unlock.querySelector('button')?.addEventListener('click', () => {
        quickAddProduct(shipProd.id);
      });
    } else {
      unlock.classList.add('hidden');
      unlock.innerHTML = '';
    }
  }

  const recs = getCartUpsells(3).filter((p) => !shipProd || p.id !== shipProd.id);
  if (!recs.length) {
    wrap.classList.add('hidden');
    list.innerHTML = '';
    return;
  }
  wrap.classList.remove('hidden');
  const title = wrap.querySelector('.cart-upsells-title');
  if (title) title.textContent = t('upsell_cart_title');
  list.innerHTML = recs.map((p) => {
    const thumb = productImages(p)[0]?.url || '';
    return `<div class="cart-upsell-row">
      <button type="button" class="cart-upsell-info" data-open="${esc(p.id)}">
        <span class="cart-upsell-thumb">${thumb ? `<img src="${esc(thumb)}" alt="">` : '◆'}</span>
        <span><strong>${esc(p.name)}</strong><small>${p.price}$ CAD</small></span>
      </button>
      <button type="button" class="btn-outline-sm" data-add="${esc(p.id)}">${esc(t('upsell_quick_add'))}</button>
    </div>`;
  }).join('');
  list.querySelectorAll('[data-add]').forEach((btn) => btn.addEventListener('click', () => quickAddProduct(btn.dataset.add)));
  list.querySelectorAll('[data-open]').forEach((btn) => btn.addEventListener('click', () => openPdp(btn.dataset.open)));
}

function renderPdpRecommendations(product) {
  const wrap = document.getElementById('pdpRecs');
  const list = document.getElementById('pdpRecsList');
  const lookBtn = document.getElementById('pdpAddLookBtn');
  if (!wrap || !list) return;
  const recs = getRecommendations(product);
  if (!recs.length) {
    wrap.classList.add('hidden');
    list.innerHTML = '';
    lookBtn?.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');
  if (lookBtn) {
    lookBtn.classList.remove('hidden');
    lookBtn.textContent = t('upsell_add_look');
    lookBtn.onclick = () => {
      addFromPdp();
      quickAddProduct(recs[0].id);
      showToast(t('added'));
    };
  }
  list.innerHTML = recs.map((p) => {
    const imgs = productImages(p);
    const thumb = imgs[0]?.url || '';
    const cat = CATEGORY_LABELS_GET(p.category) || p.category || '';
    return `
      <div class="pdp-rec-card-wrap">
        <button type="button" class="pdp-rec-card" data-id="${esc(p.id)}" aria-label="${esc(p.name)}">
          <span class="pdp-rec-img">${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy">` : '<span class="placeholder">◆</span>'}</span>
          <span class="pdp-rec-meta">
            <span class="pdp-rec-cat">${esc(cat)}</span>
            <span class="pdp-rec-name">${esc(p.name)}</span>
            <span class="pdp-rec-price">${p.price}$ CAD</span>
          </span>
        </button>
        <button type="button" class="btn-outline-sm pdp-rec-add" data-add="${esc(p.id)}">${esc(t('upsell_quick_add'))}</button>
      </div>`;
  }).join('');
  list.querySelectorAll('.pdp-rec-card').forEach((btn) => {
    btn.addEventListener('click', () => navigateToProduct(btn.dataset.id));
  });
  list.querySelectorAll('.pdp-rec-add').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      quickAddProduct(btn.dataset.add);
    });
  });
}

function toggle(id, show) {
  document.getElementById(id).classList.toggle('hidden', !show);
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function productImages(p) {
  if (Array.isArray(p.images) && p.images.length) {
    return p.images.map((im) => (typeof im === 'string' ? { url: im, label: '' } : im)).filter((im) => im && im.url);
  }
  if (p.image) return [{ url: p.image, label: '' }];
  return [];
}

function productOptions(p) {
  if (Array.isArray(p.options) && p.options.length) {
    return p.options.filter((o) => o && o.name && Array.isArray(o.values) && o.values.length);
  }
  if (Array.isArray(p.sizes) && p.sizes.length) {
    return [{ name: currentLang === 'en' ? 'Size' : 'Taille', values: p.sizes }];
  }
  return [];
}

function variantKeyFromMap(optsMap) {
  return Object.keys(optsMap || {}).sort().map((k) => `${k}=${optsMap[k]}`).join('|');
}

function readSelectedVariant(card) {
  const variant = {};
  if (!card) return variant;
  card.querySelectorAll('.product-option').forEach((opt) => {
    const active = opt.querySelector('.opt-chip.active:not(.is-oos)');
    const fallback = opt.querySelector('.opt-chip.active') || opt.querySelector('.opt-chip:not(.is-oos)');
    const chip = active || fallback;
    if (chip) variant[opt.dataset.name] = chip.dataset.value;
  });
  return variant;
}

function findProductVariant(product, variantMap) {
  const list = Array.isArray(product?.variants) ? product.variants : [];
  if (!list.length) return null;
  const key = variantKeyFromMap(variantMap);
  return list.find((v) => (v.key || variantKeyFromMap(v.options || {})) === key)
    || list.find((v) => {
      const opts = v.options || {};
      return Object.keys(variantMap).every((k) => opts[k] === variantMap[k]);
    })
    || null;
}

/** Available units for a selection. null = unlimited / not tracked per variant */
function availableStockFor(product, variantMap) {
  if (!product) return 0;
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length) {
    const hit = findProductVariant(product, variantMap);
    if (!hit) return 0;
    return Math.max(0, Number(hit.stock) || 0);
  }
  // Legacy product-level stock: 0 often means "not set" in this catalog — treat as unlimited
  const s = Number(product.stock);
  if (!Number.isFinite(s) || s <= 0) return Infinity;
  return s;
}

function stockForOptionValue(product, optionName, value, partialVariant = {}) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (!variants.length) return Infinity;
  // Sum stock of all variants that include this option value (given other selections when possible)
  return variants
    .filter((v) => {
      const opts = v.options || {};
      if (opts[optionName] !== value) return false;
      return Object.keys(partialVariant).every((k) => {
        if (k === optionName) return true;
        return !partialVariant[k] || opts[k] === partialVariant[k];
      });
    })
    .reduce((s, v) => s + (Number(v.stock) || 0), 0);
}

function applyVariantStockUi(root, product) {
  if (!root || !product) return;
  const partial = readSelectedVariant(root);
  const opts = productOptions(product);
  opts.forEach((o) => {
    const wrap = [...root.querySelectorAll('.product-option')].find((el) => el.dataset.name === o.name);
    if (!wrap) return;
    wrap.querySelectorAll('.opt-chip').forEach((chip) => {
      const val = chip.dataset.value;
      const left = stockForOptionValue(product, o.name, val, partial);
      const oos = left <= 0;
      chip.classList.toggle('is-oos', oos);
      chip.disabled = oos;
      chip.setAttribute('aria-disabled', oos ? 'true' : 'false');
      if (oos) {
        chip.title = t('sold_out');
        if (!chip.querySelector('.oos-tag')) {
          const tag = document.createElement('span');
          tag.className = 'oos-tag';
          tag.textContent = t('sold_out');
          chip.appendChild(tag);
        }
      } else {
        chip.title = '';
        chip.querySelector('.oos-tag')?.remove();
      }
    });
    // If active chip is OOS, switch to first available
    const active = wrap.querySelector('.opt-chip.active');
    if (active?.classList.contains('is-oos')) {
      const next = wrap.querySelector('.opt-chip:not(.is-oos)');
      active.classList.remove('active');
      active.setAttribute('aria-pressed', 'false');
      if (next) {
        next.classList.add('active');
        next.setAttribute('aria-pressed', 'true');
      }
    }
  });

  const variant = readSelectedVariant(root);
  const left = availableStockFor(product, variant);
  const addBtn = root.querySelector('.add-btn, #pdpAddBtn');
  if (addBtn) {
    const blocked = Number.isFinite(left) && left <= 0;
    addBtn.disabled = blocked;
    if (blocked) addBtn.textContent = t('sold_out');
    else addBtn.textContent = product.preorder ? t('preorder_btn') : t('add_to_cart');
  }
}

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  const products = getVisibleProducts();

  if (!products.length) {
    grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:#888;padding:60px 0">${currentFilter === 'wishlist' ? t('wishlist_empty') : (searchQuery.trim() ? t('no_results') : t('coming'))}</p>`;
    return;
  }

  grid.innerHTML = products.map((p) => {
    const hasStockBadge = p.stock > 0 && p.stock <= 5;
    const stockBadge = hasStockBadge
      ? `<span class="stock-badge">${t('only_left')} ${p.stock}</span>`
      : '';
    const wishlisted = isWishlisted(p.id);
    const imgs = productImages(p);
    const main = imgs[0]?.url || '';
    const opts = productOptions(p);
    const pStats = reviewStats(reviewsForProduct(p.id));
    const ratingHtml = pStats.count
      ? `<div class="product-rating">${starsHtml(pStats.avg)}<span>${pStats.avg.toFixed(1)} · ${t('reviews_count').replace('{n}', String(pStats.count))}</span></div>`
      : '';

    const thumbs = imgs.length > 1
      ? `<div class="product-thumbs">${imgs.map((im, i) => `
          <button type="button" class="pg-thumb ${i === 0 ? 'active' : ''}" data-url="${esc(im.url)}" data-label="${esc(im.label || '')}" aria-label="${esc(im.label || p.name)}">
            <img src="${esc(im.url)}" alt="" loading="lazy">
          </button>`).join('')}</div>`
      : '';

    const optionsHtml = opts.map((o, oi) => `
      <div class="product-option" data-opt="${oi}" data-name="${esc(o.name)}">
        <span class="opt-name">${esc(o.name)}</span>
        <div class="opt-values">
          ${o.values.map((v, vi) => `<button type="button" class="opt-chip ${vi === 0 ? 'active' : ''}" data-value="${esc(v)}" aria-pressed="${vi === 0 ? 'true' : 'false'}">${esc(v)}</button>`).join('')}
        </div>
      </div>`).join('');

    const addLabel = p.preorder ? t('preorder_btn') : t('add_to_cart');
    const preBadge = p.preorder
      ? `<span class="product-badge preorder-badge">${esc(t('badge_preorder'))}</span>`
      : '';
    const preNote = p.preorder
      ? `<p class="product-preorder-note">${esc(p.preorderNote || t('preorder_note_default'))}</p>`
      : '';

    return `
    <article class="product-card${hasStockBadge ? ' has-stock-badge' : ''}${p.preorder ? ' is-preorder' : ''}" data-id="${esc(p.id)}" tabindex="0" aria-label="${esc(p.name)}">
      ${p.featured ? `<span class="product-badge">${esc(t('badge_featured'))}</span>` : ''}
      ${preBadge}
      ${stockBadge}
      <button type="button" class="wishlist-btn${wishlisted ? ' active' : ''}" data-id="${esc(p.id)}" aria-label="${esc(wishlisted ? t('wishlist_remove') : t('wishlist_add'))}">${wishlisted ? '&#9829;' : '&#9825;'}</button>
      <button type="button" class="product-img product-img-btn" aria-label="${esc(p.name)} · ${esc(t('view_product'))}">
        ${main ? `<img class="pg-main" src="${esc(main)}" alt="${esc(p.name)}" loading="lazy">` : '<span class="placeholder">◆</span>'}
      </button>
      ${thumbs}
      <div class="product-body">
        <button type="button" class="product-title-btn">${esc(p.name)}</button>
        <p>${esc(p.description)}</p>
        ${ratingHtml}
        ${preNote}
        <div class="product-price">
          ${p.comparePrice > p.price ? `<span class="price-old">${p.comparePrice}$</span>` : ''}
          <span class="price-now">${p.price}$ CAD</span>
          ${p.comparePrice > p.price ? `<span class="price-save">-${Math.round((1 - p.price / p.comparePrice) * 100)}%</span>` : ''}
        </div>
        ${optionsHtml}
        <button type="button" class="add-btn">${addLabel}</button>
      </div>
    </article>`;
  }).join('');

  grid.querySelectorAll('.product-card').forEach(wireProductCard);
  observeRevealNodes([...grid.querySelectorAll('.product-card')]);
}

function wireProductCard(card) {
  const main = card.querySelector('.pg-main');
  const thumbs = [...card.querySelectorAll('.pg-thumb')];
  const productId = card.dataset.id;
  const product = storeData.products.find((p) => p.id === productId);

  const activateThumbByUrl = (url) => {
    thumbs.forEach((tb) => tb.classList.toggle('active', tb.dataset.url === url));
  };

  thumbs.forEach((tb) => tb.addEventListener('click', (e) => {
    e.stopPropagation();
    if (main) main.src = tb.dataset.url;
    activateThumbByUrl(tb.dataset.url);
  }));

  card.querySelectorAll('.product-option').forEach((opt) => {
    opt.querySelectorAll('.opt-chip').forEach((chip) => chip.addEventListener('click', (e) => {
      e.stopPropagation();
      if (chip.classList.contains('is-oos') || chip.disabled) return;
      opt.querySelectorAll('.opt-chip').forEach((c) => {
        c.classList.remove('active');
        c.setAttribute('aria-pressed', 'false');
      });
      chip.classList.add('active');
      chip.setAttribute('aria-pressed', 'true');
      const val = (chip.dataset.value || '').toLowerCase();
      const match = thumbs.find((tb) => tb.dataset.label && tb.dataset.label.toLowerCase() === val);
      if (match && main) { main.src = match.dataset.url; activateThumbByUrl(match.dataset.url); }
      applyVariantStockUi(card, product);
    }));
  });

  applyVariantStockUi(card, product);

  card.querySelector('.add-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    addToCart(productId, card);
  });

  card.querySelector('.wishlist-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleWishlist(productId);
    if (currentFilter === 'wishlist' && !isWishlisted(productId)) renderProducts();
  });

  const openCardPdp = () => openPdp(productId);
  card.querySelector('.product-img-btn')?.addEventListener('click', openCardPdp);
  card.querySelector('.product-title-btn')?.addEventListener('click', openCardPdp);

  card.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest('.add-btn, .opt-chip, .pg-thumb, .wishlist-btn, .product-img-btn, .product-title-btn')) return;
    e.preventDefault();
    openCardPdp();
  });
}

function openPdp(id) {
  const product = storeData.products.find((p) => p.id === id);
  if (!product) return;
  activePdpId = id;
  const imgs = productImages(product);
  const main = imgs[0]?.url || '';
  const opts = productOptions(product);
  document.getElementById('pdpName').textContent = product.name;
  document.getElementById('pdpCat').textContent = [
    CATEGORY_LABELS_GET(product.category) || product.category || '',
    product.preorder ? t('badge_preorder') : '',
  ].filter(Boolean).join(' · ');
  document.getElementById('pdpDesc').textContent = product.description || '';
  let pdpExtra = document.getElementById('pdpPreorderNote');
  if (!pdpExtra) {
    pdpExtra = document.createElement('p');
    pdpExtra.id = 'pdpPreorderNote';
    pdpExtra.className = 'product-preorder-note';
    document.getElementById('pdpDesc')?.after(pdpExtra);
  }
  if (product.preorder) {
    pdpExtra.textContent = product.preorderNote || t('preorder_note_default');
    pdpExtra.classList.remove('hidden');
  } else {
    pdpExtra.textContent = '';
    pdpExtra.classList.add('hidden');
  }
  document.getElementById('pdpPrice').innerHTML = `
    ${product.comparePrice > product.price ? `<span class="price-old">${product.comparePrice}$</span>` : ''}
    <span class="price-now">${product.price}$ CAD</span>
    ${product.comparePrice > product.price ? `<span class="price-save">-${Math.round((1 - product.price / product.comparePrice) * 100)}%</span>` : ''}
  `;
  const imgEl = document.getElementById('pdpMainImg');
  const videoEl = document.getElementById('pdpVideo');
  if (product.videoUrl && videoEl) {
    videoEl.src = product.videoUrl;
    videoEl.classList.remove('hidden');
    if (imgEl) imgEl.classList.add('hidden');
  } else {
    if (videoEl) {
      videoEl.removeAttribute('src');
      videoEl.classList.add('hidden');
      videoEl.load?.();
    }
    if (main) { imgEl.src = main; imgEl.classList.remove('hidden'); }
    else { imgEl.removeAttribute('src'); imgEl.classList.add('hidden'); }
  }
  document.getElementById('pdpThumbs').innerHTML = imgs.map((im, i) => `
    <button type="button" class="${i === 0 && !product.videoUrl ? 'active' : ''}" data-url="${esc(im.url)}">
      <img src="${esc(im.url)}" alt="">
    </button>`).join('')
    + (product.videoUrl ? `<button type="button" class="active" data-video="${esc(product.videoUrl)}">Video</button>` : '');
  document.getElementById('pdpThumbs').querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('pdpThumbs').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
      if (btn.dataset.video && videoEl) {
        videoEl.src = btn.dataset.video;
        videoEl.classList.remove('hidden');
        imgEl.classList.add('hidden');
      } else {
        if (videoEl) { videoEl.classList.add('hidden'); }
        imgEl.src = btn.dataset.url;
        imgEl.classList.remove('hidden');
      }
    });
  });
  document.getElementById('pdpOptions').innerHTML = opts.map((o, oi) => `
    <div class="product-option" data-opt="${oi}" data-name="${esc(o.name)}">
      <span class="opt-name">${esc(o.name)}</span>
      <div class="opt-values">
        ${o.values.map((v, vi) => `<button type="button" class="opt-chip ${vi === 0 ? 'active' : ''}" data-value="${esc(v)}">${esc(v)}</button>`).join('')}
      </div>
    </div>`).join('');
  document.getElementById('pdpOptions').querySelectorAll('.product-option').forEach((opt) => {
    opt.querySelectorAll('.opt-chip').forEach((chip) => chip.addEventListener('click', () => {
      if (chip.classList.contains('is-oos') || chip.disabled) return;
      opt.querySelectorAll('.opt-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      applyVariantStockUi(document.getElementById('pdpPanel'), product);
      renderPdpUrgency(product);
    }));
  });
  document.getElementById('pdpAddBtn').textContent = product.preorder ? t('preorder_btn') : t('add_to_cart');
  document.getElementById('pdpSizeGuideBtn').textContent = t('size_guide');
  applyVariantStockUi(document.getElementById('pdpPanel'), product);
  renderPdpUrgency(product);
  renderPdpReviews(product.id);
  renderPdpRecommendations(product);
  document.getElementById('pdpPanel').classList.remove('hidden');
  document.getElementById('pdpOverlay').classList.remove('hidden');
  document.getElementById('pdpPanel').setAttribute('aria-hidden', 'false');
  showStickyAtc(product, main);
  syncScrollLock();
}

function closePdp() {
  document.getElementById('pdpPanel')?.classList.add('hidden');
  document.getElementById('pdpOverlay')?.classList.add('hidden');
  document.getElementById('pdpPanel')?.setAttribute('aria-hidden', 'true');
  document.getElementById('stickyAtc')?.classList.add('hidden');
  document.getElementById('pdpRecs')?.classList.add('hidden');
  document.getElementById('pdpRecsList')?.replaceChildren();
  const pdpReviews = document.getElementById('pdpReviews');
  if (pdpReviews) pdpReviews.innerHTML = '';
  const videoEl = document.getElementById('pdpVideo');
  if (videoEl) {
    videoEl.pause?.();
    videoEl.removeAttribute('src');
    videoEl.classList.add('hidden');
  }
  activePdpId = null;
  syncScrollLock();
}

function showStickyAtc(product, img) {
  const bar = document.getElementById('stickyAtc');
  if (!bar || !product) return;
  document.getElementById('stickyAtcName').textContent = product.name;
  document.getElementById('stickyAtcPrice').textContent = `${product.price}$ CAD`;
  const imgEl = document.getElementById('stickyAtcImg');
  if (img) { imgEl.src = img; imgEl.classList.remove('hidden'); }
  else imgEl.classList.add('hidden');
  bar.classList.remove('hidden');
}

function addFromPdp() {
  const panel = document.getElementById('pdpPanel');
  if (!activePdpId || !panel) return;
  addToCart(activePdpId, panel);
}

function openSizeGuide() {
  const body = document.getElementById('sizeGuideBody');
  const title = document.getElementById('sizeGuideTitle');
  if (!body) return;
  title.textContent = t('size_guide');
  const fr = currentLang !== 'en';
  body.innerHTML = fr
    ? `<p>Choisis ta taille selon ces repères. Pour les grillz, mesure ta dentition ou écris-nous sur Instagram pour un fit sur mesure.</p>
       <table><thead><tr><th>Taille</th><th>Poitrine</th><th>Longueur</th></tr></thead>
       <tbody>
         <tr><td>S</td><td>96 à 101 cm</td><td>68 cm</td></tr>
         <tr><td>M</td><td>102 à 107 cm</td><td>70 cm</td></tr>
         <tr><td>L</td><td>108 à 113 cm</td><td>72 cm</td></tr>
         <tr><td>XL</td><td>114 à 121 cm</td><td>74 cm</td></tr>
         <tr><td>XXL</td><td>122 à 129 cm</td><td>76 cm</td></tr>
       </tbody></table>
       <p style="margin-top:14px">Grillz : envoie une photo / moulage via Instagram pour validation avant production.</p>`
    : `<p>Use these fit notes. For grillz, measure your teeth or message us on Instagram for a custom fit.</p>
       <table><thead><tr><th>Size</th><th>Chest</th><th>Length</th></tr></thead>
       <tbody>
         <tr><td>S</td><td>96 à 101 cm</td><td>68 cm</td></tr>
         <tr><td>M</td><td>102 à 107 cm</td><td>70 cm</td></tr>
         <tr><td>L</td><td>108 à 113 cm</td><td>72 cm</td></tr>
         <tr><td>XL</td><td>114 à 121 cm</td><td>74 cm</td></tr>
         <tr><td>XXL</td><td>122 à 129 cm</td><td>76 cm</td></tr>
       </tbody></table>
       <p style="margin-top:14px">Grillz: send a photo / mold via Instagram before production.</p>`;
  document.getElementById('sizeGuideModal').classList.remove('hidden');
}

window.addToCart = (id, card) => {
  const product = storeData.products.find((p) => p.id === id);
  if (!product) return;

  const variant = readSelectedVariant(card);
  const variantStr = Object.values(variant).join(' / ') || 'Unique';
  const left = availableStockFor(product, variant);
  if (Number.isFinite(left) && left <= 0) {
    showToast(t('sold_out_variant'));
    return;
  }

  const existing = cart.find((c) => c.id === id && (c.variantStr || c.size) === variantStr);
  const nextQty = (existing?.qty || 0) + 1;
  if (Number.isFinite(left) && nextQty > left) {
    showToast(tFill('stock_limit', { n: left }));
    return;
  }

  if (existing) existing.qty = nextQty;
  else {
    cart.push({
      id,
      name: product.name,
      price: product.price,
      variant,
      variantStr,
      size: variantStr,
      qty: 1,
      preorder: !!product.preorder,
      preorderNote: product.preorder ? (product.preorderNote || '') : '',
    });
  }
  if (existing && product.preorder) {
    existing.preorder = true;
    existing.preorderNote = product.preorderNote || existing.preorderNote || '';
  }
  persistCart();
  updateCartUI({ forceList: true });
  showToast(t('added'));
  setTimeout(() => {
    if (!isOverlayOpen() || !document.getElementById('cartPanel')?.classList.contains('hidden')) {
      showUpsellModal(id);
      syncScrollLock();
    }
  }, 450);
};

function cartLineKey(c) {
  return `${c.id}::${c.variantStr || c.size || 'Unique'}`;
}

function changeCartQty(index, delta) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= cart.length) return;
  const line = cart[i];
  const product = (storeData?.products || []).find((p) => p.id === line.id);
  const variant = line.variant || {};
  const left = availableStockFor(product, variant);
  const next = Math.max(0, (Number(line.qty) || 0) + delta);
  if (delta > 0 && Number.isFinite(left) && next > left) {
    showToast(tFill('stock_limit', { n: left }));
    return;
  }
  const removed = next <= 0;
  line.qty = next;
  if (removed) cart.splice(i, 1);
  persistCart();
  if (removed) updateCartUI({ forceList: true });
  else updateCartUI({ patchIndex: i });
  if (document.getElementById('checkoutModal') && !document.getElementById('checkoutModal')?.classList.contains('hidden')) {
    renderCheckoutSummary();
  }
}

function removeCartItem(index) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= cart.length) return;
  cart.splice(i, 1);
  persistCart();
  updateCartUI({ forceList: true });
  if (document.getElementById('checkoutModal') && !document.getElementById('checkoutModal')?.classList.contains('hidden')) {
    renderCheckoutSummary();
  }
}

let cartPersistTimer = null;
function persistCart() {
  clearTimeout(cartPersistTimer);
  cartPersistTimer = setTimeout(() => {
    try { localStorage.setItem('menes_cart', JSON.stringify(cart)); } catch {}
  }, 120);
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

let cartDelegated = false;
function ensureCartDelegation() {
  if (cartDelegated) return;
  const box = document.getElementById('cartItems');
  if (!box) return;
  cartDelegated = true;
  box.addEventListener('click', (e) => {
    const dec = e.target.closest('[data-cart-dec]');
    if (dec) { e.preventDefault(); changeCartQty(dec.dataset.cartDec, -1); return; }
    const inc = e.target.closest('[data-cart-inc]');
    if (inc) { e.preventDefault(); changeCartQty(inc.dataset.cartInc, 1); return; }
    const rem = e.target.closest('[data-cart-remove]');
    if (rem) { e.preventDefault(); removeCartItem(rem.dataset.cartRemove); }
  });
}

function updateCartTotalsOnly() {
  const count = cart.reduce((s, c) => s + c.qty, 0);
  const { subtotal, discount } = currentTotals();
  const shown = Math.max(0, subtotal - (discount?.amount || 0));
  const countEl = document.getElementById('cartCount');
  const totalEl = document.getElementById('cartTotal');
  if (countEl) countEl.textContent = count;
  if (totalEl) totalEl.textContent = `${shown.toFixed(2)}$`;
  renderShippingBar();
}

function updateCartUI(opts = {}) {
  ensureCartDelegation();
  updateCartTotalsOnly();
  const box = document.getElementById('cartItems');
  if (!box) return;

  // Fast path: qty change only — patch one row
  if (Number.isInteger(opts.patchIndex) && !opts.forceList && cart.length) {
    const i = opts.patchIndex;
    const row = box.querySelector(`[data-cart-i="${i}"]`);
    const c = cart[i];
    if (row && c) {
      const qtyEl = row.querySelector('.cart-qty-val');
      const priceEl = row.querySelector('.cart-item-price');
      if (qtyEl) qtyEl.textContent = c.qty;
      if (priceEl) priceEl.textContent = `${(c.price * c.qty).toFixed(2)}$`;
      renderCartUpsells();
      return;
    }
  }

  if (!cart.length) {
    box.innerHTML = `<p style="color:#888;padding:40px 0;text-align:center">${t('cart_empty')}</p>`;
  } else {
    box.innerHTML = cart.map((c, i) => {
      const v = c.variantStr || c.size;
      const line = (c.price * c.qty).toFixed(2);
      return `<div class="cart-item" data-cart-i="${i}">
        <div class="cart-item-info">
          <strong class="cart-item-name">${esc(c.name)}</strong>
          ${v && v !== 'Unique' ? `<span class="cart-item-variant">${esc(v)}</span>` : ''}
          ${c.preorder ? `<span class="cart-preorder-tag">${esc(t('preorder_cart'))}${c.preorderNote ? ` · ${esc(c.preorderNote)}` : ` · ${esc(t('preorder_note_default'))}`}</span>` : ''}
          <div class="cart-item-controls">
            <button type="button" class="cart-qty-btn" data-cart-dec="${i}" aria-label="${esc(t('cart_qty_dec'))}">−</button>
            <span class="cart-qty-val">${c.qty}</span>
            <button type="button" class="cart-qty-btn" data-cart-inc="${i}" aria-label="${esc(t('cart_qty_inc'))}">+</button>
            <button type="button" class="cart-remove-btn" data-cart-remove="${i}">${esc(t('cart_remove'))}</button>
          </div>
        </div>
        <span class="cart-item-price">${line}$</span>
      </div>`;
    }).join('');
  }
  renderCartUpsells();
}

function currentTotals() {
  const subtotal = cartSubtotal();
  const discountInfo = getActiveDiscount();
  const discount = computeDiscount(subtotal, discountInfo);
  const taxable = Math.max(0, subtotal - discount.amount);
  const country = document.getElementById('checkoutCountry')?.value || 'CA';
  const province = document.getElementById('checkoutProvince')?.value || '';
  const tax = computeTax(country, province, taxable);
  return { subtotal, discount, tax, total: taxable + tax.amount };
}

function renderCheckoutSummary() {
  const box = document.getElementById('checkoutSummary');
  if (!box) return;
  const { subtotal, discount, tax, total } = currentTotals();
  const country = document.getElementById('checkoutCountry')?.value || 'CA';
  const taxRow = tax.amount > 0
    ? `<div class="sum-row"><span>${t('taxes')} · ${esc(tax.label)}</span><span>${tax.amount.toFixed(2)}$</span></div>`
    : (country !== 'CA' ? `<div class="sum-row muted"><span>${t('taxes')}</span><span>${t('tax_intl')}</span></div>` : '');
  const discRow = discount.amount > 0
    ? `<div class="sum-row sum-discount"><span>${t('discount')} · ${esc(discount.code)}</span><span>−${discount.amount.toFixed(2)}$</span></div>`
    : '';
  box.innerHTML = `
    <div class="sum-title">${t('sum_title')}</div>
    <div class="sum-items">${cart.map((c) => {
      const v = c.variantStr || c.size;
      const pre = c.preorder
        ? ` <em class="sum-preorder">(${esc(t('preorder_cart'))}${c.preorderNote ? `: ${esc(c.preorderNote)}` : ''})</em>`
        : '';
      return `<div class="sum-row"><span>${esc(c.name)}${v && v !== 'Unique' ? ` · ${esc(v)}` : ''}${pre} ×${c.qty}</span><span>${(c.price * c.qty).toFixed(2)}$</span></div>`;
    }).join('')}</div>
    <div class="sum-row"><span>${t('subtotal')}</span><span>${subtotal.toFixed(2)}$</span></div>
    ${discRow}
    ${taxRow}
    <div class="sum-row"><span>${t('shipping')}</span><span>${t('free')}</span></div>
    <div class="sum-row sum-total"><span>${t('grand_total')}</span><span>${total.toFixed(2)}$ CAD</span></div>`;
}

function getCheckoutCustomer(form) {
  const country = form.get('country') || 'CA';
  const province = form.get('province') || '';
  const address = form.get('address') || '';
  const city = form.get('city') || '';
  const postal = form.get('postal') || '';
  const parts = [address, city, `${province} ${postal}`.trim(), country].filter(Boolean);
  return {
    name: form.get('name'),
    email: form.get('email'),
    phone: form.get('phone'),
    country, province, city, postal,
    address: parts.join(', '),
    addressLine: address,
  };
}

function syncPromoField() {
  const input = document.getElementById('promoCodeInput');
  if (input && appliedPromoCode) input.value = appliedPromoCode;
  const msg = document.getElementById('promoMsg');
  if (!msg) return;
  if (!appliedPromoCode) {
    msg.textContent = t('promo_vip');
    msg.className = 'promo-msg hint';
    return;
  }
  const d = findDiscount(appliedPromoCode);
  if (!d) {
    msg.textContent = t('promo_bad');
    msg.className = 'promo-msg err';
    return;
  }
  if (!discountEligible(d, cartSubtotal())) {
    const min = Number(d.minCart) || 0;
    msg.textContent = tFill('promo_min', { amount: min.toFixed(2) });
    msg.className = 'promo-msg err';
    return;
  }
  msg.textContent = `${t('promo_ok')}: ${appliedPromoCode}`;
  msg.className = 'promo-msg ok';
}

let revealObserver = null;

function observeRevealNodes(nodes) {
  if (!nodes.length) return;
  nodes.forEach((el) => el.classList.add('reveal'));
  if (!('IntersectionObserver' in window)) {
    nodes.forEach((el) => el.classList.add('is-in'));
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          revealObserver.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
  }
  nodes.forEach((el) => revealObserver.observe(el));
}

function setupReveal() {
  const nodes = document.querySelectorAll('.reveal, .why-card, .section-head');
  observeRevealNodes([...nodes]);
  document.querySelector('.hero-inner')?.classList.add('is-in');
}

function initCustomCursor() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const mq = window.matchMedia('(hover: hover) and (min-width: 900px)');
  const dot = document.getElementById('menesCursorDot');
  const ring = document.getElementById('menesCursorRing');
  if (!dot || !ring || !mq.matches) return;

  document.body.classList.add('has-custom-cursor');
  let mx = 0;
  let my = 0;
  let rx = 0;
  let ry = 0;
  let ringRaf = null;
  const hoverSel = 'a, button, .product-card, .hero-cta';

  const tickRing = () => {
    rx += (mx - rx) * 0.14;
    ry += (my - ry) * 0.14;
    ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    if (Math.abs(mx - rx) > 0.4 || Math.abs(my - ry) > 0.4) {
      ringRaf = requestAnimationFrame(tickRing);
    } else {
      ringRaf = null;
    }
  };

  document.addEventListener('mousemove', (e) => {
    mx = e.clientX;
    my = e.clientY;
    const hover = !!e.target.closest(hoverSel);
    if (hover !== document.body.classList.contains('cursor-hover')) {
      document.body.classList.toggle('cursor-hover', hover);
    }
    const dotScale = hover ? 1.45 : 1;
    dot.style.transform = `translate3d(${mx}px, ${my}px, 0) scale(${dotScale})`;
    if (!ringRaf) ringRaf = requestAnimationFrame(tickRing);
  }, { passive: true });

  mq.addEventListener('change', (ev) => {
    if (!ev.matches) {
      document.body.classList.remove('has-custom-cursor', 'cursor-hover');
      dot.style.transform = '';
      ring.style.transform = '';
    }
  });
}

function populateProvinces() {
  const country = document.getElementById('checkoutCountry')?.value || 'CA';
  const sel = document.getElementById('checkoutProvince');
  if (!sel) return;
  let opts = [];
  if (country === 'CA') {
    opts = CA_PROVINCES.map(([v, fr, en]) => [v, currentLang === 'en' ? (en || fr) : fr]);
  } else if (country === 'US') opts = US_STATES.map((s) => [s, s]);
  else opts = [['', '-']];
  sel.innerHTML = opts.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join('');
}

function saveCheckoutDraft(customer) {
  const { subtotal, discount, tax, total } = currentTotals();
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
    orderId: Date.now().toString(36).toUpperCase(),
    customer,
    items: [...cart],
    subtotal,
    discount,
    tax,
    total,
    promoCode: discount.code || '',
  }));
}

/* ---------- Address autocomplete (OpenStreetMap / Photon, gratuit) ---------- */
const PHOTON_STATE_TO_CODE = {
  quebec: 'QC', québec: 'QC', ontario: 'ON', 'british columbia': 'BC', 'colombie-britannique': 'BC',
  alberta: 'AB', manitoba: 'MB', saskatchewan: 'SK', 'new brunswick': 'NB', 'nouveau-brunswick': 'NB',
  'nova scotia': 'NS', 'nouvelle-écosse': 'NS', 'prince edward island': 'PE', 'newfoundland and labrador': 'NL',
  'northwest territories': 'NT', yukon: 'YT', nunavut: 'NU',
};

let addrTimer = null;
function setupAddressAutocomplete() {
  const input = document.getElementById('checkoutAddress');
  const box = document.getElementById('addrSuggestions');
  if (!input || !box) return;

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearTimeout(addrTimer);
    if (q.length < 4) { box.classList.add('hidden'); return; }
    addrTimer = setTimeout(async () => {
      try {
        const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lang=fr`);
        const data = await res.json();
        const feats = (data.features || []).filter((f) => f.properties?.name || f.properties?.street);
        if (!feats.length) { box.classList.add('hidden'); return; }
        box.innerHTML = feats.map((f, i) => {
          const p = f.properties;
          const line = [p.housenumber, p.street || p.name].filter(Boolean).join(' ');
          const sub = [p.city, p.state, p.country].filter(Boolean).join(', ');
          return `<button type="button" class="addr-sug" data-i="${i}"><strong>${esc(line || p.name)}</strong><small>${esc(sub)}</small></button>`;
        }).join('');
        box.classList.remove('hidden');
        box.querySelectorAll('.addr-sug').forEach((btn) => btn.addEventListener('click', () => {
          fillAddress(feats[+btn.dataset.i].properties);
          box.classList.add('hidden');
        }));
      } catch { box.classList.add('hidden'); }
    }, 350);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.addr-field')) box.classList.add('hidden');
  });
}

function fillAddress(p) {
  const line = [p.housenumber, p.street || p.name].filter(Boolean).join(' ');
  document.getElementById('checkoutAddress').value = line || p.name || '';
  document.getElementById('checkoutCity').value = p.city || p.town || p.village || '';
  const cc = (p.countrycode || '').toUpperCase();
  const countrySel = document.getElementById('checkoutCountry');
  if (cc && [...countrySel.options].some((o) => o.value === cc)) countrySel.value = cc;
  else if (cc) countrySel.value = 'OTHER';
  populateProvinces();
  const provSel = document.getElementById('checkoutProvince');
  const code = PHOTON_STATE_TO_CODE[(p.state || '').toLowerCase()];
  if (code && [...provSel.options].some((o) => o.value === code)) provSel.value = code;
  if (p.postcode) document.getElementById('checkoutPostal').value = p.postcode;
  renderCheckoutSummary();
}

/* ---------- Confetti celebration ---------- */
function celebrate() {
  const layer = document.getElementById('confetti');
  if (!layer) return;
  const colors = ['#c9a84c', '#9a7b2f', '#0a0a0a', '#ffffff', '#e0b84c'];
  for (let i = 0; i < 80; i++) {
    const p = document.createElement('span');
    p.className = 'confetti-piece';
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDelay = `${Math.random() * 0.5}s`;
    p.style.animationDuration = `${2 + Math.random() * 2}s`;
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.appendChild(p);
    setTimeout(() => p.remove(), 4200);
  }
}

function cartHasPreorder() {
  return cart.some((c) => c.preorder);
}

function successMessageWithPreorder(baseMsg) {
  if (!cartHasPreorder()) return baseMsg;
  return `${baseMsg} ${t('success_preorder')}`;
}

function showSuccess(opts = {}) {
  if (cart.length && !reviewPrefillProductId) reviewPrefillProductId = cart[0].id || '';
  document.getElementById('successTitle').textContent = opts.title || t('success_title');
  const base = opts.msg || t('success_msg');
  document.getElementById('successMsg').textContent = opts.skipPreorderHint ? base : successMessageWithPreorder(base);
  document.getElementById('successCloseBtn').textContent = t('success_close');
  const reviewBtn = document.getElementById('successReviewBtn');
  if (reviewBtn) reviewBtn.textContent = t('reviews_after_order');
  document.getElementById('successModal').classList.remove('hidden');
  syncScrollLock();
}
document.getElementById('successCloseBtn')?.addEventListener('click', () => {
  document.getElementById('successModal').classList.add('hidden');
  syncScrollLock();
});

document.getElementById('cartBtn').addEventListener('click', () => {
  document.getElementById('cartPanel').classList.remove('hidden');
  document.getElementById('cartOverlay').classList.remove('hidden');
  syncScrollLock();
});
document.getElementById('closeCart').addEventListener('click', closeCart);
document.getElementById('cartOverlay').addEventListener('click', closeCart);
function closeCart() {
  document.getElementById('cartPanel').classList.add('hidden');
  document.getElementById('cartOverlay').classList.add('hidden');
  syncScrollLock();
}

document.getElementById('checkoutBtn').addEventListener('click', () => {
  if (!cart.length) {
    showToast(t('cart_empty'));
    return;
  }
  populateProvinces();
  syncPromoField();
  renderCheckoutSummary();
  document.getElementById('checkoutModal').classList.remove('hidden');
  syncScrollLock();
});

document.getElementById('applyPromoBtn')?.addEventListener('click', () => {
  applyPromoCode(document.getElementById('promoCodeInput')?.value || '');
});
document.getElementById('promoCodeInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    applyPromoCode(e.target.value || '');
  }
});

document.getElementById('closePdp')?.addEventListener('click', closePdp);
document.getElementById('pdpOverlay')?.addEventListener('click', closePdp);
document.getElementById('pdpAddBtn')?.addEventListener('click', addFromPdp);
document.getElementById('stickyAtcBtn')?.addEventListener('click', addFromPdp);
document.getElementById('pdpSizeGuideBtn')?.addEventListener('click', openSizeGuide);
document.getElementById('closeSizeGuide')?.addEventListener('click', () => {
  document.getElementById('sizeGuideModal')?.classList.add('hidden');
});
document.getElementById('sizeGuideModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'sizeGuideModal') e.currentTarget.classList.add('hidden');
});

document.getElementById('checkoutCountry')?.addEventListener('change', () => {
  populateProvinces();
  renderCheckoutSummary();
});
document.getElementById('checkoutProvince')?.addEventListener('change', renderCheckoutSummary);
setupAddressAutocomplete();
populateProvinces();
document.getElementById('cancelCheckout').addEventListener('click', () => {
  document.getElementById('checkoutModal').classList.add('hidden');
  syncScrollLock();
});

document.querySelectorAll('.pay-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pay-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('payMethod').value = btn.dataset.method;
    const labels = { stripe: 'Payer par carte (Stripe)', crypto: 'Payer en crypto' };
    document.getElementById('paySubmitBtn').textContent = labels[btn.dataset.method] || 'Payer';
  });
});

document.getElementById('altPayBtn').addEventListener('click', () => {
  const form = document.getElementById('checkoutForm');
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  if (!cart.length) {
    showToast(t('cart_empty'));
    return;
  }
  saveCheckoutDraft(getCheckoutCustomer(new FormData(form)));
  window.location.href = '/paiement.html';
});

document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const method = form.get('method') || 'square';
  if (!cart.length) {
    showToast(currentLang === 'en' ? 'Your cart is empty' : 'Panier vide');
    return;
  }
  const customer = getCheckoutCustomer(form);
  const { tax } = currentTotals();
  const attribution = getAmbassadorAttribution();
  const order = {
    id: `M${Date.now().toString(36).toUpperCase()}`,
    customer,
    items: cart.map((c) => ({
      id: c.id,
      productId: c.id,
      name: c.name,
      qty: c.qty,
      size: c.size || c.variantStr,
      variantStr: c.variantStr || c.size,
      variant: c.variant || {},
      preorder: !!c.preorder,
      preorderNote: c.preorderNote || '',
    })),
    discountCode: appliedPromoCode || '',
    attribution: attribution || undefined,
    ambassadorId: attribution?.ambassadorId || undefined,
    tax,
    status: 'pending',
    date: new Date().toISOString(),
  };

  const btn = document.getElementById('paySubmitBtn');
  const note = document.getElementById('checkoutNote');
  note.textContent = '';
  note.className = 'checkout-note';
  btn.disabled = true;
  btn.textContent = currentLang === 'en' ? 'Secure redirect…' : 'Redirection sécurisée…';

  try {
    const res = await fetch(shopApi('/api/pay'), {
      method: 'POST',
      headers: shopHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ order, method }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.checkoutUrl) {
      reviewPrefillProductId = order.items?.[0]?.id || '';
      window.location.href = data.checkoutUrl;
      return;
    }
    if (method === 'crypto' && !data.checkoutUrl) {
      // Manual wallets fallback only if Coinbase not configured
      document.getElementById('checkoutModal').classList.add('hidden');
      syncScrollLock();
      showCryptoPayment({ ...order, total: data.total || currentTotals().total }, data.total || currentTotals().total);
      btn.disabled = false;
      btn.textContent = currentLang === 'en' ? 'Pay' : 'Payer';
      return;
    }
    note.textContent = data.error || (currentLang === 'en' ? 'Payment unavailable. Try again.' : 'Paiement indisponible. Réessayez.');
    note.className = 'checkout-note error';
  } catch {
    note.textContent = currentLang === 'en' ? 'Connection error. Try again.' : 'Erreur de connexion. Réessayez.';
    note.className = 'checkout-note error';
  }
  btn.disabled = false;
  btn.textContent = currentLang === 'en' ? 'Pay by card' : 'Payer par carte';
});

document.getElementById('emailForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (document.getElementById('emailHoney')?.value) return;
  const email = document.getElementById('emailInput').value.trim();
  if (!email) return;
  const btn = document.getElementById('emailBtn');
  const ok = await submitVipEmail(email, btn, 'email-capture');
  if (ok) document.getElementById('emailInput').value = '';
  if (btn) btn.textContent = siteCopy().emailCapture?.button || t('vip_overlay_btn') || (currentLang === 'en' ? 'Sign me up' : "M'inscrire");
});

const DEFAULT_CRYPTO = [
  { label: 'Bitcoin', symbol: 'BTC', network: 'Bitcoin', address: '' },
  { label: 'Ethereum', symbol: 'ETH', network: 'ERC-20', address: '' },
  { label: 'USDT', symbol: 'USDT', network: 'TRC-20', address: '' },
];

function getWallets() {
  const list = storeData?.site?.crypto?.length ? storeData.site.crypto : DEFAULT_CRYPTO;
  return list.filter((w) => w.address && w.address.trim());
}

function notifyOrder() { /* merchant notify is server-side only */ }

async function confirmPaidOrderFromUrl(params) {
  const orderId = params.get('order') || '';
  const method = params.get('method') || 'square';
  if (!orderId) {
    showSuccess({
      msg: currentLang === 'en'
        ? 'If payment completed, check your provider receipt email. We confirm orders in our console shortly.'
        : 'Si le paiement est complété, consultez le reçu du prestataire. Nous confirmons la commande sous peu.',
    });
    return { ok: false };
  }
  try {
    for (let i = 0; i < 4; i++) {
      const res = await fetch(shopApi('/api/confirm-order'), {
        method: 'POST',
        headers: shopHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ orderId, method }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.missing) {
        await new Promise((r) => setTimeout(r, 900));
        continue;
      }
      if (data.ok && data.verified) {
        showSuccess({
          msg: currentLang === 'en'
            ? 'Payment confirmed. A confirmation email is on its way.'
            : 'Paiement confirmé. Un courriel de confirmation est en route.',
        });
        return data;
      }
      showSuccess({
        title: currentLang === 'en' ? 'Payment received — confirming' : 'Paiement reçu — confirmation en cours',
        msg: data.message || (currentLang === 'en'
          ? 'We are confirming your payment with the provider. You will receive an email shortly.'
          : 'Nous confirmons votre paiement auprès du prestataire. Vous recevrez un courriel sous peu.'),
      });
      return data;
    }
  } catch {}
  showSuccess({
    msg: currentLang === 'en'
      ? 'Thank you. If payment went through, confirmation will follow by email.'
      : 'Merci. Si le paiement est passé, la confirmation suivra par courriel.',
  });
  return { ok: false };
}

const CRYPTO_PAY_WINDOW = 15 * 60; // 15 minutes en secondes

// Correspondance symbole → identifiant CoinGecko pour la conversion
const COINGECKO_IDS = {
  BTC: 'bitcoin', ETH: 'ethereum', USDT: 'tether', USDC: 'usd-coin',
  SOL: 'solana', LTC: 'litecoin', BCH: 'bitcoin-cash', DOGE: 'dogecoin',
  XRP: 'ripple', BNB: 'binancecoin', MATIC: 'matic-network', TRX: 'tron',
  ADA: 'cardano', DAI: 'dai',
};

// Nombre de décimales affichées selon la crypto
const CRYPTO_DECIMALS = { BTC: 8, ETH: 6, LTC: 6, BCH: 6, SOL: 4, DOGE: 2, XRP: 4 };

let cryptoTimerInterval = null;
let cryptoState = null;

async function fetchCryptoRates(symbols) {
  const ids = [...new Set(symbols.map((s) => COINGECKO_IDS[s.toUpperCase()]).filter(Boolean))];
  if (!ids.length) return {};
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=cad`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

function cryptoAmountFor(symbol, rates, totalCad) {
  const id = COINGECKO_IDS[symbol.toUpperCase()];
  const price = id && rates[id]?.cad;
  if (!price) return null;
  const decimals = CRYPTO_DECIMALS[symbol.toUpperCase()] ?? 6;
  return (totalCad / price).toFixed(decimals);
}

function buildPaymentUri(wallet, amount) {
  const sym = wallet.symbol.toUpperCase();
  const net = (wallet.network || '').toLowerCase();
  if (sym === 'BTC' && net.includes('bitcoin')) {
    return `bitcoin:${wallet.address}${amount ? `?amount=${amount}` : ''}`;
  }
  if (sym === 'LTC') return `litecoin:${wallet.address}${amount ? `?amount=${amount}` : ''}`;
  if (sym === 'ETH' && net.includes('erc')) return `ethereum:${wallet.address}`;
  return wallet.address;
}

function qrUrl(data) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=6&data=${encodeURIComponent(data)}`;
}

function stopCryptoTimer() {
  if (cryptoTimerInterval) { clearInterval(cryptoTimerInterval); cryptoTimerInterval = null; }
}

function startCryptoTimer() {
  stopCryptoTimer();
  const deadline = Date.now() + CRYPTO_PAY_WINDOW * 1000;
  const clock = document.getElementById('cryptoClock');
  const fill = document.getElementById('cryptoTimerFill');

  const tick = () => {
    const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    const m = String(Math.floor(remaining / 60)).padStart(2, '0');
    const s = String(remaining % 60).padStart(2, '0');
    clock.textContent = `${m}:${s}`;
    fill.style.width = `${(remaining / CRYPTO_PAY_WINDOW) * 100}%`;
    clock.classList.toggle('crypto-urgent', remaining <= 120);
    if (remaining <= 0) {
      stopCryptoTimer();
      document.getElementById('cryptoTimer').classList.add('hidden');
      document.getElementById('cryptoBody').classList.add('hidden');
      document.getElementById('cryptoExpired').classList.remove('hidden');
    }
  };
  tick();
  cryptoTimerInterval = setInterval(tick, 1000);
}

function renderCryptoPanel(symbol) {
  const { wallets, rates, total } = cryptoState;
  const wallet = wallets.find((w) => w.symbol.toUpperCase() === symbol.toUpperCase()) || wallets[0];
  const amount = cryptoAmountFor(wallet.symbol, rates, total);
  const uri = buildPaymentUri(wallet, amount);
  const panel = document.getElementById('cryptoPanel');

  const amountBlock = amount
    ? `<div class="crypto-send">
         <span class="crypto-send-label">Envoie exactement</span>
         <div class="crypto-send-amount">
           <strong id="cryptoSendValue">${amount}</strong> <span>${esc(wallet.symbol)}</span>
           <button type="button" class="crypto-copy-amount" data-amount="${amount}" title="Copier le montant">⧉</button>
         </div>
         <span class="crypto-rate">≈ ${total.toFixed(2)}$ CAD · taux en direct</span>
       </div>`
    : `<div class="crypto-send crypto-send-manual">
         <span class="crypto-send-label">Montant à envoyer</span>
         <div class="crypto-send-amount"><strong>${total.toFixed(2)}$ CAD</strong></div>
         <span class="crypto-rate">Convertis ce montant en ${esc(wallet.symbol)} avant d'envoyer (taux indisponible)</span>
       </div>`;

  panel.innerHTML = `
    ${amountBlock}
    <div class="crypto-qr"><img src="${qrUrl(uri)}" alt="QR ${esc(wallet.symbol)}" width="200" height="200" loading="lazy"></div>
    <div class="crypto-net-warn">Réseau : <strong>${esc(wallet.network)}</strong>. Envoie seulement du ${esc(wallet.symbol)} sur ce réseau.</div>
    <div class="crypto-addr-row">
      <code class="crypto-addr">${esc(wallet.address)}</code>
      <button type="button" class="crypto-copy" data-addr="${esc(wallet.address)}">Copier</button>
    </div>`;

  panel.querySelectorAll('.crypto-copy, .crypto-copy-amount').forEach((b) => {
    b.addEventListener('click', () => {
      const value = b.dataset.addr || b.dataset.amount;
      navigator.clipboard.writeText(value).then(() => {
        const old = b.textContent;
        b.textContent = 'Copié ✓';
        setTimeout(() => { b.textContent = old; }, 1500);
      });
    });
  });

  document.querySelectorAll('#cryptoTabs .crypto-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.sym.toUpperCase() === wallet.symbol.toUpperCase());
  });
}

async function showCryptoPayment(order, total) {
  const wallets = getWallets();
  document.getElementById('cryptoOrderId').textContent = `#${order.id}`;
  document.getElementById('cryptoAmount').textContent = `${total.toFixed(2)}$ CAD`;

  const modal = document.getElementById('cryptoModal');
  const tabs = document.getElementById('cryptoTabs');
  const panel = document.getElementById('cryptoPanel');

  document.getElementById('cryptoExpired').classList.add('hidden');
  document.getElementById('cryptoBody').classList.remove('hidden');
  document.getElementById('cryptoTimer').classList.remove('hidden');
  modal.classList.remove('hidden');
  syncScrollLock();

  if (!wallets.length) {
    document.getElementById('cryptoTimer').classList.add('hidden');
    tabs.innerHTML = '';
    const ig = storeData?.site?.instagram || 'https://www.instagram.com/menes_jewelry';
    panel.innerHTML = `<p class="crypto-empty">Contacte-nous sur <a href="${ig}" target="_blank" rel="noopener">Instagram</a> ou par email pour recevoir l'adresse de paiement crypto. Ta commande #${order.id} est enregistrée.</p>`;
    return;
  }

  panel.innerHTML = '<p class="crypto-loading">Calcul du taux de change en direct…</p>';
  tabs.innerHTML = wallets.map((w, i) => `<button type="button" class="crypto-tab${i === 0 ? ' active' : ''}" data-sym="${esc(w.symbol)}">${esc(w.symbol)}</button>`).join('');

  const rates = await fetchCryptoRates(wallets.map((w) => w.symbol));
  cryptoState = { order, total, wallets, rates };

  tabs.querySelectorAll('.crypto-tab').forEach((t) => {
    t.addEventListener('click', () => renderCryptoPanel(t.dataset.sym));
  });

  renderCryptoPanel(wallets[0].symbol);
  startCryptoTimer();
}

document.getElementById('cryptoPaidBtn').addEventListener('click', () => {
  stopCryptoTimer();
  if (cart.length) reviewPrefillProductId = cart[0].id || '';
  cart = []; localStorage.removeItem('menes_cart'); updateCartUI({ forceList: true });
  document.getElementById('cryptoModal').classList.add('hidden');
  syncScrollLock();
  closeCart();
  showSuccess({
    title: currentLang === 'en' ? 'Transfer submitted' : 'Transfert soumis',
    msg: currentLang === 'en'
      ? 'We will confirm your crypto payment once it appears on-chain, then email you.'
      : 'Nous confirmerons votre paiement crypto dès réception on-chain, puis vous enverrons un courriel.',
  });
});
document.getElementById('cryptoRestartBtn')?.addEventListener('click', () => {
  if (cryptoState?.order) showCryptoPayment(cryptoState.order, cryptoState.total);
});
document.getElementById('cryptoCloseBtn').addEventListener('click', () => {
  stopCryptoTimer();
  document.getElementById('cryptoModal').classList.add('hidden');
  syncScrollLock();
});

async function init() {
  initCustomCursor();
  await captureAmbassadorRef();
  await refreshStore();
  updateCartUI();
  updateWishlistUI();
  setupPurchaseTicker();
  setupVipOverlay();
  setupReviewsUI();
  document.getElementById('langToggle')?.addEventListener('click', () => {
    setVisitorLang(currentLang === 'en' ? 'fr' : 'en');
  });
  document.getElementById('upsellClose')?.addEventListener('click', closeUpsellModal);
  document.getElementById('upsellSkipBtn')?.addEventListener('click', closeUpsellModal);
  document.getElementById('upsellAddBtn')?.addEventListener('click', () => {
    if (pendingUpsellId) quickAddProduct(pendingUpsellId);
    closeUpsellModal();
  });
  document.getElementById('upsellModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'upsellModal') closeUpsellModal();
  });
  document.getElementById('wishlistNavBtn')?.addEventListener('click', () => {
    currentFilter = 'wishlist';
    document.querySelectorAll('#filtersBar .filter').forEach((b) => b.classList.toggle('active', b.dataset.cat === 'wishlist'));
    document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
    renderProducts();
  });
  const params = new URLSearchParams(location.search);
  if (params.get('paid') === '1') {
    cart = []; localStorage.removeItem('menes_cart'); sessionStorage.removeItem(DRAFT_KEY);
    updateCartUI();
    const paidParams = new URLSearchParams(location.search);
    history.replaceState({}, '', location.pathname);
    await confirmPaidOrderFromUrl(paidParams);
  }
}

window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY && e.newValue) { storeData = JSON.parse(e.newValue); renderSite(); renderFilters(); renderProducts(); }
});
// Soft polling — skip when tab hidden; avoid full re-render if unchanged
setInterval(() => refreshStore(), 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshStore();
});
init();
