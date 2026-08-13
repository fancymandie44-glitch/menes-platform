const STORAGE_KEY = 'menes_store_data';
const DRAFT_KEY = 'menes_checkout_draft';
const API = '/api/store';

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
let cart = JSON.parse(localStorage.getItem('menes_cart') || '[]');
let currentFilter = 'all';

let currentLang = 'fr';

const CATEGORY_LABELS_I18N = {
  fr: { all: 'Tout', vetements: 'Vêtements', grillz: 'Grillz', accessoires: 'Accessoires' },
  en: { all: 'All', vetements: 'Clothing', grillz: 'Grillz', accessoires: 'Accessories' },
};

const I18N = {
  fr: {
    nav_shop: 'Boutique', nav_community: 'Communauté', nav_why: 'Pourquoi nous', nav_faq: 'FAQ', nav_contact: 'Contact',
    cart: 'Panier', hero_cta: 'Voir la collection', label_collection: 'Collection', label_boutique: 'Boutique',
    label_community: 'Communauté', label_questions: 'Questions', label_why: 'Pourquoi nous', label_contact: 'Contact',
    contact_sub: 'Une question? On répond sous 24h.', foot_ssl: '🔒 SSL Sécurisé', foot_pay: '💳 Paiement chiffré',
    foot_pci: '✓ PCI-DSS Compliant', foot_shipping: 'Livraison', foot_returns: 'Retours & échanges', foot_privacy: 'Confidentialité',
    foot_rights: 'Tous droits réservés', cart_title: 'Panier', cart_secure: '🔒 Paiement 100% sécurisé',
    cart_total: 'Total :', cart_checkout: 'Commander — Paiement sécurisé', cart_empty: 'Panier vide',
    checkout_title: 'Finaliser la commande', checkout_secure: '🔒 Connexion chiffrée SSL · Données protégées',
    f_name: 'Nom complet', f_email: 'Courriel', f_phone: 'Téléphone', f_address: 'Adresse de livraison',
    pay_label: 'Mode de paiement :', pay_card: 'Carte', pay_crypto: 'Crypto', pay_submit: 'Payer par carte — Sécurisé',
    alt_pay: 'Besoin de Klarna ou PayPal?', alt_pay_btn: 'Continuer avec Klarna / PayPal →', cancel: 'Annuler',
    add_to_cart: 'Ajouter au panier', only_left: 'Plus que', added: '✓ Ajouté au panier', sig: 'Signature',
    coming: 'Collection bientôt disponible — suivez-nous sur Instagram!',
    f_country: 'Pays', f_city: 'Ville', f_province: 'Province / État', f_postal: 'Code postal',
    sum_title: 'Récapitulatif', subtotal: 'Sous-total', taxes: 'Taxes', shipping: 'Livraison', free: 'Gratuite',
    grand_total: 'Total', tax_intl: 'Taxes selon la destination',
    success_title: 'Merci pour ta commande! 🎉', success_msg: 'Ta commande est confirmée. Tu vas recevoir un courriel avec les détails. On prépare ton colis avec soin.',
    success_close: 'Continuer mes achats',
    nav_ambassador: 'Ambassadeur',
    amb_label: 'Programme ambassadeur',
    amb_title: 'Deviens ambassadeur MENES',
    amb_sub: "Génère ton lien personnel, partage-le et invite d'autres ambassadeurs à rejoindre la communauté MENES.",
    amb_name_label: 'Ton nom ou pseudo Instagram',
    amb_generate: "Générer mon lien d'invitation",
    amb_your_link: "Ton lien d'invitation",
    amb_copy: 'Copier',
    amb_copied: 'Copié ✓',
    amb_copy_fail: 'Copie bloquée — sélectionne et copie',
    amb_copy_hint: 'Astuce : le lien est sélectionné, tu peux aussi faire un copier-coller manuel.',
    amb_share: 'Partager…',
    amb_share_msg: 'Rejoins la communauté MENES avec moi 🔥 Deviens ambassadeur ici :',
    amb_share_subject: 'Rejoins MENES comme ambassadeur',
    amb_welcome: '🔥 Invité par un ambassadeur — bienvenue chez MENES !',
    amb_step1_t: '1. Génère ton lien',
    amb_step1: "Entre ton nom pour créer ton lien d'ambassadeur unique.",
    amb_step2_t: '2. Partage-le',
    amb_step2: 'Envoie-le par WhatsApp, SMS, courriel ou Instagram.',
    amb_step3_t: '3. Fais grandir MENES',
    amb_step3: 'Tes invités rejoignent la communauté et deviennent ambassadeurs à leur tour.',
  },
  en: {
    nav_shop: 'Shop', nav_community: 'Community', nav_why: 'Why us', nav_faq: 'FAQ', nav_contact: 'Contact',
    cart: 'Cart', hero_cta: 'Shop the collection', label_collection: 'Collection', label_boutique: 'Shop',
    label_community: 'Community', label_questions: 'Questions', label_why: 'Why us', label_contact: 'Contact',
    contact_sub: 'A question? We reply within 24h.', foot_ssl: '🔒 SSL Secured', foot_pay: '💳 Encrypted payment',
    foot_pci: '✓ PCI-DSS Compliant', foot_shipping: 'Shipping', foot_returns: 'Returns & exchanges', foot_privacy: 'Privacy',
    foot_rights: 'All rights reserved', cart_title: 'Cart', cart_secure: '🔒 100% secure checkout',
    cart_total: 'Total:', cart_checkout: 'Checkout — Secure payment', cart_empty: 'Empty cart',
    checkout_title: 'Complete your order', checkout_secure: '🔒 SSL encrypted connection · Protected data',
    f_name: 'Full name', f_email: 'Email', f_phone: 'Phone', f_address: 'Shipping address',
    pay_label: 'Payment method:', pay_card: 'Card', pay_crypto: 'Crypto', pay_submit: 'Pay by card — Secure',
    alt_pay: 'Need Klarna or PayPal?', alt_pay_btn: 'Continue with Klarna / PayPal →', cancel: 'Cancel',
    add_to_cart: 'Add to cart', only_left: 'Only', added: '✓ Added to cart', sig: 'Signature',
    coming: 'Collection coming soon — follow us on Instagram!',
    f_country: 'Country', f_city: 'City', f_province: 'Province / State', f_postal: 'Postal code',
    sum_title: 'Summary', subtotal: 'Subtotal', taxes: 'Taxes', shipping: 'Shipping', free: 'Free',
    grand_total: 'Total', tax_intl: 'Taxes based on destination',
    success_title: 'Thank you for your order! 🎉', success_msg: 'Your order is confirmed. You will receive an email with the details. We are preparing your parcel with care.',
    success_close: 'Continue shopping',
    nav_ambassador: 'Ambassador',
    amb_label: 'Ambassador program',
    amb_title: 'Become a MENES ambassador',
    amb_sub: 'Generate your personal link, share it and invite other ambassadors to join the MENES community.',
    amb_name_label: 'Your name or Instagram handle',
    amb_generate: 'Generate my invite link',
    amb_your_link: 'Your invite link',
    amb_copy: 'Copy',
    amb_copied: 'Copied ✓',
    amb_copy_fail: 'Copy blocked — select & copy',
    amb_copy_hint: 'Tip: the link is selected, you can also copy-paste it manually.',
    amb_share: 'Share…',
    amb_share_msg: 'Join the MENES community with me 🔥 Become an ambassador here:',
    amb_share_subject: 'Join MENES as an ambassador',
    amb_welcome: '🔥 Invited by an ambassador — welcome to MENES!',
    amb_step1_t: '1. Generate your link',
    amb_step1: 'Enter your name to create your unique ambassador link.',
    amb_step2_t: '2. Share it',
    amb_step2: 'Send it via WhatsApp, SMS, email or Instagram.',
    amb_step3_t: '3. Grow MENES',
    amb_step3: 'Your invitees join the community and become ambassadors too.',
  },
};

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
  ['QC', 'Québec'], ['ON', 'Ontario'], ['BC', 'Colombie-Britannique'], ['AB', 'Alberta'],
  ['MB', 'Manitoba'], ['SK', 'Saskatchewan'], ['NB', 'Nouveau-Brunswick'], ['NS', 'Nouvelle-Écosse'],
  ['PE', 'Île-du-Prince-Édouard'], ['NL', 'Terre-Neuve-et-Labrador'], ['NT', 'Territoires du Nord-Ouest'],
  ['YT', 'Yukon'], ['NU', 'Nunavut'],
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

function t(key) {
  return (I18N[currentLang] || I18N.fr)[key] ?? I18N.fr[key] ?? key;
}

function CATEGORY_LABELS_GET(cat) {
  const map = CATEGORY_LABELS_I18N[currentLang] || CATEGORY_LABELS_I18N.fr;
  return map[cat] || cat;
}

const FONT_OPTIONS = {
  'Bebas Neue': { google: 'Bebas+Neue', stack: "'Bebas Neue', sans-serif" },
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
  light: { bg: '#fafafa', surface: '#ffffff', text: '#0a0a0a', muted: '#555555', border: '#e0e0e0', navbg: 'rgba(250,250,250,0.95)', btnBg: '#0a0a0a', btnText: '#fafafa' },
  dark: { bg: '#0e0e0e', surface: '#181818', text: '#f2f2f2', muted: '#a8a8a8', border: '#2a2a2a', navbg: 'rgba(14,14,14,0.95)', btnBg: '', btnText: '#0a0a0a' },
};

const ASPECT_MAP = { '': '', square: '1 / 1', portrait45: '4 / 5', portrait34: '3 / 4', landscape: '16 / 9', wide: '3 / 2' };

function applyTheme() {
  const th = storeData.site?.theme || {};
  const accent = th.accent || '#c9a84c';
  const accentDark = th.accentDark || '#9a7b2f';
  const radius = th.radius != null ? th.radius : 6;
  const btnRadius = th.buttonRadius != null ? th.buttonRadius : radius;

  const mode = th.mode || 'light';
  let pal;
  if (mode === 'custom') {
    pal = {
      bg: th.bg || '#fafafa', surface: th.surface || '#ffffff', text: th.text || '#0a0a0a',
      muted: th.muted || 'rgba(128,128,128,0.9)', border: th.border || 'rgba(128,128,128,0.25)',
      navbg: th.surface || 'rgba(250,250,250,0.95)', btnBg: '', btnText: '#ffffff',
    };
  } else {
    pal = { ...(THEME_MODES[mode] || THEME_MODES.light) };
  }
  const btnBg = th.buttonBg || pal.btnBg || (mode === 'dark' ? accent : '#0a0a0a');
  const btnText = th.buttonText || pal.btnText || (mode === 'dark' ? '#0a0a0a' : '#fafafa');

  const headingFont = FONT_OPTIONS[th.headingFont]?.stack || "'Bebas Neue', sans-serif";
  const bodyFont = FONT_OPTIONS[th.bodyFont]?.stack || "'Inter', sans-serif";
  if (th.headingFont) loadGoogleFont(th.headingFont);
  if (th.bodyFont) loadGoogleFont(th.bodyFont);

  const imgH = th.productImgHeight != null ? th.productImgHeight : 320;
  const imgFit = th.productImgFit || 'cover';
  const aspect = ASPECT_MAP[th.productAspect || ''] || '';
  const gridMin = th.gridMin != null ? th.gridMin : 280;
  const heroH = th.heroHeight != null ? th.heroHeight : 85;
  const overlay = (th.heroOverlay != null ? th.heroOverlay : 55) / 100;
  const annBg = th.announceBg || '#0a0a0a';
  const annColor = th.announceColor || accent;

  const css = `
:root { --gold: ${accent}; --gold-dark: ${accentDark}; --radius: ${radius}px; }
body { background: ${pal.bg}; color: ${pal.text}; font-family: ${bodyFont}; }
.hero h1, .section-head h2, .nav-brand span, .product-price, .bundle-copy h2, .cart-header h3, .modal-box h3, .contact-section h2 { font-family: ${headingFont}; }
.nav { background: ${pal.navbg}; border-bottom-color: ${pal.border}; }
.nav-brand span, .nav-links a { color: ${pal.text}; }
.product-card, .modal-box, .cart-panel { background: ${pal.surface}; border-color: ${pal.border}; color: ${pal.text}; }
.product-body h3, .cart-item, .cart-total { color: ${pal.text}; }
.product-body p, .section-sub, .contact-sub { color: ${pal.muted}; }
.product-card select, .modal-box input, .modal-box textarea { background: ${pal.surface}; color: ${pal.text}; border-color: ${pal.border}; }
.products-grid { grid-template-columns: repeat(auto-fill, minmax(${gridMin}px, 1fr)); }
.product-img { height: ${aspect ? 'auto' : `${imgH}px`}; ${aspect ? `aspect-ratio: ${aspect};` : ''} }
.product-img img { object-fit: ${imgFit}; }
.hero { min-height: ${heroH}vh; }
.hero-bg.has-image::after { background: rgba(0,0,0,${overlay}); }
.announce { background: ${annBg}; color: ${annColor}; }
.product-card button, .btn-checkout, .cart-btn { background: ${btnBg}; color: ${btnText}; border-radius: ${btnRadius}px; }
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

function applyLanguage() {
  currentLang = storeData.site?.language === 'en' ? 'en' : 'fr';
  document.documentElement.lang = currentLang;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    const val = t(key);
    if (val) el.textContent = val;
  });
}

function applySeo() {
  const s = storeData.site || {};
  const seo = s.seo || {};
  const name = s.name || 'MENES';
  document.title = seo.title || `${name} — ${s.tagline || (currentLang === 'en' ? 'Premium streetwear' : 'Luxe Streetwear')}`;
  let meta = document.querySelector('meta[name="description"]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta); }
  if (seo.description) meta.content = seo.description;
  if (s.favicon) {
    let icon = document.querySelector('link[rel="icon"]');
    if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.appendChild(icon); }
    icon.href = s.favicon;
  }
}

async function loadStoreData() {
  try {
    const res = await fetch(shopApi(API), { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      delete data._siteId;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return data;
    }
  } catch {}
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return JSON.parse(saved);
  try {
    const res = await fetch('/data/store.json');
    if (res.ok) return await res.json();
  } catch {}
  return null;
}

async function refreshStore() {
  storeData = await loadStoreData();
  if (!storeData) return;
  applyLanguage();
  applyTheme();
  renderSite();
  renderFilters();
  renderProducts();
  applySeo();
}

function renderSite() {
  const s = storeData.site || {};
  const sec = s.sections || {};

  document.title = `${s.name || 'MENES'} — Luxe Streetwear`;
  document.getElementById('navBrand').textContent = s.name || 'MENES';
  document.getElementById('footerBrand').textContent = s.name || 'MENES';

  if (s.logo) {
    const logo = document.getElementById('navLogo');
    logo.src = s.logo;
    logo.classList.remove('hidden');
  }

  toggle('announceBar', sec.announcement !== false && s.announcement);
  if (s.announcement) document.getElementById('announceBar').textContent = s.announcement;

  toggle('ambassadeur', sec.ambassador !== false);

  document.getElementById('heroTag').textContent = s.tagline || '';
  document.getElementById('heroTitle').textContent = s.heroTitle || s.name || 'MENES';
  document.getElementById('heroSubtitle').textContent = s.heroSubtitle || '';
  document.getElementById('heroCta').textContent = s.heroCta || t('hero_cta');

  const heroBg = document.getElementById('heroBg');
  if (s.heroImage) {
    heroBg.style.backgroundImage = `url(${s.heroImage})`;
    heroBg.classList.add('has-image');
  }

  toggle('trustBar', sec.trustBar !== false);
  if (sec.trustBar !== false && s.trust?.length) {
    document.getElementById('trustBar').innerHTML = `<div class="trust-grid">${s.trust.map((t) => `
      <div class="trust-item"><div class="icon">${t.icon || '◆'}</div><h4>${esc(t.title)}</h4><p>${esc(t.text)}</p></div>
    `).join('')}</div>`;
  }

  renderBundle(s, sec);
  renderGallery(s, sec);
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

  const igHandle = s.instagramHandle || '@menes_jewelry';
  if (s.instagram) {
    document.getElementById('linkInstagram').href = s.instagram;
    document.getElementById('linkInstagram').textContent = `Instagram ${igHandle}`;
  }
  if (s.email) {
    document.getElementById('linkEmail').href = `mailto:${s.email}`;
    document.getElementById('linkEmail').textContent = s.email;
  }
  if (s.phone) {
    const ph = document.getElementById('linkPhone');
    ph.href = `tel:${s.phone}`;
    ph.textContent = s.phone;
    ph.classList.remove('hidden');
  }
}

function renderBundle(s, sec) {
  const b = s.bundle || {};
  toggle('bundle', sec.bundle !== false && b.title);
  if (sec.bundle === false || !b.title) return;
  document.getElementById('bundleTitle').textContent = b.title;
  document.getElementById('bundleText').textContent = b.text || '';
  document.getElementById('bundleCta').textContent = b.cta || 'Voir la collection';
}

function renderGallery(s, sec) {
  const items = (s.gallery || []).filter((g) => g.image);
  const allItems = s.gallery || [];
  toggle('gallery', sec.gallery !== false);
  if (sec.gallery === false) return;

  document.getElementById('galleryTitle').textContent = s.galleryTitle || 'Ils portent MENES';
  document.getElementById('gallerySubtitle').textContent = s.gallerySubtitle || '';
  const igLink = document.getElementById('galleryIgLink');
  if (s.instagram) {
    igLink.href = s.instagram;
    igLink.textContent = s.instagramHandle || '@menes_jewelry';
  }

  const grid = document.getElementById('galleryGrid');
  const empty = document.getElementById('galleryEmpty');

  if (!items.length) {
    grid.innerHTML = allItems.slice(0, 6).map(() => `
      <div class="gallery-item"><div class="gallery-placeholder">Photo client<br>bientôt</div></div>
    `).join('');
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  grid.innerHTML = items.map((g) => `
    <div class="gallery-item">
      <img src="${g.image}" alt="${esc(g.caption || 'Client MENES')}" loading="lazy">
      ${g.caption || g.handle ? `<div class="gallery-caption">${esc(g.caption || g.handle)}</div>` : ''}
    </div>
  `).join('');
}

function renderEmailCapture(s, sec) {
  const e = s.emailCapture || {};
  toggle('emailCapture', sec.emailCapture !== false && e.title);
  if (sec.emailCapture === false || !e.title) return;
  document.getElementById('emailTitle').textContent = e.title;
  document.getElementById('emailSubtitle').textContent = e.subtitle || '';
  document.getElementById('emailInput').placeholder = e.placeholder || 'ton@email.com';
  document.getElementById('emailBtn').textContent = e.button || "M'inscrire";
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
  }).join('');

  bar.querySelectorAll('.filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      bar.querySelectorAll('.filter').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.cat;
      renderProducts();
    });
  });

  if (!cats.includes(currentFilter)) currentFilter = 'all';
}

function toggle(id, show) {
  document.getElementById(id).classList.toggle('hidden', !show);
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

// Copie robuste : l'API navigator.clipboard n'existe qu'en contexte sécurisé
// (HTTPS/localhost). Sur une page ouverte en http:// (ex. sur mobile) elle est
// absente et la copie échouait silencieusement. On tente l'API moderne puis on
// retombe sur execCommand('copy') via un textarea temporaire.
async function copyToClipboard(text) {
  const value = String(text ?? '');
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch { /* on tente le fallback ci-dessous */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
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

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  const products = (storeData?.products || []).filter((p) => {
    if (!p.active) return false;
    return currentFilter === 'all' || p.category === currentFilter;
  });

  if (!products.length) {
    grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:#888;padding:60px 0">${t('coming')}</p>`;
    return;
  }

  grid.innerHTML = products.map((p) => {
    const stockBadge = p.stock > 0 && p.stock <= 5
      ? `<span class="stock-badge">${t('only_left')} ${p.stock}</span>`
      : '';
    const imgs = productImages(p);
    const main = imgs[0]?.url || '';
    const opts = productOptions(p);

    const thumbs = imgs.length > 1
      ? `<div class="product-thumbs">${imgs.map((im, i) => `
          <button type="button" class="pg-thumb ${i === 0 ? 'active' : ''}" data-url="${esc(im.url)}" data-label="${esc(im.label || '')}">
            <img src="${esc(im.url)}" alt="" loading="lazy">
          </button>`).join('')}</div>`
      : '';

    const optionsHtml = opts.map((o, oi) => `
      <div class="product-option" data-opt="${oi}" data-name="${esc(o.name)}">
        <span class="opt-name">${esc(o.name)}</span>
        <div class="opt-values">
          ${o.values.map((v, vi) => `<button type="button" class="opt-chip ${vi === 0 ? 'active' : ''}" data-value="${esc(v)}">${esc(v)}</button>`).join('')}
        </div>
      </div>`).join('');

    return `
    <article class="product-card" data-id="${esc(p.id)}">
      ${p.featured ? '<span class="product-badge">Populaire</span>' : ''}
      ${stockBadge}
      <div class="product-img">${main ? `<img class="pg-main" src="${esc(main)}" alt="${esc(p.name)}" loading="lazy">` : '<span class="placeholder">◆</span>'}</div>
      ${thumbs}
      <div class="product-body">
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.description)}</p>
        <div class="product-price">
          ${p.comparePrice > p.price ? `<span class="price-old">${p.comparePrice}$</span>` : ''}
          <span class="price-now">${p.price}$ CAD</span>
          ${p.comparePrice > p.price ? `<span class="price-save">-${Math.round((1 - p.price / p.comparePrice) * 100)}%</span>` : ''}
        </div>
        ${optionsHtml}
        <button type="button" class="add-btn">${t('add_to_cart')}</button>
      </div>
    </article>`;
  }).join('');

  grid.querySelectorAll('.product-card').forEach(wireProductCard);
}

function wireProductCard(card) {
  const main = card.querySelector('.pg-main');
  const thumbs = [...card.querySelectorAll('.pg-thumb')];

  const activateThumbByUrl = (url) => {
    thumbs.forEach((tb) => tb.classList.toggle('active', tb.dataset.url === url));
  };

  thumbs.forEach((tb) => tb.addEventListener('click', () => {
    if (main) main.src = tb.dataset.url;
    activateThumbByUrl(tb.dataset.url);
  }));

  card.querySelectorAll('.product-option').forEach((opt) => {
    opt.querySelectorAll('.opt-chip').forEach((chip) => chip.addEventListener('click', () => {
      opt.querySelectorAll('.opt-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const val = (chip.dataset.value || '').toLowerCase();
      const match = thumbs.find((tb) => tb.dataset.label && tb.dataset.label.toLowerCase() === val);
      if (match && main) { main.src = match.dataset.url; activateThumbByUrl(match.dataset.url); }
    }));
  });

  card.querySelector('.add-btn')?.addEventListener('click', () => addToCart(card.dataset.id, card));
}

window.addToCart = (id, card) => {
  const product = storeData.products.find((p) => p.id === id);
  if (!product) return;

  const variant = {};
  if (card) {
    card.querySelectorAll('.product-option').forEach((opt) => {
      const active = opt.querySelector('.opt-chip.active');
      if (active) variant[opt.dataset.name] = active.dataset.value;
    });
  }
  const variantStr = Object.values(variant).join(' / ') || 'Unique';

  const existing = cart.find((c) => c.id === id && (c.variantStr || c.size) === variantStr);
  if (existing) existing.qty++;
  else cart.push({ id, name: product.name, price: product.price, variant, variantStr, size: variantStr, qty: 1 });
  localStorage.setItem('menes_cart', JSON.stringify(cart));
  updateCartUI();
  showToast(t('added'));
};

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2500);
}

function updateCartUI() {
  const count = cart.reduce((s, c) => s + c.qty, 0);
  const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
  document.getElementById('cartCount').textContent = count;
  document.getElementById('cartTotal').textContent = `${total.toFixed(2)}$`;
  document.getElementById('cartItems').innerHTML = cart.length
    ? cart.map((c) => { const v = c.variantStr || c.size; return `<div class="cart-item"><span>${esc(c.name)}${v && v !== 'Unique' ? ` (${esc(v)})` : ''} ×${c.qty}</span><span>${(c.price * c.qty).toFixed(2)}$</span></div>`; }).join('')
    : `<p style="color:#888;padding:40px 0;text-align:center">${t('cart_empty')}</p>`;
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

function currentTotals() {
  const subtotal = cartSubtotal();
  const country = document.getElementById('checkoutCountry')?.value || 'CA';
  const province = document.getElementById('checkoutProvince')?.value || '';
  const tax = computeTax(country, province, subtotal);
  return { subtotal, tax, total: subtotal + tax.amount };
}

function renderCheckoutSummary() {
  const box = document.getElementById('checkoutSummary');
  if (!box) return;
  const { subtotal, tax, total } = currentTotals();
  const country = document.getElementById('checkoutCountry')?.value || 'CA';
  const taxRow = tax.amount > 0
    ? `<div class="sum-row"><span>${t('taxes')} · ${esc(tax.label)}</span><span>${tax.amount.toFixed(2)}$</span></div>`
    : (country !== 'CA' ? `<div class="sum-row muted"><span>${t('taxes')}</span><span>${t('tax_intl')}</span></div>` : '');
  box.innerHTML = `
    <div class="sum-title">${t('sum_title')}</div>
    <div class="sum-items">${cart.map((c) => { const v = c.variantStr || c.size; return `<div class="sum-row"><span>${esc(c.name)}${v && v !== 'Unique' ? ` · ${esc(v)}` : ''} ×${c.qty}</span><span>${(c.price * c.qty).toFixed(2)}$</span></div>`; }).join('')}</div>
    <div class="sum-row"><span>${t('subtotal')}</span><span>${subtotal.toFixed(2)}$</span></div>
    ${taxRow}
    <div class="sum-row"><span>${t('shipping')}</span><span>${t('free')}</span></div>
    <div class="sum-row sum-total"><span>${t('grand_total')}</span><span>${total.toFixed(2)}$ CAD</span></div>`;
}

function populateProvinces() {
  const country = document.getElementById('checkoutCountry')?.value || 'CA';
  const sel = document.getElementById('checkoutProvince');
  if (!sel) return;
  let opts = [];
  if (country === 'CA') opts = CA_PROVINCES.map(([v, n]) => [v, n]);
  else if (country === 'US') opts = US_STATES.map((s) => [s, s]);
  else opts = [['', '—']];
  sel.innerHTML = opts.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join('');
}

function saveCheckoutDraft(customer) {
  const { subtotal, tax, total } = currentTotals();
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
    orderId: Date.now().toString(36).toUpperCase(),
    customer,
    items: [...cart],
    subtotal,
    tax,
    total,
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

function showSuccess() {
  document.getElementById('successTitle').textContent = t('success_title');
  document.getElementById('successMsg').textContent = t('success_msg');
  document.getElementById('successCloseBtn').textContent = t('success_close');
  document.getElementById('successModal').classList.remove('hidden');
  celebrate();
}
document.getElementById('successCloseBtn')?.addEventListener('click', () => {
  document.getElementById('successModal').classList.add('hidden');
});

document.getElementById('cartBtn').addEventListener('click', () => {
  document.getElementById('cartPanel').classList.remove('hidden');
  document.getElementById('cartOverlay').classList.remove('hidden');
});
document.getElementById('closeCart').addEventListener('click', closeCart);
document.getElementById('cartOverlay').addEventListener('click', closeCart);
function closeCart() {
  document.getElementById('cartPanel').classList.add('hidden');
  document.getElementById('cartOverlay').classList.add('hidden');
}

document.getElementById('checkoutBtn').addEventListener('click', () => {
  if (!cart.length) return alert('Panier vide');
  populateProvinces();
  renderCheckoutSummary();
  document.getElementById('checkoutModal').classList.remove('hidden');
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
});

document.querySelectorAll('.pay-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pay-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('payMethod').value = btn.dataset.method;
    const labels = { stripe: 'Payer par carte — Sécurisé (Stripe)', crypto: 'Payer en crypto' };
    document.getElementById('paySubmitBtn').textContent = labels[btn.dataset.method] || 'Payer';
  });
});

document.getElementById('altPayBtn').addEventListener('click', () => {
  const form = document.getElementById('checkoutForm');
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  if (!cart.length) return alert('Panier vide');
  saveCheckoutDraft(getCheckoutCustomer(new FormData(form)));
  window.location.href = '/paiement.html';
});

document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const method = form.get('method') || 'stripe';
  const customer = getCheckoutCustomer(form);
  const { subtotal, tax, total } = currentTotals();
  const order = { id: Date.now().toString(36).toUpperCase(), customer, items: [...cart], subtotal, tax, total, status: 'pending', date: new Date().toISOString(), referral: getReferral() };

  const btn = document.getElementById('paySubmitBtn');
  const note = document.getElementById('checkoutNote');
  note.textContent = '';
  note.className = 'checkout-note';

  if (method === 'crypto') {
    notifyOrder(order, method, total);
    showCryptoPayment(order, total);
    document.getElementById('checkoutModal').classList.add('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Redirection sécurisée...';

  try {
    const res = await fetch(shopApi('/api/pay'), { method: 'POST', headers: shopHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ order, method }) });
    const data = await res.json();
    if (data.checkoutUrl) { window.location.href = data.checkoutUrl; return; }
    if (data.error) { note.textContent = data.error; note.className = 'checkout-note error'; }
  } catch {
    note.textContent = 'Erreur de connexion au serveur de paiement.';
    note.className = 'checkout-note error';
  }

  if (note.textContent) {
    btn.disabled = false;
    btn.textContent = 'Payer par carte — Sécurisé';
    return;
  }

  notifyOrder(order, method, total);
  cart = []; localStorage.removeItem('menes_cart'); updateCartUI();
  document.getElementById('checkoutModal').classList.add('hidden'); closeCart();
  showSuccess();
  btn.disabled = false;
  btn.textContent = 'Payer par carte — Sécurisé';
});

document.getElementById('emailForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (document.getElementById('emailHoney')?.value) return;
  const email = document.getElementById('emailInput').value.trim();
  if (!email) return;
  const btn = document.getElementById('emailBtn');
  btn.disabled = true;
  btn.textContent = '...';
  try {
    await fetch('https://formsubmit.co/ajax/mymenes2022@gmail.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        _subject: 'Nouvelle inscription VIP MENES',
        _template: 'table',
        _honey: '',
        _captcha: 'false',
        Email: email,
        Source: 'Liste VIP site web',
      }),
    });
    showToast('✓ Bienvenue dans la liste VIP!');
    document.getElementById('emailInput').value = '';
  } catch {
    showToast('Erreur — réessaie ou écris-nous sur Instagram');
  }
  btn.disabled = false;
  btn.textContent = storeData?.site?.emailCapture?.button || "M'inscrire";
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

function notifyOrder(order, method, total) {
  fetch('https://formsubmit.co/ajax/mymenes2022@gmail.com', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      _subject: `Commande MENES #${order.id}`, _template: 'table',
      Client: order.customer.name, Email: order.customer.email, Téléphone: order.customer.phone,
      Adresse: order.customer.address, Total: `${total.toFixed(2)}$ CAD`, Paiement: method,
      Articles: order.items.map((c) => `${c.name} (${c.size}) x${c.qty}`).join(', '),
      Parrain: order.referral || '—',
    }),
  }).catch(() => {});
}

/* ---------- Programme ambassadeur ---------- */
const AMB_KEY = 'menes_ambassador';
const REF_KEY = 'menes_ref';

function ambSlug(name) {
  const base = String(name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20) || 'amb';
  const rand = Math.random().toString(36).slice(2, 6);
  return `${base}-${rand}`;
}

function ambInviteLink(code) {
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set('ref', code);
  url.hash = 'ambassadeur';
  return url.toString();
}

function getReferral() {
  try { return localStorage.getItem(REF_KEY) || ''; } catch { return ''; }
}

function captureReferral() {
  try {
    const ref = new URLSearchParams(location.search).get('ref');
    if (ref) {
      localStorage.setItem(REF_KEY, ref);
      setTimeout(() => showToast(t('amb_welcome')), 900);
    }
  } catch {}
}

function renderAmbassadorResult(amb) {
  const linkInput = document.getElementById('ambLink');
  if (!linkInput) return;
  const link = ambInviteLink(amb.code);
  linkInput.value = link;
  document.getElementById('ambResult').classList.remove('hidden');

  const full = `${t('amb_share_msg')} ${link}`;
  const wa = document.getElementById('ambShareWa');
  const sms = document.getElementById('ambShareSms');
  const mail = document.getElementById('ambShareEmail');
  if (wa) wa.href = `https://wa.me/?text=${encodeURIComponent(full)}`;
  if (sms) sms.href = `sms:?&body=${encodeURIComponent(full)}`;
  if (mail) mail.href = `mailto:?subject=${encodeURIComponent(t('amb_share_subject'))}&body=${encodeURIComponent(full)}`;

  const nativeBtn = document.getElementById('ambShareNative');
  if (nativeBtn && navigator.share) {
    nativeBtn.classList.remove('hidden');
    nativeBtn.onclick = () => navigator.share({ title: 'MENES', text: t('amb_share_msg'), url: link }).catch(() => {});
  }
}

function initAmbassador() {
  const form = document.getElementById('ambForm');
  if (!form) return;

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(AMB_KEY) || 'null'); } catch {}
  if (saved && saved.code) {
    document.getElementById('ambName').value = saved.name || '';
    renderAmbassadorResult(saved);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('ambName').value.trim();
    if (!name) return;
    let amb = null;
    try { amb = JSON.parse(localStorage.getItem(AMB_KEY) || 'null'); } catch {}
    if (!amb || !amb.code || amb.name !== name) {
      amb = { name, code: ambSlug(name), created: new Date().toISOString() };
      try { localStorage.setItem(AMB_KEY, JSON.stringify(amb)); } catch {}
    }
    renderAmbassadorResult(amb);
    document.getElementById('ambResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  const copyBtn = document.getElementById('ambCopyBtn');
  copyBtn?.addEventListener('click', async () => {
    const input = document.getElementById('ambLink');
    // Sélectionne le champ pour laisser un copier-coller manuel possible en dernier recours
    input.focus();
    input.select();
    input.setSelectionRange(0, input.value.length);
    const ok = await copyToClipboard(input.value);
    const old = copyBtn.dataset.label || copyBtn.textContent;
    copyBtn.dataset.label = old;
    copyBtn.textContent = ok ? t('amb_copied') : t('amb_copy_fail');
    copyBtn.classList.toggle('copied', ok);
    if (ok) showToast(t('amb_copied'));
    setTimeout(() => {
      copyBtn.textContent = copyBtn.dataset.label || t('amb_copy');
      copyBtn.classList.remove('copied');
    }, 2000);
  });
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
    <div class="crypto-net-warn">Réseau : <strong>${esc(wallet.network)}</strong> — n'envoie que du ${esc(wallet.symbol)} sur ce réseau</div>
    <div class="crypto-addr-row">
      <code class="crypto-addr">${esc(wallet.address)}</code>
      <button type="button" class="crypto-copy" data-addr="${esc(wallet.address)}">Copier</button>
    </div>`;

  panel.querySelectorAll('.crypto-copy, .crypto-copy-amount').forEach((b) => {
    b.addEventListener('click', async () => {
      const value = b.dataset.addr || b.dataset.amount;
      const ok = await copyToClipboard(value);
      const old = b.textContent;
      b.textContent = ok ? 'Copié ✓' : 'Copie bloquée';
      setTimeout(() => { b.textContent = old; }, 1500);
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
  cart = []; localStorage.removeItem('menes_cart'); updateCartUI();
  document.getElementById('cryptoModal').classList.add('hidden');
  closeCart();
  showSuccess();
});
document.getElementById('cryptoRestartBtn')?.addEventListener('click', () => {
  if (cryptoState?.order) showCryptoPayment(cryptoState.order, cryptoState.total);
});
document.getElementById('cryptoCloseBtn').addEventListener('click', () => {
  stopCryptoTimer();
  document.getElementById('cryptoModal').classList.add('hidden');
});

async function init() {
  captureReferral();
  initAmbassador();
  await refreshStore();
  updateCartUI();
  const params = new URLSearchParams(location.search);
  if (params.get('paid') === '1') {
    cart = []; localStorage.removeItem('menes_cart'); sessionStorage.removeItem(DRAFT_KEY);
    updateCartUI();
    history.replaceState({}, '', location.pathname);
    setTimeout(showSuccess, 400);
  }
  // Le contenu (produits, sections) est rendu de façon asynchrone, ce qui décale
  // la position de l'ancre #ambassadeur au chargement. On re-cible la section une
  // fois le rendu terminé pour que les liens d'invitation arrivent au bon endroit.
  if (location.hash === '#ambassadeur') {
    setTimeout(() => document.getElementById('ambassadeur')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
  }
}

window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY && e.newValue) { storeData = JSON.parse(e.newValue); renderSite(); renderFilters(); renderProducts(); }
});
setInterval(refreshStore, 20000);
init();
