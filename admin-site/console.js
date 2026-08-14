/* MENES Platform Console  ·  Admin pro multi-boutiques */
const AUTH_KEY = 'menes_console_auth';
const SITE_KEY = 'menes_active_site';
const THEME_KEY = 'menes_admin_theme';
const PAID_STATUSES = ['paid', 'processing', 'shipped', 'delivered'];

function storageKeyForSite(siteId = activeSiteId) {
  return `menes_store_data_${siteId || 'menes'}`;
}

function catalogScore(data) {
  const products = Array.isArray(data?.products) ? data.products : [];
  const withImage = products.filter((p) => p && (p.image || (Array.isArray(p.images) && p.images.length))).length;
  return products.length * 10 + withImage * 100;
}

function findLocalCatalogBackup() {
  let best = null;
  let bestScore = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== 'menes_store_data' && !String(key || '').startsWith('menes_store_data_')) continue;
      try {
        const data = JSON.parse(localStorage.getItem(key));
        const score = catalogScore(data);
        if (score > bestScore) {
          best = data;
          bestScore = score;
        }
      } catch { /* ignore bad cache */ }
    }
  } catch { /* ignore */ }
  return bestScore > 0 ? best : null;
}

function hideCatalogRestoreBanner() {
  document.getElementById('catalogRestoreBanner')?.classList.add('hidden');
}

function showCatalogRestoreBanner(backup) {
  const banner = document.getElementById('catalogRestoreBanner');
  const msg = document.getElementById('catalogRestoreMsg');
  if (!banner || !msg || !backup) return;
  const n = (backup.products || []).length;
  const photos = (backup.products || []).filter((p) => p && (p.image || (Array.isArray(p.images) && p.images.length))).length;
  msg.textContent = `Copie locale trouvée : ${n} produit(s), ${photos} avec photo. Restaure-la pour renvoyer le catalogue en ligne.`;
  banner.classList.remove('hidden');
}

function apiBase() {
  return (window.MENES_CONFIG?.API_BASE || '').replace(/\/$/, '');
}

function apiUrl(path) {
  const base = apiBase();
  return base ? `${base}${path}` : path;
}

let platform = null;
let storeData = null;
let activeSiteId = localStorage.getItem(SITE_KEY) || 'menes';
let adminPassword = '';
let pendingHeroImage = null;
let pendingLogo = null;

const TAB_TITLES = {
  dashboard: 'Tableau de bord', sites: 'Boutiques & marques', domains: 'Domaines',
  products: 'Produits', collections: 'Collections', orders: 'Commandes',
  customers: 'Clients', marketing: 'Marketing', ambassadors: 'Ambassadeurs',
  appearance: 'Apparence & thème', design: 'Design & contenu',
  sections: 'Sections page', payments: 'Paiements', settings: 'Paramètres', publish: 'Déploiement',
};

function headers() {
  return { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword, 'X-Site-Id': activeSiteId };
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function toast(msg, type = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  const kind = type === 'ok' ? 'success' : type;
  el.textContent = msg;
  el.className = `toast ${kind}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2800);
}

function getAdminTheme() {
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
}

function themeIconSvg(theme) {
  if (theme === 'light') {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
}

function applyAdminTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
  const label = document.getElementById('themeToggleLabel');
  const icon = document.getElementById('themeToggleIcon');
  if (label) label.textContent = next === 'dark' ? 'Clair' : 'Sombre';
  if (icon) icon.innerHTML = themeIconSvg(next);
}

function initAdminTheme() {
  applyAdminTheme(getAdminTheme());
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    applyAdminTheme(getAdminTheme() === 'dark' ? 'light' : 'dark');
  });
}

function isPaidOrder(o) {
  return PAID_STATUSES.includes(o.status);
}

function orderDate(o) {
  if (!o.date) return null;
  const d = new Date(o.date);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayKey(d) {
  return startOfDay(d).toISOString().slice(0, 10);
}

function revenueBuckets(orders, days) {
  const buckets = [];
  const today = startOfDay(new Date());
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    buckets.push({ date, key: dayKey(date), total: 0, count: 0 });
  }
  const keyIndex = new Map(buckets.map((b, i) => [b.key, i]));
  orders.filter(isPaidOrder).forEach((o) => {
    const d = orderDate(o);
    if (!d) return;
    const idx = keyIndex.get(dayKey(d));
    if (idx == null) return;
    buckets[idx].total += o.total || 0;
    buckets[idx].count += 1;
  });
  return buckets;
}

function formatMoney(n) {
  return `${Math.round(n).toLocaleString('fr-CA')}$`;
}

function formatShortDay(d) {
  return d.toLocaleDateString('fr-CA', { weekday: 'short' }).replace('.', '');
}

function formatShortDate(d) {
  return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
}

function renderBarChart(containerId, buckets) {
  const el = document.getElementById(containerId);
  if (!el) return 0;
  const total = buckets.reduce((s, b) => s + b.total, 0);
  if (!total) {
    el.innerHTML = '<div class="chart-empty">Aucun revenu sur cette période</div>';
    return 0;
  }
  const max = Math.max(...buckets.map((b) => b.total), 1);
  el.innerHTML = `<div class="chart-bars">${buckets.map((b) => {
    const pct = Math.max(2, (b.total / max) * 100);
    const tip = `${formatShortDate(b.date)}: ${formatMoney(b.total)}${b.count ? ` · ${b.count} cmd` : ''}`;
    return `<div class="chart-bar-wrap" title="${esc(tip)}"><div class="chart-bar" style="height:${pct}%"></div><span class="chart-label">${esc(formatShortDay(b.date))}</span></div>`;
  }).join('')}</div>`;
  return total;
}

function renderSparkline(containerId, buckets) {
  const el = document.getElementById(containerId);
  if (!el) return 0;
  const total = buckets.reduce((s, b) => s + b.total, 0);
  if (!total) {
    el.innerHTML = '<div class="chart-empty">Aucun revenu sur cette période</div>';
    return 0;
  }
  const w = 320;
  const h = 48;
  const pad = 4;
  const max = Math.max(...buckets.map((b) => b.total), 1);
  const pts = buckets.map((b, i) => {
    const x = buckets.length === 1 ? w / 2 : (i / (buckets.length - 1)) * w;
    const y = h - pad - ((b.total / max) * (h - pad * 2));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `${pts[0].split(',')[0]},${h} ${pts.join(' ')} ${pts[pts.length - 1].split(',')[0]},${h}`;
  el.innerHTML = `<div class="sparkline-wrap"><svg viewBox="0 0 ${w} ${h}" class="sparkline" preserveAspectRatio="none"><polygon class="sparkline-area" points="${area}"/><polyline class="sparkline-line" points="${pts.join(' ')}"/></svg></div>`;
  return total;
}

function switchTab(tab) {
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${tab}`));
  document.getElementById('pageTitle').textContent = TAB_TITLES[tab] || tab;
  closeMobileNav();
  const renders = {
    dashboard: updateDashboard, products: renderProducts, collections: renderCollections,
    orders: renderOrders, customers: renderCustomers, marketing: renderMarketing,
    ambassadors: renderAmbassadors,
    sites: renderSites, domains: renderDomains, design: loadDesignForm, appearance: loadAppearanceForm,
    sections: () => { renderSectionEditors(); renderGalleryEditor(); },
  };
  // Paint tab chrome first, then heavy content — feels instant on click
  requestAnimationFrame(() => {
    try { renders[tab]?.(); } catch (err) { console.error(err); toast(err.message || 'Erreur onglet', 'error'); }
  });
}
window.switchTab = switchTab;

function isMobileNav() {
  return window.matchMedia('(max-width: 900px)').matches;
}

function openMobileNav() {
  if (!isMobileNav()) return;
  document.getElementById('sidebar')?.classList.add('is-open');
  document.getElementById('sidebarBackdrop')?.classList.add('is-open');
  document.getElementById('sidebarBackdrop')?.removeAttribute('hidden');
  document.getElementById('menuToggle')?.setAttribute('aria-expanded', 'true');
  document.body.classList.add('nav-open');
}

function closeMobileNav() {
  document.getElementById('sidebar')?.classList.remove('is-open');
  document.getElementById('sidebarBackdrop')?.classList.remove('is-open');
  document.getElementById('sidebarBackdrop')?.setAttribute('hidden', '');
  document.getElementById('menuToggle')?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('nav-open');
}

function setupMobileNav() {
  document.getElementById('menuToggle')?.addEventListener('click', () => {
    const open = document.getElementById('sidebar')?.classList.contains('is-open');
    if (open) closeMobileNav();
    else openMobileNav();
  });
  document.getElementById('sidebarCloseBtn')?.addEventListener('click', closeMobileNav);
  document.getElementById('sidebarBackdrop')?.addEventListener('click', closeMobileNav);

  // Swipe: open from left edge, close by swiping menu left
  let startX = 0;
  let startY = 0;
  let tracking = false;
  const EDGE = 28;

  document.addEventListener('touchstart', (e) => {
    if (!isMobileNav() || !e.touches[0]) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    const sidebarOpen = document.getElementById('sidebar')?.classList.contains('is-open');
    tracking = sidebarOpen || startX <= EDGE;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!tracking || !isMobileNav() || !e.changedTouches[0]) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dy) > Math.abs(dx)) return; // vertical scroll
    const sidebarOpen = document.getElementById('sidebar')?.classList.contains('is-open');
    if (!sidebarOpen && startX <= EDGE && dx > 60) openMobileNav();
    if (sidebarOpen && dx < -60) closeMobileNav();
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (!isMobileNav()) closeMobileNav();
  });
}

async function loadPlatform() {
  const res = await fetch(apiUrl('/api/platform'), { headers: headers() });
  if (!res.ok) throw new Error('Erreur chargement platform');
  platform = await res.json();
  if (!platform.sites?.some((s) => s.id === activeSiteId)) activeSiteId = platform.defaultSiteId || 'menes';
  renderSiteSelector();
}

function normalizeLoadedStore(data) {
  const out = data && typeof data === 'object' ? data : {};
  delete out._siteId;
  if (!out.collections?.length) {
    out.collections = [
      { id: 'vetements', name: 'Vêtements', active: true },
      { id: 'grillz', name: 'Grillz', active: true },
      { id: 'accessoires', name: 'Accessoires', active: true },
    ];
  }
  if (!out.discounts) out.discounts = [];
  out.discounts = (out.discounts || []).filter((d) => {
    const code = String(d?.code || '').toUpperCase();
    return code !== 'VIP10' && code !== 'WELCOME10';
  });
  if (!out.customers) out.customers = [];
  if (!Array.isArray(out.reviews)) out.reviews = [];
  if (!Array.isArray(out.subscribers)) out.subscribers = [];
  if (!Array.isArray(out.campaigns)) out.campaigns = [];
  if (!Array.isArray(out.products)) out.products = [];
  if (!out.site || typeof out.site !== 'object') out.site = {};
  return out;
}

async function loadStore() {
  hideCatalogRestoreBanner();
  const localBackup = findLocalCatalogBackup();
  const res = await fetch(apiUrl(`/api/store?site=${activeSiteId}&admin=1`), {
    cache: 'no-store',
    headers: headers(),
  });
  if (res.ok) {
    storeData = normalizeLoadedStore(await res.json());
    if (localBackup && catalogScore(localBackup) > catalogScore(storeData)) {
      window.__menesCatalogBackup = localBackup;
      showCatalogRestoreBanner(localBackup);
    } else {
      try { localStorage.setItem(storageKeyForSite(activeSiteId), JSON.stringify(storeData)); } catch { /* quota */ }
    }
    return;
  }
  if (localBackup) {
    storeData = normalizeLoadedStore(localBackup);
    window.__menesCatalogBackup = localBackup;
    showCatalogRestoreBanner(localBackup);
    return;
  }
  storeData = normalizeLoadedStore({ site: {}, products: [], orders: [], customers: [], discounts: [], collections: [] });
}

async function saveStore(msg = 'Sauvegardé') {
  try {
    if (!storeData || !Array.isArray(storeData.products) || storeData.products.length === 0) {
      toast('Sauvegarde bloquée : aucun produit chargé. Recharge la page.', 'error');
      return;
    }
    const keptAmb = (storeData.discounts || []).filter((d) => d && (d.source === 'ambassador' || d.ambassadorId));
    // Flush marketing discount DOM before any full save
    if (document.querySelector('#discountsList .discount-row')) {
      storeData.discounts = readDiscountsFromDOM();
    }
    const have = new Set((storeData.discounts || []).map((d) => String(d.code || '').toUpperCase()));
    for (const d of keptAmb) {
      const code = String(d.code || '').toUpperCase();
      if (code && !have.has(code)) {
        storeData.discounts.push(d);
        have.add(code);
      }
    }
    const res = await fetch(apiUrl('/api/store'), { method: 'POST', headers: headers(), body: JSON.stringify({ ...storeData, _siteId: activeSiteId }) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast(msg, 'success');
      localStorage.setItem(storageKeyForSite(activeSiteId), JSON.stringify(storeData));
    } else {
      toast(data.error || `Erreur sauvegarde (${res.status})`, 'error');
      console.error('Save failed:', data);
    }
  } catch (err) {
    toast('Connexion API impossible. Vérifie que boutiquemenes.netlify.app est en ligne', 'error');
    console.error(err);
  }
}

function renderSiteSelector() {
  const sel = document.getElementById('siteSelector');
  sel.innerHTML = (platform.sites || []).filter((s) => s.status !== 'archived').map((s) =>
    `<option value="${s.id}" ${s.id === activeSiteId ? 'selected' : ''}>${esc(s.name)}</option>`
  ).join('');
  const site = platform.sites.find((s) => s.id === activeSiteId);
  document.getElementById('siteBadge').textContent = site?.name || activeSiteId;
  const url = site?.netlifyUrl || (site?.domains?.[0] ? `https://${site.domains[0]}` : '/');
  document.getElementById('viewStoreLink').href = url.startsWith('http') ? url : `https://${url}`;
  document.getElementById('publishStoreUrl').textContent = document.getElementById('viewStoreLink').href;
  document.getElementById('publishConsoleUrl').textContent = `${location.origin}/console`;
}

document.getElementById('siteSelector')?.addEventListener('change', async (e) => {
  activeSiteId = e.target.value;
  localStorage.setItem(SITE_KEY, activeSiteId);
  await loadStore();
  renderSiteSelector();
  updateDashboard();
  toast(`Boutique : ${platform.sites.find((s) => s.id === activeSiteId)?.name}`);
});

// Auth
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  adminPassword = document.getElementById('loginPassword').value;
  try {
    const res = await fetch(apiUrl('/api/platform'), { headers: headers() });
    if (res.ok) {
      sessionStorage.setItem(AUTH_KEY, '1');
      sessionStorage.setItem('menes_admin_pw', adminPassword);
      showApp();
    } else toast('Mot de passe incorrect', 'error');
  } catch { toast('Erreur connexion', 'error'); }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.clear();
  location.reload();
});

document.querySelectorAll('.nav-btn').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
document.getElementById('saveAllBtn').addEventListener('click', () => saveStore('Tout sauvegardé'));
document.getElementById('catalogRestoreBtn')?.addEventListener('click', async () => {
  const backup = window.__menesCatalogBackup;
  if (!backup || !Array.isArray(backup.products) || !backup.products.length) {
    toast('Aucune copie locale à restaurer', 'error');
    return;
  }
  storeData = normalizeLoadedStore(backup);
  hideCatalogRestoreBanner();
  loadDesignForm(); renderProducts(); renderSectionEditors(); updateDashboard();
  await saveStore('Catalogue local restauré en ligne');
});
document.getElementById('catalogRestoreDismiss')?.addEventListener('click', hideCatalogRestoreBanner);

async function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  await loadPlatform();
  await loadStore();
  renderSiteSelector();
  updateDashboard();
  loadDesignForm();
  renderSectionEditors();
  renderGalleryEditor();
}

function updateDashboard() {
  const p = storeData.products || [];
  const orders = storeData.orders || [];
  const paidOrders = orders.filter(isPaidOrder);
  const customers = new Set(paidOrders.map((o) => o.customer?.email).filter(Boolean));
  const paidRevenue = paidOrders.reduce((s, o) => s + (o.total || 0), 0);
  const pendingCount = orders.filter((o) => o.status === 'pending' || o.status === 'awaiting_payment').length;
  const aov = paidOrders.length ? paidRevenue / paidOrders.length : 0;

  document.getElementById('statProducts').textContent = p.filter((x) => x.active).length;
  document.getElementById('statOrders').textContent = orders.length;
  document.getElementById('statCustomers').textContent = customers.size;
  document.getElementById('statPending').textContent = pendingCount;
  document.getElementById('statPaid').textContent = paidOrders.length;
  document.getElementById('statRevenue').textContent = formatMoney(paidRevenue);
  document.getElementById('statAov').textContent = formatMoney(aov);
  document.getElementById('statSites').textContent = platform?.sites?.length || 1;

  const buckets7 = revenueBuckets(orders, 7);
  const buckets30 = revenueBuckets(orders, 30);
  const total7 = renderBarChart('chart7Days', buckets7);
  const total30 = renderSparkline('chart30Days', buckets30);
  const chart7Total = document.getElementById('chart7Total');
  const chart30Total = document.getElementById('chart30Total');
  if (chart7Total) chart7Total.textContent = formatMoney(total7);
  if (chart30Total) chart30Total.textContent = formatMoney(total30);

  const rev7El = document.getElementById('statRevenue7d');
  if (rev7El) {
    rev7El.textContent = total7 > 0 ? `${formatMoney(total7)} sur 7 jours` : 'Pas de ventes récentes';
    rev7El.classList.toggle('positive', total7 > 0);
  }

  const recent = orders.slice(-5).reverse();
  document.getElementById('recentOrders').innerHTML = recent.length
    ? recent.map((o) => `<div class="mini-item"><span>#${esc(o.id)} · ${esc(o.customer?.name || 'Client')}<br><span class="mini-item-status">${esc(orderStatusLabel(o.status || 'pending'))}</span></span><span>${formatMoney(o.total || 0)}</span></div>`).join('')
    : '<p class="empty">Aucune commande</p>';
}

// Sites
function renderSites() {
  const list = document.getElementById('sitesList');
  list.innerHTML = (platform.sites || []).map((s) => `
    <div class="site-card ${s.id === activeSiteId ? 'active-site' : ''}">
      <h4>${esc(s.name)}</h4>
      <p>${esc(s.brand || '')} · ${esc(s.plan || 'starter')}</p>
      <div class="site-card-stats">
        <span>${s.stats?.products || 0} produits</span>
        <span>${s.stats?.orders || 0} commandes</span>
        <span>${(s.stats?.revenue || 0).toFixed(0)}$</span>
      </div>
      <div class="site-card-actions">
        <button class="btn-outline btn-sm" onclick="selectSite('${s.id}')">Gérer</button>
        <button class="btn-outline btn-sm" onclick="switchTab('domains')">Domaines</button>
        ${s.id !== 'menes' ? `<button class="btn-outline btn-sm btn-danger" onclick="archiveSite('${s.id}')">Archiver</button>` : ''}
      </div>
    </div>`).join('');
  const dup = document.getElementById('duplicateFrom');
  if (dup) dup.innerHTML = '<option value="">Boutique vide</option>' + platform.sites.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
}

window.selectSite = async (id) => {
  activeSiteId = id;
  localStorage.setItem(SITE_KEY, id);
  document.getElementById('siteSelector').value = id;
  await loadStore();
  renderSiteSelector();
  switchTab('dashboard');
};

window.archiveSite = async (id) => {
  if (!confirm('Archiver cette boutique?')) return;
  await fetch(apiUrl('/api/platform'), { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'delete-site', id }) });
  await loadPlatform();
  renderSites();
  toast('Boutique archivée');
};

document.getElementById('newSiteBtn')?.addEventListener('click', () => document.getElementById('siteModal').classList.remove('hidden'));
document.getElementById('cancelSiteBtn')?.addEventListener('click', () => document.getElementById('siteModal').classList.add('hidden'));

document.getElementById('newSiteForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('newSiteName').value.trim();
  const domain = document.getElementById('newSiteDomain').value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const netlifyUrl = document.getElementById('newSiteNetlifyUrl').value.trim()
    || (domain ? `https://${domain}` : '');
  const body = {
    action: 'create-site',
    name,
    slug: document.getElementById('newSiteSlug').value || name,
    brand: document.getElementById('newSiteBrand').value,
    domains: domain ? [domain] : [],
    netlifyUrl,
    duplicateFrom: document.getElementById('duplicateFrom').value || null,
  };
  const res = await fetch(apiUrl('/api/platform'), { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  const data = await res.json();
  if (data.ok) {
    document.getElementById('siteModal').classList.add('hidden');
    await loadPlatform();
    activeSiteId = data.site.id;
    localStorage.setItem(SITE_KEY, activeSiteId);
    await loadStore();
    renderSites();
    renderSiteSelector();
    toast(`Boutique ${name} créée`, 'success');
  } else toast(data.error || 'Erreur', 'error');
});

// Domains
function renderDomains() {
  const site = platform.sites.find((s) => s.id === activeSiteId);
  document.getElementById('domainSiteName').textContent = `Domaines · ${site?.name || activeSiteId}`;
  const domains = site?.domains || [];
  document.getElementById('domainsList').innerHTML = domains.length
    ? domains.map((d) => `<div class="domain-item"><span>${esc(d)}</span><a href="https://${esc(d)}" target="_blank" rel="noopener">Visiter</a></div>`).join('')
    : '<p class="empty">Aucun domaine. Ajoute-en un ci-dessous.</p>';
}

document.getElementById('addDomainBtn')?.addEventListener('click', async () => {
  const domain = document.getElementById('newDomainInput').value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!domain) return;
  const site = platform.sites.find((s) => s.id === activeSiteId);
  const domains = [...new Set([...(site.domains || []), domain])];
  await fetch(apiUrl('/api/platform'), { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'update-site', id: activeSiteId, domains }) });
  await loadPlatform();
  renderDomains();
  document.getElementById('newDomainInput').value = '';
  toast('Domaine ajouté. Configure-le dans Netlify', 'success');
});

// Products
function renderProducts() {
  const search = (document.getElementById('productSearch')?.value || '').toLowerCase();
  const cat = document.getElementById('productFilterCat')?.value || '';
  let products = storeData.products || [];
  if (search) products = products.filter((p) => p.name.toLowerCase().includes(search) || (p.sku || '').toLowerCase().includes(search));
  if (cat) products = products.filter((p) => p.category === cat);

  const catSel = document.getElementById('productFilterCat');
  if (catSel) {
    const cats = [...new Set((storeData.products || []).map((p) => p.category))];
    catSel.innerHTML = '<option value="">Toutes catégories</option>' + cats.map((c) => `<option value="${c}">${c}</option>`).join('');
    catSel.value = cat;
  }

  document.getElementById('productsList').innerHTML = products.length ? `
    <table class="data-table"><thead><tr><th>Produit</th><th>SKU</th><th>Catégorie</th><th>Prix</th><th>Stock</th><th>Statut</th><th></th></tr></thead>
    <tbody>${products.map((p) => `<tr class="${p.active ? '' : 'inactive'}">
      <td><strong>${esc(p.name)}</strong></td><td>${esc(p.sku || '-')}</td><td>${esc(p.category)}</td>
      <td>${p.price}$${p.comparePrice ? ` <s>${p.comparePrice}$</s>` : ''}</td>
      <td>${formatProductStockCell(p)}</td>
      <td>${p.active ? '<span class="badge paid">Actif</span>' : '<span class="badge cancelled">Masqué</span>'}${p.preorder ? ' <span class="badge pending">Précommande</span>' : ''}</td>
      <td><button onclick="editProduct('${p.id}')">Modifier</button> <button class="btn-danger" onclick="deleteProduct('${p.id}')">Suppr.</button></td>
    </tr>`).join('')}</tbody></table>` : '<p class="empty">Aucun produit</p>';
}

document.getElementById('productSearch')?.addEventListener('input', renderProducts);
document.getElementById('productFilterCat')?.addEventListener('change', renderProducts);
document.getElementById('addProductBtn')?.addEventListener('click', () => openProductModal());
document.getElementById('cancelProductBtn')?.addEventListener('click', () => document.getElementById('productModal').classList.add('hidden'));

let productImagesState = [];
let productOptionsState = [];
let productVariantsState = []; // { key, options: {Couleur:'Vert'}, stock }

function formatProductStockCell(p) {
  const variants = Array.isArray(p.variants) ? p.variants : [];
  if (variants.length) {
    const total = variants.reduce((s, v) => s + (Number(v.stock) || 0), 0);
    const oos = variants.filter((v) => (Number(v.stock) || 0) <= 0).length;
    const detail = oos ? `${oos} variante(s) épuisée(s)` : `${variants.length} variante(s)`;
    return `${total}<span class="stock-cell-detail">${esc(detail)}</span>`;
  }
  return p.stock > 0 ? String(p.stock) : '-';
}

function variantKeyFromOptions(optsMap) {
  return Object.keys(optsMap || {}).sort().map((k) => `${k}=${optsMap[k]}`).join('|');
}

function parseOptionsState() {
  return productOptionsState
    .map((o) => ({
      name: (o.name || '').trim(),
      values: (o.values || '').split(',').map((v) => v.trim()).filter(Boolean),
    }))
    .filter((o) => o.name && o.values.length);
}

function cartesianOptions(options) {
  if (!options.length) return [];
  return options.reduce((acc, opt) => {
    if (!acc.length) {
      return opt.values.map((v) => ({ [opt.name]: v }));
    }
    const next = [];
    acc.forEach((row) => {
      opt.values.forEach((v) => next.push({ ...row, [opt.name]: v }));
    });
    return next;
  }, []);
}

function rebuildVariantsFromOptions(preserve = true) {
  const options = parseOptionsState();
  const combos = cartesianOptions(options);
  const prev = new Map((preserve ? productVariantsState : []).map((v) => [v.key, v]));
  productVariantsState = combos.map((optsMap) => {
    const key = variantKeyFromOptions(optsMap);
    const old = prev.get(key);
    const label = Object.values(optsMap).join(' / ');
    return {
      key,
      label,
      options: optsMap,
      stock: old ? (Number(old.stock) || 0) : 0,
    };
  });
  // If no options, keep empty variants (use product-level stock)
  renderVariantsStockEditor();
  syncProductStockFromVariants();
}

function syncProductStockFromVariants() {
  const stockInput = document.getElementById('productStock');
  const hint = document.getElementById('productStockHint');
  if (!stockInput) return;
  if (productVariantsState.length) {
    const sum = productVariantsState.reduce((s, v) => s + (Number(v.stock) || 0), 0);
    stockInput.value = String(sum);
    stockInput.readOnly = true;
    if (hint) hint.textContent = '(auto = somme des variantes)';
  } else {
    stockInput.readOnly = false;
    if (hint) hint.textContent = '(stock global si aucune option)';
  }
}

function renderVariantsStockEditor() {
  const box = document.getElementById('variantsStockEditor');
  if (!box) return;
  if (!productVariantsState.length) {
    box.innerHTML = '<p class="variants-stock-empty">Ajoute des options (ex: Couleur: Vert, Noir) pour gérer le stock unitaire de chaque variante.</p>';
    return;
  }
  box.innerHTML = `<table class="variants-stock-table">
    <thead><tr><th>Variante</th><th>Stock</th><th></th></tr></thead>
    <tbody>
      ${productVariantsState.map((v, i) => `
        <tr>
          <td><strong>${esc(v.label)}</strong></td>
          <td><input type="number" min="0" class="var-stock-in" data-i="${i}" value="${Number(v.stock) || 0}"></td>
          <td class="${(Number(v.stock) || 0) <= 0 ? 'is-oos' : ''}">${(Number(v.stock) || 0) <= 0 ? 'Épuisé' : 'OK'}</td>
        </tr>`).join('')}
    </tbody>
  </table>`;
  box.querySelectorAll('.var-stock-in').forEach((inp) => {
    inp.addEventListener('input', () => {
      const i = +inp.dataset.i;
      productVariantsState[i].stock = Math.max(0, parseInt(inp.value, 10) || 0);
      const cell = inp.closest('tr')?.querySelector('td:last-child');
      if (cell) {
        const oos = productVariantsState[i].stock <= 0;
        cell.textContent = oos ? 'Épuisé' : 'OK';
        cell.classList.toggle('is-oos', oos);
      }
      syncProductStockFromVariants();
    });
  });
}

function normalizeImages(product) {
  if (Array.isArray(product?.images) && product.images.length) {
    return product.images.map((im) => (typeof im === 'string' ? { url: im, label: '' } : { url: im.url, label: im.label || '' })).filter((im) => im.url);
  }
  if (product?.image) return [{ url: product.image, label: '' }];
  return [];
}

function normalizeOptions(product) {
  if (Array.isArray(product?.options) && product.options.length) {
    return product.options.filter((o) => o && o.name).map((o) => ({ name: o.name, values: (o.values || []).join(', ') }));
  }
  if (Array.isArray(product?.sizes) && product.sizes.length) {
    return [{ name: 'Taille', values: product.sizes.join(', ') }];
  }
  return [];
}

function openProductModal(product = null) {
  const cats = storeData.collections || [{ id: 'vetements', name: 'Vêtements' }];
  document.getElementById('productCategory').innerHTML = cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  document.getElementById('productModal').classList.remove('hidden');
  document.getElementById('productModalTitle').textContent = product ? 'Modifier produit' : 'Nouveau produit';
  document.getElementById('productId').value = product?.id || '';
  document.getElementById('productName').value = product?.name || '';
  document.getElementById('productSku').value = product?.sku || '';
  document.getElementById('productCategory').value = product?.category || 'vetements';
  document.getElementById('productPrice').value = product?.price || '';
  document.getElementById('productCompare').value = product?.comparePrice || '';
  document.getElementById('productDesc').value = product?.description || '';
  document.getElementById('productTags').value = (product?.tags || []).join(', ');
  document.getElementById('productStock').value = product?.stock || 0;
  const pv = document.getElementById('productVideoUrl');
  if (pv) pv.value = product?.videoUrl || '';
  document.getElementById('productImageUrl').value = '';
  document.getElementById('productActive').checked = product?.active !== false;
  document.getElementById('productFeatured').checked = !!product?.featured;
  const preEl = document.getElementById('productPreorder');
  if (preEl) preEl.checked = !!product?.preorder;
  const preNote = document.getElementById('productPreorderNote');
  if (preNote) preNote.value = product?.preorderNote || '';
  syncPreorderNoteVisibility();

  productImagesState = normalizeImages(product);
  productOptionsState = normalizeOptions(product);
  // Load existing variants (or build empty from options)
  if (Array.isArray(product?.variants) && product.variants.length) {
    productVariantsState = product.variants.map((v) => {
      const optsMap = v.options && typeof v.options === 'object' ? v.options : {};
      const key = v.key || variantKeyFromOptions(optsMap);
      return {
        key,
        label: v.label || Object.values(optsMap).join(' / ') || key,
        options: optsMap,
        stock: Number(v.stock) || 0,
      };
    });
  } else {
    productVariantsState = [];
  }
  renderProductImagesEditor();
  renderProductOptionsEditor();
  rebuildVariantsFromOptions(true);
}

function variantValuesList() {
  const vals = [];
  productOptionsState.forEach((o) => {
    (o.values || '').split(',').map((v) => v.trim()).filter(Boolean).forEach((v) => { if (!vals.includes(v)) vals.push(v); });
  });
  return vals;
}

function renderProductImagesEditor() {
  const box = document.getElementById('productImagesEditor');
  if (!box) return;
  if (!productImagesState.length) {
    box.innerHTML = '<p class="empty" style="padding:16px">Aucune photo. Ajoute-en ci-dessous.</p>';
    return;
  }
  const variants = variantValuesList();
  box.innerHTML = productImagesState.map((im, i) => `
    <div class="image-edit-row" data-i="${i}">
      <img src="${esc(im.url)}" alt="">
      <div class="image-edit-fields">
        ${i === 0 ? '<span class="badge-main">Principale</span>' : `<button type="button" class="btn-link makeMain" data-i="${i}">Définir principale</button>`}
        <label class="img-var-label">Associer à la variante
          <input list="variantOptionsList" class="image-variant" data-i="${i}" value="${esc(im.label || '')}" placeholder="ex: Olive Green">
        </label>
      </div>
      <div class="image-edit-actions">
        <button type="button" class="btn-link studioImg" data-i="${i}">Studio</button>
        <button type="button" class="btn-link recropImg" data-i="${i}">Recadrer</button>
        <button type="button" class="del-row delImg" data-i="${i}">Suppr.</button>
      </div>
    </div>`).join('')
    + `<datalist id="variantOptionsList">${variants.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;

  box.querySelectorAll('.image-variant').forEach((inp) => inp.addEventListener('input', () => { productImagesState[+inp.dataset.i].label = inp.value; }));
  box.querySelectorAll('.delImg').forEach((b) => b.addEventListener('click', () => { productImagesState.splice(+b.dataset.i, 1); renderProductImagesEditor(); }));
  box.querySelectorAll('.makeMain').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.i; const [im] = productImagesState.splice(i, 1); productImagesState.unshift(im); renderProductImagesEditor(); }));
  box.querySelectorAll('.recropImg').forEach((b) => b.addEventListener('click', () => {
    const i = +b.dataset.i;
    openCropper(productImagesState[i].url, defaultAspectFor(), (dataUrl) => { productImagesState[i].url = dataUrl; renderProductImagesEditor(); }, { studio: false });
  }));
  box.querySelectorAll('.studioImg').forEach((b) => b.addEventListener('click', () => {
    const i = +b.dataset.i;
    openCropper(productImagesState[i].url, defaultAspectFor(), (dataUrl) => { productImagesState[i].url = dataUrl; renderProductImagesEditor(); }, { studio: true });
  }));
}

function renderProductOptionsEditor() {
  const box = document.getElementById('optionsEditor');
  if (!box) return;
  box.innerHTML = productOptionsState.map((o, i) => `
    <div class="option-edit-row" data-i="${i}">
      <input class="opt-name-in" data-i="${i}" value="${esc(o.name)}" placeholder="Nom (ex: Couleur)">
      <input class="opt-values-in" data-i="${i}" value="${esc(o.values)}" placeholder="Valeurs séparées par virgule (ex: Olive Green, Onyx)">
      <button type="button" class="del-row delOpt" data-i="${i}">Suppr.</button>
    </div>`).join('') || '<p class="empty" style="padding:12px">Aucune option. Clique « + Ajouter une option » (ex: Taille, Couleur).</p>';

  box.querySelectorAll('.opt-name-in').forEach((inp) => inp.addEventListener('input', () => {
    productOptionsState[+inp.dataset.i].name = inp.value;
    rebuildVariantsFromOptions(true);
  }));
  box.querySelectorAll('.opt-values-in').forEach((inp) => inp.addEventListener('input', () => {
    productOptionsState[+inp.dataset.i].values = inp.value;
    updateVariantDatalist();
    rebuildVariantsFromOptions(true);
  }));
  box.querySelectorAll('.delOpt').forEach((b) => b.addEventListener('click', () => {
    productOptionsState.splice(+b.dataset.i, 1);
    renderProductOptionsEditor();
    rebuildVariantsFromOptions(true);
  }));
}

function updateVariantDatalist() {
  const dl = document.getElementById('variantOptionsList');
  if (dl) dl.innerHTML = variantValuesList().map((v) => `<option value="${esc(v)}">`).join('');
}

document.getElementById('addOptionBtn')?.addEventListener('click', () => {
  productOptionsState.push({ name: '', values: '' });
  renderProductOptionsEditor();
  rebuildVariantsFromOptions(true);
});

document.getElementById('addImageUrlBtn')?.addEventListener('click', () => {
  const input = document.getElementById('productImageUrl');
  const url = input.value.trim();
  if (!url) return;
  productImagesState.push({ url, label: '' });
  input.value = '';
  renderProductImagesEditor();
});

function syncPreorderNoteVisibility() {
  const on = document.getElementById('productPreorder')?.checked;
  document.getElementById('productPreorderNoteWrap')?.classList.toggle('hidden', !on);
}
document.getElementById('productPreorder')?.addEventListener('change', syncPreorderNoteVisibility);

window.editProduct = (id) => { const p = storeData.products.find((x) => x.id === id); if (p) openProductModal(p); };
window.deleteProduct = async (id) => {
  if (!confirm('Supprimer ce produit?')) return;
  storeData.products = storeData.products.filter((p) => p.id !== id);
  await saveStore('Produit supprimé');
  renderProducts();
};

document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('productId').value || document.getElementById('productName').value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const options = productOptionsState
    .map((o) => ({ name: (o.name || '').trim(), values: (o.values || '').split(',').map((v) => v.trim()).filter(Boolean) }))
    .filter((o) => o.name && o.values.length);
  const images = productImagesState.filter((im) => im.url).map((im) => ({ url: im.url, label: (im.label || '').trim() }));

  rebuildVariantsFromOptions(true);
  const variants = productVariantsState.map((v) => ({
    key: v.key,
    label: v.label,
    options: v.options,
    stock: Math.max(0, Number(v.stock) || 0),
  }));
  const stock = variants.length
    ? variants.reduce((s, v) => s + v.stock, 0)
    : (parseInt(document.getElementById('productStock').value, 10) || 0);

  const product = {
    id, name: document.getElementById('productName').value,
    sku: document.getElementById('productSku').value,
    category: document.getElementById('productCategory').value,
    price: parseFloat(document.getElementById('productPrice').value),
    comparePrice: parseFloat(document.getElementById('productCompare').value) || 0,
    description: document.getElementById('productDesc').value,
    options,
    sizes: (options.find((o) => /taille|size/i.test(o.name)) || {}).values || [],
    tags: document.getElementById('productTags').value.split(',').map((s) => s.trim()).filter(Boolean),
    stock,
    variants,
    images,
    image: images[0]?.url || '',
    videoUrl: document.getElementById('productVideoUrl')?.value.trim() || '',
    active: document.getElementById('productActive').checked,
    featured: document.getElementById('productFeatured').checked,
    preorder: !!document.getElementById('productPreorder')?.checked,
    preorderNote: document.getElementById('productPreorder')?.checked
      ? (document.getElementById('productPreorderNote')?.value.trim() || '')
      : '',
  };
  if (!storeData.products) storeData.products = [];
  const idx = storeData.products.findIndex((p) => p.id === id);
  if (idx >= 0) storeData.products[idx] = { ...storeData.products[idx], ...product };
  else storeData.products.push(product);
  await saveStore('Produit sauvegardé');
  document.getElementById('productModal').classList.add('hidden');
  renderProducts();
});

// Collections
function renderCollections() {
  const cols = storeData.collections || [];
  document.getElementById('collectionsList').innerHTML = cols.map((c, i) => `
    <div class="card" style="padding:16px;display:flex;gap:12px;align-items:center">
      <input value="${esc(c.name)}" data-i="${i}" class="col-name" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:6px">
      <code>${esc(c.id)}</code>
      <label class="checkbox"><input type="checkbox" class="col-active" data-i="${i}" ${c.active !== false ? 'checked' : ''}> Active</label>
    </div>`).join('') || '<p class="empty">Aucune collection</p>';
}

document.getElementById('addCollectionBtn')?.addEventListener('click', async () => {
  const name = prompt('Nom de la collection:');
  if (!name) return;
  const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  storeData.collections.push({ id, name, active: true });
  await saveStore('Collection ajoutée');
  renderCollections();
});

// Orders
const ORDER_STATUS_LABELS = {
  pending: 'En attente',
  awaiting_payment: 'Paiement en cours',
  paid: 'Payée',
  processing: 'En préparation',
  shipped: 'Expédiée',
  delivered: 'Livrée',
  cancelled: 'Annulée',
};
const ORDER_STATUS_FLOW = ['pending', 'awaiting_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'];

function orderStatusLabel(status) {
  return ORDER_STATUS_LABELS[status] || status || 'En attente';
}

function formatOrderAddress(c = {}) {
  if (c.addressLine) {
    return [c.addressLine, c.city, `${c.province || ''} ${c.postal || ''}`.trim(), c.country]
      .filter(Boolean)
      .join(', ');
  }
  return c.address || [c.city, c.province, c.postal, c.country].filter(Boolean).join(', ') || '—';
}

function formatOrderDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' });
}

function renderOrders() {
  const status = document.getElementById('orderFilterStatus')?.value || '';
  let orders = [...(storeData.orders || [])].reverse();
  if (status) orders = orders.filter((o) => o.status === status);
  document.getElementById('ordersList').innerHTML = orders.length ? `
    <table class="data-table"><thead><tr><th>#</th><th>Client</th><th>Total</th><th>Paiement</th><th>Statut</th><th>Date</th><th></th><th></th></tr></thead>
    <tbody>${orders.map((o) => {
      const st = o.status || 'pending';
      return `<tr>
      <td><strong>${esc(o.id)}</strong></td>
      <td>${esc(o.customer?.name)}<br><small>${esc(o.customer?.email)}</small></td>
      <td>${(o.total || 0).toFixed(2)}$</td>
      <td>${esc(o.payment || o.method || '-')}</td>
      <td><span class="badge ${esc(st)}">${esc(orderStatusLabel(st))}</span></td>
      <td>${o.date ? new Date(o.date).toLocaleDateString('fr-CA') : '-'}</td>
      <td><button type="button" class="btn-link" onclick="openOrderDetail('${esc(o.id)}')">Détail</button></td>
      <td><select onchange="updateOrderStatus('${esc(o.id)}', this.value)">
        ${ORDER_STATUS_FLOW.map((s) => `<option value="${s}" ${st === s ? 'selected' : ''}>${ORDER_STATUS_LABELS[s]}</option>`).join('')}
      </select></td>
    </tr>`;
    }).join('')}</tbody></table>` : '<p class="empty">Aucune commande pour l\'instant. Elles apparaîtront ici après achat.</p>';
}

window.openOrderDetail = (id) => {
  const o = (storeData.orders || []).find((x) => x.id === id);
  if (!o) return;
  const c = o.customer || {};
  const st = o.status || 'pending';
  const items = o.items || [];
  const itemsHtml = items.length
    ? `<table class="data-table order-items-table"><thead><tr><th>Article</th><th>Qté</th><th>Prix</th></tr></thead>
        <tbody>${items.map((i) => {
          const line = (Number(i.price) || 0) * (Number(i.qty) || 1);
          const variant = i.size && i.size !== '—' ? ` · ${esc(i.size)}` : '';
          const pre = i.preorder ? ' <span class="badge pending">Précommande</span>' : '';
          return `<tr><td>${esc(i.name)}${variant}${pre}${i.preorderNote ? `<br><span class="hint">${esc(i.preorderNote)}</span>` : ''}</td><td>${esc(i.qty)}</td><td>${line.toFixed(2)}$</td></tr>`;
        }).join('')}</tbody></table>`
    : '<p class="empty">Aucun article</p>';
  const title = document.getElementById('orderModalTitle');
  const body = document.getElementById('orderModalBody');
  if (title) title.textContent = `Commande ${o.id}`;
  if (body) {
    body.innerHTML = `
      <div class="order-detail-grid">
        <div><span class="muted">Statut</span><div><span class="badge ${esc(st)}">${esc(orderStatusLabel(st))}</span></div></div>
        <div><span class="muted">Total</span><div><strong>${(o.total || 0).toFixed(2)}$ CAD</strong></div></div>
        <div><span class="muted">Paiement</span><div>${esc(o.payment || o.method || '—')}</div></div>
        <div><span class="muted">Créée</span><div>${esc(formatOrderDate(o.date))}</div></div>
        <div><span class="muted">Payée</span><div>${esc(formatOrderDate(o.paidAt))}</div></div>
        <div><span class="muted">Client</span><div>${esc(c.name || '—')}</div></div>
        <div><span class="muted">Email</span><div>${esc(c.email || '—')}</div></div>
        <div><span class="muted">Téléphone</span><div>${esc(c.phone || '—')}</div></div>
        <div class="order-detail-full"><span class="muted">Adresse</span><div>${esc(formatOrderAddress(c))}</div></div>
      </div>
      <h4 class="modal-subhead">Articles</h4>
      ${itemsHtml}
      ${o.tax?.amount != null ? `<p class="hint">Taxes (${esc(o.tax.label || '')}) : ${Number(o.tax.amount).toFixed(2)}$ · Sous-total : ${Number(o.subtotal ?? 0).toFixed(2)}$</p>` : ''}`;
  }
  document.getElementById('orderModal')?.classList.remove('hidden');
};

document.getElementById('closeOrderBtn')?.addEventListener('click', () => {
  document.getElementById('orderModal')?.classList.add('hidden');
});
document.getElementById('orderModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'orderModal') e.currentTarget.classList.add('hidden');
});

window.updateOrderStatus = async (id, status) => {
  const o = storeData.orders.find((x) => x.id === id);
  if (!o) return;
  if (status === 'paid' || status === 'cancelled') {
    const label = orderStatusLabel(status);
    if (!confirm(`Confirmer le passage au statut « ${label} » pour la commande ${id} ?`)) {
      renderOrders();
      return;
    }
  }
  o.status = status;
  await saveStore('Statut mis à jour');
  renderOrders();
  updateDashboard();
};

document.getElementById('orderFilterStatus')?.addEventListener('change', renderOrders);

// Customers CRM — LTV / counts from paid statuses only (excludes awaiting_payment, pending, cancelled)
function customerSegment(c) {
  const threshold = Number(storeData?.site?.freeShippingThreshold) || 150;
  if (c.orders >= 2 || c.total >= threshold) return 'vip';
  if (c.orders === 1) return 'new';
  return 'regular';
}

function renderCustomers() {
  const map = new Map();
  (storeData.orders || []).forEach((o) => {
    if (!isPaidOrder(o)) return;
    const email = o.customer?.email;
    if (!email) return;
    if (!map.has(email)) map.set(email, { name: o.customer.name, email, phone: o.customer.phone, orders: 0, total: 0 });
    const c = map.get(email);
    c.orders++;
    c.total += o.total || 0;
  });
  const segFilter = document.getElementById('customerSegmentFilter')?.value || '';
  let list = [...map.values()].map((c) => ({ ...c, segment: customerSegment(c), ltv: c.total }));
  if (segFilter) list = list.filter((c) => c.segment === segFilter);
  list.sort((a, b) => b.ltv - a.ltv);
  const segLabel = { vip: 'VIP', new: 'Nouveau', regular: 'Régulier' };
  document.getElementById('customersList').innerHTML = list.length ? `
    <table class="data-table"><thead><tr><th>Client</th><th>Email</th><th>Commandes</th><th>LTV</th><th>Segment</th></tr></thead>
    <tbody>${list.map((c) => `<tr>
      <td>${esc(c.name)}</td>
      <td>${esc(c.email)}</td>
      <td>${c.orders}</td>
      <td>${c.ltv.toFixed(2)}$ CAD</td>
      <td><span class="badge badge-${c.segment}">${segLabel[c.segment] || c.segment}</span></td>
    </tr>`).join('')}</tbody></table>`
    : '<p class="empty">Aucun client encore</p>';
}

document.getElementById('customerSegmentFilter')?.addEventListener('change', renderCustomers);

// Marketing
const MKT_TEMPLATE_DEFAULTS = {
  welcome: {
    name: 'Bienvenue VIP',
    subject: 'Bienvenue dans le cercle MENES',
    preheader: 'Ton accès anticipé commence ici.',
    bodyHtml: '',
    ctaLabel: 'Voir la boutique',
    ctaUrl: '',
  },
  drop: {
    name: 'Nouveau drop',
    subject: 'Drop MENES · maintenant en ligne',
    preheader: 'Pièces limitées. Pas de restock.',
    bodyHtml: '',
    ctaLabel: 'Shopper le drop',
    ctaUrl: '',
  },
  review: {
    name: 'Demande d’avis',
    subject: 'Ton look MENES mérite un avis',
    preheader: '2 minutes pour inspirer la communauté.',
    bodyHtml: '',
    ctaLabel: 'Laisser un avis',
    ctaUrl: '',
  },
  promo: {
    name: 'Offre exclusive',
    subject: 'Offre VIP MENES · réservée à la liste',
    preheader: 'Un avantage réservé aux initiés.',
    bodyHtml: '',
    ctaLabel: 'Profiter de l’offre',
    ctaUrl: '',
  },
};

let mktPreviewBlobUrl = null;
let mktDefaultsApplied = false;

function mktPayload(action) {
  const bodyHtml = document.getElementById('mktBodyHtml')?.value.trim() || '';
  return {
    action,
    template: document.getElementById('mktTemplate')?.value || 'welcome',
    segment: document.getElementById('mktSegment')?.value || 'subscribers',
    subject: document.getElementById('mktSubject')?.value.trim() || '',
    preheader: document.getElementById('mktPreheader')?.value.trim() || '',
    ctaLabel: document.getElementById('mktCtaLabel')?.value.trim() || '',
    ctaUrl: document.getElementById('mktCtaUrl')?.value.trim() || '',
    bodyHtml: bodyHtml || undefined,
    name: document.getElementById('mktCampName')?.value.trim() || '',
    to: document.getElementById('mktTestEmail')?.value.trim() || '',
  };
}

function applyMktTemplateDefaults() {
  const id = document.getElementById('mktTemplate')?.value || 'welcome';
  const d = MKT_TEMPLATE_DEFAULTS[id] || MKT_TEMPLATE_DEFAULTS.welcome;
  const set = (elId, val) => {
    const el = document.getElementById(elId);
    if (el) el.value = val;
  };
  set('mktSubject', d.subject);
  set('mktPreheader', d.preheader);
  set('mktCtaLabel', d.ctaLabel);
  set('mktCtaUrl', d.ctaUrl || '');
  set('mktBodyHtml', d.bodyHtml || '');
  const nameEl = document.getElementById('mktCampName');
  if (nameEl && (!nameEl.value.trim() || Object.values(MKT_TEMPLATE_DEFAULTS).some((t) => t.name === nameEl.value.trim()))) {
    nameEl.value = d.name;
  }
}

function renderMktSubscribers() {
  const list = (storeData.subscribers || []).filter((s) => s.email);
  const count = document.getElementById('mktSubCount');
  const box = document.getElementById('mktSubscribers');
  if (count) count.textContent = String(list.length);
  if (!box) return;
  if (!list.length) {
    box.innerHTML = '<p class="empty">Aucun abonné</p>';
    return;
  }
  box.innerHTML = `<table class="data-table"><thead><tr><th>Email</th><th>Date</th><th>Statut</th></tr></thead><tbody>${
    list.slice(0, 80).map((s) => `<tr>
      <td>${esc(s.email)}</td>
      <td>${esc((s.createdAt || s.date || '').toString().slice(0, 10))}</td>
      <td>${s.active === false ? '<span class="badge rejected">Inactif</span>' : '<span class="badge approved">Actif</span>'}</td>
    </tr>`).join('')
  }</tbody></table>`;
}

function renderMktReviews() {
  const list = storeData.reviews || [];
  const count = document.getElementById('mktReviewCount');
  const box = document.getElementById('mktReviews');
  if (count) count.textContent = String(list.length);
  if (!box) return;
  if (!list.length) {
    box.innerHTML = '<p class="empty">Aucun avis</p>';
    return;
  }
  const statusLabel = { pending: 'En attente', approved: 'Approuvé', rejected: 'Rejeté' };
  box.innerHTML = list.slice(0, 60).map((r) => {
    const st = r.status || 'pending';
    return `<div class="mkt-review-card" data-id="${esc(r.id)}">
      <div class="mkt-review-meta">
        <strong>${esc(r.authorName || 'Anonyme')}</strong>
        <span class="muted">${esc(r.productName || r.productId || '')}</span>
        <span>${'★'.repeat(r.rating || 0)}${'☆'.repeat(Math.max(0, 5 - (r.rating || 0)))}</span>
        <span class="badge ${esc(st)}">${esc(statusLabel[st] || st)}</span>
      </div>
      ${r.title ? `<div><strong>${esc(r.title)}</strong></div>` : ''}
      <div class="mkt-review-body">${esc(r.body || r.text || '')}</div>
      <div class="btn-row">
        ${st !== 'approved' ? `<button type="button" class="btn-outline btn-sm" onclick="moderateReview('${esc(r.id)}','approve')">Approuver</button>` : ''}
        ${st !== 'rejected' ? `<button type="button" class="btn-outline btn-sm" onclick="moderateReview('${esc(r.id)}','reject')">Rejeter</button>` : ''}
        <button type="button" class="btn-danger btn-sm" onclick="moderateReview('${esc(r.id)}','delete')">Suppr.</button>
      </div>
    </div>`;
  }).join('');
}

function renderMktCampaignHistory() {
  const box = document.getElementById('mktCampaignHistory');
  if (!box) return;
  const list = storeData.campaigns || [];
  if (!list.length) {
    box.innerHTML = '<p class="empty">Aucune campagne envoyée</p>';
    return;
  }
  box.innerHTML = list.slice(0, 20).map((c) => {
    const stats = c.stats || {};
    const when = (c.sentAt || '').toString().slice(0, 16).replace('T', ' ');
    return `<div class="mkt-camp-row">
      <div><strong>${esc(c.name || c.subject || c.id)}</strong>
        <div class="muted">${esc(c.template || '')} · ${esc(c.segment || '')} · ${esc(when)}</div>
      </div>
      <div class="muted">${stats.sent ?? 0}/${stats.attempted ?? stats.audience ?? 0} envoyés${stats.failed ? ` · ${stats.failed} échecs` : ''}</div>
    </div>`;
  }).join('');
}

function setMktSendEnabled(enabled) {
  const testBtn = document.getElementById('mktTestBtn');
  const sendBtn = document.getElementById('mktSendBtn');
  if (testBtn) testBtn.disabled = !enabled;
  if (sendBtn) sendBtn.disabled = !enabled;
  const hint = document.getElementById('mktResendHint');
  if (hint) hint.classList.toggle('hidden', enabled);
}

async function refreshMktResendStatus() {
  const el = document.getElementById('mktResendStatus');
  if (!el) return;
  try {
    const res = await fetch(apiUrl('/api/campaigns'), { headers: headers() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      el.textContent = data.error || 'Resend indisponible';
      el.className = 'mkt-status warn';
      setMktSendEnabled(false);
      return;
    }
    if (data.resendConfigured) {
      el.textContent = 'Resend OK';
      el.className = 'mkt-status ok';
      setMktSendEnabled(true);
    } else {
      el.textContent = 'Resend non configuré';
      el.className = 'mkt-status warn';
      setMktSendEnabled(false);
    }
  } catch {
    el.textContent = 'Resend indisponible';
    el.className = 'mkt-status warn';
    setMktSendEnabled(false);
  }
}

async function moderateReview(id, action) {
  try {
    const res = await fetch(apiUrl('/api/reviews'), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ id, action }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error || 'Erreur modération', 'error');
      return;
    }
    if (Array.isArray(data.reviews)) storeData.reviews = data.reviews;
    else if (action === 'delete') storeData.reviews = (storeData.reviews || []).filter((r) => r.id !== id);
    else {
      const r = (storeData.reviews || []).find((x) => x.id === id);
      if (r) r.status = action === 'approve' ? 'approved' : 'rejected';
    }
    renderMktReviews();
    toast(action === 'delete' ? 'Avis supprimé' : action === 'approve' ? 'Avis approuvé' : 'Avis rejeté', 'success');
  } catch (err) {
    toast('API avis indisponible', 'error');
    console.error(err);
  }
}
window.moderateReview = moderateReview;

async function runCampaign(action) {
  const payload = mktPayload(action);
  if ((action === 'test' || action === 'send') && document.getElementById('mktTestBtn')?.disabled) {
    toast('Configure Resend dans Netlify avant d’envoyer', 'error');
    return;
  }
  if (action === 'test' && !payload.to) {
    toast('Email test requis', 'error');
    return;
  }
  if (action === 'send' && !confirm(`Envoyer la campagne au segment « ${payload.segment} » ?`)) return;
  try {
    const res = await fetch(apiUrl('/api/campaigns'), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error || `Erreur ${action}`, 'error');
      return;
    }
    if (data.error) {
      toast(data.hint ? `${data.error} — ${data.hint}` : data.error, 'error');
    }
    if (action === 'preview' && data.html) {
      if (mktPreviewBlobUrl) URL.revokeObjectURL(mktPreviewBlobUrl);
      mktPreviewBlobUrl = URL.createObjectURL(new Blob([data.html], { type: 'text/html' }));
      const frame = document.getElementById('mktPreviewFrame');
      if (frame) frame.src = mktPreviewBlobUrl;
      toast('Aperçu chargé', 'success');
      return;
    }
    if (action === 'test' && data.ok) {
      toast('Email test envoyé', 'success');
      return;
    }
    if (action === 'send' && data.ok) {
      if (data.campaign) {
        if (!Array.isArray(storeData.campaigns)) storeData.campaigns = [];
        storeData.campaigns.unshift(data.campaign);
      }
      renderMktCampaignHistory();
      const s = data.campaign?.stats;
      toast(s ? `Campagne envoyée · ${s.sent}/${s.attempted} OK` : 'Campagne envoyée', 'success');
      return;
    }
    if (!data.error) toast(`Action ${action} terminée`);
  } catch (err) {
    toast('API campagnes indisponible', 'error');
    console.error(err);
  }
}

function renderMarketing() {
  document.getElementById('mktAnnouncement').value = storeData.site?.announcement || '';
  const discounts = storeData.discounts || [];
  document.getElementById('discountsList').innerHTML = discounts.map((d, i) => `
    <div class="discount-row">
      <input class="disc-code" data-i="${i}" value="${esc(d.code)}" placeholder="CODE">
      <select class="disc-type" data-i="${i}"><option value="percent" ${d.type==='percent'?'selected':''}>%</option><option value="fixed" ${d.type==='fixed'?'selected':''}>$</option></select>
      <input class="disc-value" data-i="${i}" type="number" value="${d.value}" min="0" title="Valeur">
      <input class="disc-min" data-i="${i}" type="number" value="${d.minCart || 0}" min="0" step="1" title="Panier min CAD" placeholder="Min $">
      <button type="button" onclick="removeDiscount(${i})">Suppr.</button>
    </div>`).join('') || '<p class="empty">Aucun code promo</p>';
  if (!mktDefaultsApplied) {
    applyMktTemplateDefaults();
    mktDefaultsApplied = true;
  }
  renderMktSubscribers();
  renderMktReviews();
  renderMktCampaignHistory();
  refreshMktResendStatus();
}

document.getElementById('addDiscountBtn')?.addEventListener('click', () => {
  if (!storeData.discounts) storeData.discounts = [];
  storeData.discounts.push({ code: 'PROMO10', type: 'percent', value: 10, active: true, minCart: 0 });
  renderMarketing();
});

window.removeDiscount = async (i) => {
  storeData.discounts.splice(i, 1);
  renderMarketing();
  await saveStore('Code supprimé');
};

function readDiscountsFromDOM() {
  const rows = [...document.querySelectorAll('#discountsList .discount-row')];
  // If marketing UI isn't mounted, never wipe existing discounts
  if (!rows.length && document.getElementById('discountsList')?.textContent?.includes('Aucun')) {
    return Array.isArray(storeData.discounts) ? storeData.discounts.slice() : [];
  }
  if (!rows.length) {
    return Array.isArray(storeData.discounts) ? storeData.discounts.slice() : [];
  }
  const prevByCode = Object.fromEntries(
    (storeData.discounts || [])
      .filter((d) => d && d.code)
      .map((d) => [String(d.code).toUpperCase(), d])
  );
  const fromDom = rows.map((r) => {
    const code = r.querySelector('.disc-code').value.trim().toUpperCase();
    const prev = prevByCode[code] || {};
    return {
      code,
      type: r.querySelector('.disc-type').value,
      value: parseFloat(r.querySelector('.disc-value').value) || 0,
      minCart: parseFloat(r.querySelector('.disc-min')?.value) || 0,
      active: true,
      ambassadorId: prev.ambassadorId || null,
      source: prev.source || (prev.ambassadorId ? 'ambassador' : 'manual'),
    };
  }).filter((d) => d.code);

  const domCodes = new Set(fromDom.map((d) => d.code));
  for (const d of storeData.discounts || []) {
    const code = String(d.code || '').toUpperCase();
    if (!code || domCodes.has(code)) continue;
    if (d.source === 'ambassador' || d.ambassadorId) {
      fromDom.push({
        ...d,
        code,
        active: d.active !== false,
        source: 'ambassador',
      });
    }
  }
  return fromDom;
}

async function saveMarketing() {
  storeData.site.announcement = document.getElementById('mktAnnouncement').value;
  storeData.discounts = readDiscountsFromDOM();
  await saveStore('Marketing sauvegardé');
}

document.getElementById('saveAnnouncementBtn')?.addEventListener('click', saveMarketing);
document.getElementById('saveDiscountsBtn')?.addEventListener('click', saveMarketing);
document.getElementById('mktTemplate')?.addEventListener('change', applyMktTemplateDefaults);
document.getElementById('mktPreviewBtn')?.addEventListener('click', () => runCampaign('preview'));
document.getElementById('mktTestBtn')?.addEventListener('click', () => runCampaign('test'));
document.getElementById('mktSendBtn')?.addEventListener('click', () => runCampaign('send'));

// Design form
function loadDesignForm() {
  const s = storeData.site || {};
  document.getElementById('siteName').value = s.name || '';
  document.getElementById('siteTagline').value = s.tagline || '';
  document.getElementById('siteHeroTitle').value = s.heroTitle || '';
  document.getElementById('siteHeroSubtitle').value = s.heroSubtitle || '';
  document.getElementById('siteHeroCta').value = s.heroCta || '';
  const hv = document.getElementById('siteHeroVideo');
  if (hv) hv.value = s.heroVideo || '';
  const fs = document.getElementById('siteFreeShipping');
  if (fs) fs.value = s.freeShippingThreshold ?? 150;
  document.getElementById('siteInstagram').value = s.instagram || '';
  document.getElementById('siteInstagramHandle').value = s.instagramHandle || '';
  document.getElementById('siteEmail').value = s.email || '';
  document.getElementById('sitePhone').value = s.phone || '';
  document.getElementById('emailCapTitle').value = s.emailCapture?.title || '';
  document.getElementById('emailCapSubtitle').value = s.emailCapture?.subtitle || '';
  document.getElementById('bundleTitle').value = s.bundle?.title || '';
  document.getElementById('bundleText').value = s.bundle?.text || '';
  if (s.heroImage) { document.getElementById('heroImagePreview').src = s.heroImage; document.getElementById('heroImagePreview').classList.remove('hidden'); }
  if (s.logo) { document.getElementById('logoPreview').src = s.logo; document.getElementById('logoPreview').classList.remove('hidden'); }
  renderCryptoEditor();
}

const DEFAULT_CRYPTO = [
  { label: 'Bitcoin', symbol: 'BTC', network: 'Bitcoin', address: '' },
  { label: 'Ethereum', symbol: 'ETH', network: 'ERC-20', address: '' },
  { label: 'USDT', symbol: 'USDT', network: 'TRC-20', address: '' },
];

function renderCryptoEditor() {
  const list = storeData.site?.crypto?.length ? storeData.site.crypto : DEFAULT_CRYPTO;
  document.getElementById('cryptoEditor').innerHTML = list.map((c) => `
    <div class="crypto-edit-row" data-symbol="${esc(c.symbol)}" data-label="${esc(c.label)}" data-network="${esc(c.network)}">
      <span class="crypto-edit-label">${esc(c.symbol)}</span>
      <input class="crypto-edit-addr" value="${esc(c.address)}" placeholder="Adresse wallet">
    </div>`).join('');
}

document.getElementById('siteForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  storeData.site = {
    ...storeData.site,
    name: document.getElementById('siteName').value,
    tagline: document.getElementById('siteTagline').value,
    heroTitle: document.getElementById('siteHeroTitle').value,
    heroSubtitle: document.getElementById('siteHeroSubtitle').value,
    heroCta: document.getElementById('siteHeroCta').value,
    heroVideo: document.getElementById('siteHeroVideo')?.value.trim() || '',
    freeShippingThreshold: parseFloat(document.getElementById('siteFreeShipping')?.value) || 150,
    heroImage: pendingHeroImage || storeData.site?.heroImage || '',
    logo: pendingLogo || storeData.site?.logo || '',
    instagram: document.getElementById('siteInstagram').value,
    instagramHandle: document.getElementById('siteInstagramHandle').value,
    email: document.getElementById('siteEmail').value,
    phone: document.getElementById('sitePhone').value,
    currency: 'CAD',
    emailCapture: { ...storeData.site?.emailCapture, title: document.getElementById('emailCapTitle').value, subtitle: document.getElementById('emailCapSubtitle').value },
    bundle: { title: document.getElementById('bundleTitle').value, text: document.getElementById('bundleText').value, cta: storeData.site?.bundle?.cta || 'Voir la collection' },
    crypto: [...document.querySelectorAll('#cryptoEditor .crypto-edit-row')].map((r) => ({
      symbol: r.dataset.symbol, label: r.dataset.label, network: r.dataset.network,
      address: r.querySelector('.crypto-edit-addr').value.trim(),
    })),
  };
  pendingHeroImage = pendingLogo = null;
  await saveStore('Design sauvegardé');
});

// Sections (reuse patterns)
const SECTION_ORDER_META = [
  ['trustBar', 'Confiance'],
  ['products', 'Boutique'],
  ['gallery', 'Galerie'],
  ['why', 'Pourquoi'],
  ['reviews', 'Avis'],
  ['emailCapture', 'Liste VIP'],
  ['faq', 'FAQ'],
  ['contact', 'Contact'],
  ['guarantee', 'Sécurité'],
];

function defaultSectionOrder() {
  return SECTION_ORDER_META.map(([k]) => k);
}

function getSectionOrder() {
  const raw = storeData.site?.sectionOrder;
  if (Array.isArray(raw) && raw.length) {
    const known = new Set(defaultSectionOrder());
    const cleaned = raw.filter((id) => known.has(id));
    defaultSectionOrder().forEach((id) => { if (!cleaned.includes(id)) cleaned.push(id); });
    return cleaned;
  }
  return defaultSectionOrder();
}

function renderSectionOrderEditor() {
  const box = document.getElementById('sectionOrderList');
  if (!box) return;
  const order = getSectionOrder();
  const labels = Object.fromEntries(SECTION_ORDER_META);
  box.innerHTML = order.map((id, i) => `
    <div class="section-order-row" data-id="${esc(id)}">
      <span>${esc(labels[id] || id)}</span>
      <div class="order-btns">
        <button type="button" class="btn-outline btn-sm" data-move="up" data-i="${i}" ${i === 0 ? 'disabled' : ''}>Haut</button>
        <button type="button" class="btn-outline btn-sm" data-move="down" data-i="${i}" ${i === order.length - 1 ? 'disabled' : ''}>Bas</button>
      </div>
    </div>`).join('');
  box.querySelectorAll('[data-move]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.i;
      const next = [...getSectionOrder()];
      const j = btn.dataset.move === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= next.length) return;
      [next[i], next[j]] = [next[j], next[i]];
      storeData.site = storeData.site || {};
      storeData.site.sectionOrder = next;
      renderSectionOrderEditor();
    });
  });
}

function renderSectionEditors() {
  const s = storeData.site || {};
  const sec = s.sections || {};
  document.getElementById('sectionToggles').innerHTML = [
    ['announcement','Annonce'],['trustBar','Confiance'],['gallery','Galerie'],
    ['why','Pourquoi'],['reviews','Avis'],['emailCapture','Liste VIP'],['faq','FAQ'],['guarantee','Sécurité'],
  ].map(([k,l]) => `<label class="toggle-item"><input type="checkbox" data-sec="${k}" ${sec[k]!==false?'checked':''}> ${l}</label>`).join('');
  // Force Signature/Bundle off (grillz mix retired)
  if (storeData.site) {
    storeData.site.sections = storeData.site.sections || {};
    storeData.site.sections.bundle = false;
    if (Array.isArray(storeData.site.sectionOrder)) {
      storeData.site.sectionOrder = storeData.site.sectionOrder.filter((id) => id !== 'bundle');
    }
  }
  renderSectionOrderEditor();
  document.getElementById('trustEditor').innerHTML = (s.trust||[]).map((t)=>trustRow(t)).join('');
  document.getElementById('whyEditor').innerHTML = (s.why||[]).map((w)=>whyRow(w)).join('');
  document.getElementById('faqEditor').innerHTML = (s.faq||[]).map((f)=>faqRow(f)).join('');
  document.getElementById('siteGuarantee').value = s.guarantee || '';
  document.getElementById('galleryTitle').value = s.galleryTitle || '';
  document.getElementById('gallerySubtitle').value = s.gallerySubtitle || '';
}

function trustRow(t) { return `<div class="editor-row"><input class="trust-icon" value="${esc(t.icon)}"><input class="trust-title" value="${esc(t.title)}"><input class="trust-text" value="${esc(t.text)}"><button type="button" class="del-row" onclick="this.parentElement.remove()">Suppr.</button></div>`; }
function whyRow(w) { return `<div class="editor-row col"><input class="why-title" value="${esc(w.title)}"><textarea class="why-text" rows="2">${esc(w.text)}</textarea><button type="button" class="del-row" onclick="this.parentElement.remove()">Suppr.</button></div>`; }
function faqRow(f) { return `<div class="editor-row col"><input class="faq-q" value="${esc(f.q)}"><textarea class="faq-a" rows="2">${esc(f.a)}</textarea><button type="button" class="del-row" onclick="this.parentElement.remove()">Suppr.</button></div>`; }

function galleryRow(g) {
  const handle = g.handle || '';
  const caption = g.caption || '';
  const postUrl = g.postUrl || '';
  const image = g.image || '';
  return `<div class="gallery-edit-row" data-gallery-row>
    <div class="upload-zone small gallery-upload">
      <img class="gallery-preview ${image ? '' : 'hidden'}" src="${esc(image)}" alt="">
      <span>${image ? '' : 'Photo'}</span>
      <input type="file" class="gallery-file" accept="image/*" hidden>
    </div>
    <div class="gallery-edit-fields">
      <input type="hidden" class="gallery-image" value="${esc(image)}">
      <input class="gallery-handle" value="${esc(handle)}" placeholder="@client">
      <input class="gallery-caption" value="${esc(caption)}" placeholder="Légende (optionnel)">
      <input class="gallery-post-url" value="${esc(postUrl)}" placeholder="Lien Instagram du post">
    </div>
    <button type="button" class="del-row" onclick="this.closest('[data-gallery-row]').remove()">Suppr.</button>
  </div>`;
}

function bindGalleryUploads(root = document.getElementById('galleryEditor')) {
  if (!root) return;
  root.querySelectorAll('.gallery-upload').forEach((zone) => {
    if (zone.dataset.bound) return;
    zone.dataset.bound = '1';
    const fileInput = zone.querySelector('.gallery-file');
    const preview = zone.querySelector('.gallery-preview');
    const hidden = zone.closest('[data-gallery-row]')?.querySelector('.gallery-image');
    zone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      if (!fileInput.files[0]) return;
      const dataUrl = await compressImage(fileInput.files[0], 800, 0.82);
      preview.src = dataUrl; preview.classList.remove('hidden');
      const span = zone.querySelector('span');
      if (span) span.textContent = '';
      if (hidden) hidden.value = dataUrl;
      toast('Photo optimisée');
    });
  });
}

function renderGalleryEditor() {
  const editor = document.getElementById('galleryEditor');
  if (!editor) return;
  const list = storeData.site?.gallery?.length ? storeData.site.gallery : [{ image: '', caption: '', handle: '', postUrl: '' }];
  editor.innerHTML = list.map(galleryRow).join('');
  bindGalleryUploads(editor);
}

function parseIgHandleFromUrl(raw) {
  try {
    let input = String(raw || '').trim();
    if (!/^https?:\/\//i.test(input)) input = `https://${input}`;
    const u = new URL(input);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[1] === 'p' || parts[1] === 'reel' || parts[1] === 'tv') {
      return `@${parts[0]}`;
    }
  } catch (_) { /* ignore */ }
  return '';
}

document.getElementById('addGalleryBtn')?.addEventListener('click', () => {
  const editor = document.getElementById('galleryEditor');
  editor.insertAdjacentHTML('beforeend', galleryRow({ image: '', caption: '', handle: '', postUrl: '' }));
  bindGalleryUploads(editor);
});

function clearIgSlidePicker() {
  const box = document.getElementById('igSlidePicker');
  if (!box) return;
  box.classList.add('hidden');
  box.innerHTML = '';
}

function persistGalleryFromEditor(msg) {
  storeData.site = storeData.site || {};
  storeData.site.gallery = [...document.querySelectorAll('#galleryEditor [data-gallery-row]')].map((r) => ({
    image: r.querySelector('.gallery-image')?.value || '',
    caption: r.querySelector('.gallery-caption')?.value || '',
    handle: r.querySelector('.gallery-handle')?.value || '',
    postUrl: r.querySelector('.gallery-post-url')?.value || '',
  })).filter((g) => g.image || g.handle || g.postUrl);
  return saveStore(msg);
}

function upsertGalleryRow({ image, caption, handle, postUrl }) {
  const editor = document.getElementById('galleryEditor');
  if (!editor) return;
  [...editor.querySelectorAll('[data-gallery-row]')].forEach((row) => {
    const img = row.querySelector('.gallery-image')?.value;
    const h = row.querySelector('.gallery-handle')?.value;
    const c = (row.querySelector('.gallery-caption')?.value || '').trim();
    const p = row.querySelector('.gallery-post-url')?.value;
    if (!img && !h && !p && (!c || c === 'Client MENES')) row.remove();
  });
  [...editor.querySelectorAll('[data-gallery-row]')].forEach((row) => {
    const p = row.querySelector('.gallery-post-url')?.value || '';
    const h = row.querySelector('.gallery-handle')?.value || '';
    if ((postUrl && p === postUrl) || (handle && h === handle && !row.querySelector('.gallery-image')?.value)) {
      row.remove();
    }
  });
  editor.insertAdjacentHTML('afterbegin', galleryRow({ image, caption, handle, postUrl }));
  bindGalleryUploads(editor);
}

async function fetchIgPost(url, extra = {}) {
  const res = await fetch(apiUrl('/api/instagram-post'), {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ url, ...extra }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.postUrl && !data.handle && !(data.slides || []).length) {
    throw new Error(data.error || 'Import impossible');
  }
  return data;
}

function showIgSlidePicker({ url, handle, caption, postUrl, slides, slideIndex, slidePickerMode }) {
  const box = document.getElementById('igSlidePicker');
  if (!box) return;
  const list = Array.isArray(slides) && slides.length
    ? slides
    : Array.from({ length: 10 }, (_, index) => ({ index, url: '', selected: index === 0, hasPreview: false }));

  box.classList.remove('hidden');
  const mode = slidePickerMode === 'previews' && list.some((s) => s.url)
    ? 'previews'
    : 'numbers';

  box.innerHTML = `
    <h4>Quelle slide montre MENES ?</h4>
    <p class="hint">${mode === 'previews'
      ? 'Clique la bonne image du carrousel.'
      : 'Instagram ne donne pas toutes les previews d’un coup. Clique le <strong>numéro de la slide</strong> (1 = première, 2 = deuxième…). On recharge exactement cette photo.'}</p>
    <div class="ig-slide-grid ${mode === 'numbers' ? 'ig-slide-numbers' : ''}">
      ${list.map((s) => {
        const n = s.index + 1;
        const selected = s.index === slideIndex ? 'is-selected' : '';
        if (mode === 'previews' && s.url) {
          return `<button type="button" class="ig-slide-card ${selected}" data-slide-index="${s.index}" data-img-index="${n}" data-slide-url="${esc(s.url)}" title="Slide ${n}">
            <span class="ig-slide-num">${n}</span>
            <img src="${esc(s.url)}" alt="Slide ${n}" loading="lazy" referrerpolicy="no-referrer">
          </button>`;
        }
        return `<button type="button" class="ig-slide-card ig-slide-num-only ${selected}" data-slide-index="${s.index}" data-img-index="${n}" title="Slide ${n}">
          <span class="ig-slide-big">${n}</span>
          <small>Slide ${n}</small>
        </button>`;
      }).join('')}
    </div>
    <p class="hint" style="margin-top:10px">Astuce : sur Instagram, va sur la bonne slide puis « Copier le lien » — le lien contient souvent <code>?img_index=…</code>.</p>`;

  box.querySelectorAll('.ig-slide-card').forEach((card) => {
    card.addEventListener('click', async () => {
      const idx = Number(card.dataset.slideIndex);
      const imgIndex = Number(card.dataset.imgIndex) || (idx + 1);
      const slideUrl = card.dataset.slideUrl || '';
      box.querySelectorAll('.ig-slide-card').forEach((c) => c.classList.remove('is-selected'));
      card.classList.add('is-selected', 'is-loading');
      try {
        const data = await fetchIgPost(url, {
          slideIndex: idx,
          imgIndex,
          slideUrl: slideUrl || undefined,
          forceImgIndex: true,
        });
        const image = data.image || '';
        if (!image) throw new Error('Impossible de télécharger cette slide — réessaie ou upload manuel');
        upsertGalleryRow({
          image,
          caption: data.caption || caption || '',
          handle: data.handle || handle || '',
          postUrl: data.postUrl || postUrl || url,
        });
        await persistGalleryFromEditor(`Slide ${imgIndex} choisie — visible en boutique`);
        toast(`Slide ${imgIndex} enregistrée`, 'ok');
        // Keep picker open so they can try another if wrong
        card.classList.remove('is-loading');
        if (data.slides?.length) {
          showIgSlidePicker({
            url,
            handle: data.handle || handle,
            caption: data.caption || caption,
            postUrl: data.postUrl || postUrl,
            slides: data.slides,
            slideIndex: Number.isFinite(data.slideIndex) ? data.slideIndex : idx,
            slidePickerMode: data.slidePickerMode,
          });
        }
      } catch (err) {
        toast(err.message || 'Choix de slide échoué', 'error');
        card.classList.remove('is-loading');
      }
    });
  });
}

document.getElementById('importIgPostBtn')?.addEventListener('click', async () => {
  const input = document.getElementById('galleryIgUrl');
  const btn = document.getElementById('importIgPostBtn');
  const url = (input?.value || '').trim();
  if (!url) { toast('Colle un lien Instagram', 'error'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Import…'; }
  clearIgSlidePicker();
  try {
    const data = await fetchIgPost(url);
    const handle = data.handle || parseIgHandleFromUrl(url) || '';
    const image = data.image || '';
    const caption = data.caption || '';
    const postUrl = data.postUrl || url;
    const slides = Array.isArray(data.slides) ? data.slides : [];

    upsertGalleryRow({ image, caption, handle, postUrl });
    await persistGalleryFromEditor(image ? `Importé ${handle || ''} — visible en boutique` : `${handle || 'Post'} ajouté`);

    // Always offer slide picker for carousels / numbered picks
    showIgSlidePicker({
      url,
      handle,
      caption,
      postUrl,
      slides: slides.length ? slides : Array.from({ length: 10 }, (_, index) => ({ index, url: '', selected: index === 0 })),
      slideIndex: Number.isFinite(data.slideIndex) ? data.slideIndex : 0,
      slidePickerMode: data.slidePickerMode || 'numbers',
    });
    toast(image
      ? 'Si ce n’est pas la bonne slide MENES, clique son numéro ci-dessous'
      : 'Choisis le numéro de la slide MENES ci-dessous');

    if (!image) {
      document.querySelector('#galleryEditor [data-gallery-row] .gallery-file')?.click();
    }
  } catch (err) {
    const handle = parseIgHandleFromUrl(url);
    if (handle) {
      upsertGalleryRow({ image: '', caption: '', handle, postUrl: url });
      await persistGalleryFromEditor(`${handle} ajouté`);
      toast('Ajoute la photo manuellement (case Photo)', 'error');
      document.querySelector('#galleryEditor [data-gallery-row] .gallery-file')?.click();
      if (input) input.value = '';
    } else {
      toast(err.message || 'Import Instagram échoué', 'error');
    }
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Importer le post'; }
});

document.getElementById('addTrustBtn')?.addEventListener('click', () => document.getElementById('trustEditor').insertAdjacentHTML('beforeend', trustRow({icon:'◆',title:'',text:''})));
document.getElementById('addWhyBtn')?.addEventListener('click', () => document.getElementById('whyEditor').insertAdjacentHTML('beforeend', whyRow({title:'',text:''})));
document.getElementById('addFaqBtn')?.addEventListener('click', () => document.getElementById('faqEditor').insertAdjacentHTML('beforeend', faqRow({q:'',a:''})));

document.getElementById('saveSectionsBtn')?.addEventListener('click', async () => {
  const sections = {};
  document.querySelectorAll('#sectionToggles input').forEach((cb) => { sections[cb.dataset.sec] = cb.checked; });
  sections.bundle = false;
  storeData.site.sections = sections;
  storeData.site.sectionOrder = getSectionOrder().filter((id) => id !== 'bundle');
  storeData.site.trust = [...document.querySelectorAll('#trustEditor .editor-row')].map((r) => ({ icon: r.querySelector('.trust-icon').value, title: r.querySelector('.trust-title').value, text: r.querySelector('.trust-text').value }));
  storeData.site.why = [...document.querySelectorAll('#whyEditor .editor-row')].map((r) => ({ title: r.querySelector('.why-title').value, text: r.querySelector('.why-text').value }));
  storeData.site.faq = [...document.querySelectorAll('#faqEditor .editor-row')].map((r) => ({ q: r.querySelector('.faq-q').value, a: r.querySelector('.faq-a').value }));
  storeData.site.guarantee = document.getElementById('siteGuarantee').value;
  storeData.site.galleryTitle = document.getElementById('galleryTitle').value;
  storeData.site.gallerySubtitle = document.getElementById('gallerySubtitle').value;
  storeData.site.gallery = [...document.querySelectorAll('#galleryEditor [data-gallery-row]')].map((r) => ({
    image: r.querySelector('.gallery-image')?.value || '',
    caption: r.querySelector('.gallery-caption')?.value || '',
    handle: r.querySelector('.gallery-handle')?.value || '',
    postUrl: r.querySelector('.gallery-post-url')?.value || '',
  })).filter((g) => g.image || g.handle || g.postUrl);
  await saveStore('Sections sauvegardées');
});

// Images
async function compressImage(file, maxW = 900, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxW) { h = Math.round((maxW / w) * h); w = maxW; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setupUpload(zoneId, fileId, previewId, cb) {
  const zone = document.getElementById(zoneId);
  const fileInput = document.getElementById(fileId);
  const preview = document.getElementById(previewId);
  zone?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', async () => {
    if (!fileInput.files[0]) return;
    const dataUrl = await compressImage(fileInput.files[0]);
    preview.src = dataUrl; preview.classList.remove('hidden'); cb(dataUrl);
    toast('Image optimisée');
  });
}

// Hero photo goes through the cropper; logo/favicon are simple
setupUploadWithCrop('heroUploadZone', 'heroImageFile', 'heroImagePreview', () => 'landscape', (d) => { pendingHeroImage = d; });
setupUpload('logoUploadZone', 'logoFile', 'logoPreview', (d) => { pendingLogo = d; });

function defaultAspectFor() {
  return storeData?.site?.theme?.productAspect || 'square';
}

// Product photo upload → studio (fond + crop) → append to the product gallery
(function initProductPhotoUpload() {
  const zone = document.getElementById('productUploadZone');
  const fileInput = document.getElementById('productImageFile');
  zone?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', () => {
    if (!fileInput.files[0]) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      openCropper(e.target.result, defaultAspectFor(), (dataUrl) => {
        productImagesState.push({ url: dataUrl, label: '' });
        renderProductImagesEditor();
      }, { studio: true });
    };
    reader.readAsDataURL(fileInput.files[0]);
    fileInput.value = '';
  });
})();

/* ---------- Appearance / Theme ---------- */
let pendingFavicon = null;

const AP_FIELDS = {
  apLanguage: 'language', apSeoTitle: 'seoTitle', apSeoDesc: 'seoDesc',
  apMode: 'mode', apAccent: 'accent', apAccentDark: 'accentDark',
  apBg: 'bg', apSurface: 'surface', apText: 'text',
  apHeadingFont: 'headingFont', apBodyFont: 'bodyFont',
  apAspect: 'productAspect', apImgFit: 'productImgFit', apImgHeight: 'productImgHeight', apGridMin: 'gridMin',
  apHeroHeight: 'heroHeight', apHeroOverlay: 'heroOverlay', apAnnBg: 'announceBg', apAnnColor: 'announceColor',
  apRadius: 'radius', apBtnRadius: 'buttonRadius',
};

const THEME_DEFAULTS = {
  mode: 'dark', accent: '#c9a84c', accentDark: '#e0c078', bg: '#050505', surface: '#0f0f0f', text: '#f4f2ee',
  headingFont: 'Syne', bodyFont: 'DM Sans', productAspect: 'portrait45', productImgFit: 'cover', productImgHeight: 360,
  gridMin: 260, heroHeight: 92, heroOverlay: 48, announceBg: '#050505', announceColor: '#c9a84c', radius: 2, buttonRadius: 2,
};

const OBSIDIAN_PRESET = { ...THEME_DEFAULTS };

function setVal(id, v) { const el = document.getElementById(id); if (el != null && v != null) el.value = v; }

function loadAppearanceForm() {
  const s = storeData.site || {};
  const th = { ...THEME_DEFAULTS, ...(s.theme || {}) };
  setVal('apLanguage', s.language || 'en');
  setVal('apSeoTitle', s.seo?.title || '');
  setVal('apSeoDesc', s.seo?.description || '');
  setVal('apMode', th.mode);
  setVal('apAccent', th.accent);
  setVal('apAccentDark', th.accentDark);
  setVal('apBg', th.bg);
  setVal('apSurface', th.surface);
  setVal('apText', th.text);
  setVal('apHeadingFont', th.headingFont);
  setVal('apBodyFont', th.bodyFont);
  setVal('apAspect', th.productAspect);
  setVal('apImgFit', th.productImgFit);
  setVal('apImgHeight', th.productImgHeight);
  setVal('apGridMin', th.gridMin);
  setVal('apHeroHeight', th.heroHeight);
  setVal('apHeroOverlay', th.heroOverlay);
  setVal('apAnnBg', th.announceBg);
  setVal('apAnnColor', th.announceColor);
  setVal('apRadius', th.radius);
  setVal('apBtnRadius', th.buttonRadius);
  toggleCustomColors();
  if (s.favicon) { const f = document.getElementById('faviconPreview'); if (f) { f.src = s.favicon; f.classList.remove('hidden'); } }
  const link = document.getElementById('appearancePreviewLink');
  if (link) link.href = document.getElementById('viewStoreLink')?.href || '/';
}

function toggleCustomColors() {
  const custom = document.getElementById('apMode')?.value === 'custom';
  document.getElementById('apCustomColors')?.classList.toggle('hidden', !custom);
}
document.getElementById('apMode')?.addEventListener('change', toggleCustomColors);

document.getElementById('applyObsidianPreset')?.addEventListener('click', async () => {
  storeData.site = storeData.site || {};
  storeData.site.theme = { ...OBSIDIAN_PRESET };
  loadAppearanceForm();
  await saveStore('Preset Obsidian & Carat appliqué');
});

document.getElementById('saveAppearanceBtn')?.addEventListener('click', async () => {
  const g = (id) => document.getElementById(id)?.value;
  const num = (id, d) => { const v = parseFloat(g(id)); return Number.isFinite(v) ? v : d; };
  storeData.site = storeData.site || {};
  storeData.site.language = g('apLanguage') || 'en';
  storeData.site.seo = { title: g('apSeoTitle') || '', description: g('apSeoDesc') || '' };
  if (pendingFavicon) storeData.site.favicon = pendingFavicon;
  storeData.site.theme = {
    mode: g('apMode') || 'light',
    accent: g('apAccent'), accentDark: g('apAccentDark'),
    bg: g('apBg'), surface: g('apSurface'), text: g('apText'),
    headingFont: g('apHeadingFont'), bodyFont: g('apBodyFont'),
    productAspect: g('apAspect'), productImgFit: g('apImgFit'),
    productImgHeight: num('apImgHeight', 320), gridMin: num('apGridMin', 280),
    heroHeight: num('apHeroHeight', 85), heroOverlay: num('apHeroOverlay', 55),
    announceBg: g('apAnnBg'), announceColor: g('apAnnColor'),
    radius: num('apRadius', 6), buttonRadius: num('apBtnRadius', 6),
  };
  pendingFavicon = null;
  await saveStore('Apparence sauvegardée. Rafraîchis ta boutique.');
});

document.getElementById('resetAppearanceBtn')?.addEventListener('click', async () => {
  if (!confirm('Réinitialiser toute l\'apparence aux valeurs par défaut?')) return;
  storeData.site.theme = { ...THEME_DEFAULTS };
  storeData.site.language = 'en';
  loadAppearanceForm();
  await saveStore('Apparence réinitialisée');
});

setupUpload('faviconUploadZone', 'faviconFile', 'faviconPreview', (d) => { pendingFavicon = d; });

/* ---------- Image studio (crop + remove BG + backgrounds) ---------- */
const CROP_ASPECTS = { square: 1, portrait45: 4 / 5, portrait34: 3 / 4, landscape: 16 / 9, wide: 3 / 2, free: 0 };
const BG_PRESETS = [
  { id: 'original', label: 'Original', type: 'original' },
  { id: 'transparent', label: 'Transparent', type: 'transparent' },
  { id: 'white', label: 'Blanc', type: 'color', color: '#ffffff' },
  { id: 'soft', label: 'Gris', type: 'color', color: '#f0f0f0' },
  { id: 'studio', label: 'Studio', type: 'gradient', colors: ['#fafafa', '#e4e4e4'] },
  { id: 'cream', label: 'Crème', type: 'color', color: '#f3eee6' },
  { id: 'charcoal', label: 'Charbon', type: 'color', color: '#1c1c1c' },
  { id: 'black', label: 'Noir', type: 'color', color: '#000000' },
  { id: 'custom', label: 'Perso', type: 'custom' },
  { id: 'image', label: 'Image', type: 'image' },
];

let cropImg = null;
let cropCutout = null;
let cropComposited = null;
let cropBgImg = null;
let cropCb = null;
let cropStudio = false;
let cropBgPreset = 'original';
let cropScale = 1;
let cropQuarter = 0; // 0..3 → 0° / 90° / 180° / 270°
let cropStraighten = 0; // -45..45
let cropOffX = 0.5;
let cropOffY = 0.5;
let cropDragging = false;
let cropLast = null;
let cropBusy = false;

function cropRotationDeg() {
  return cropQuarter * 90 + cropStraighten;
}

function syncRotateUi() {
  const slider = document.getElementById('cropRotate');
  const val = document.getElementById('cropRotVal');
  if (slider) slider.value = String(cropStraighten);
  if (val) {
    const total = cropRotationDeg();
    val.textContent = `${total % 1 === 0 ? total : total.toFixed(1)}°`;
  }
}

function colorDist(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function getCutTightness() {
  return parseInt(document.getElementById('cropBgTolerance')?.value || '2', 10);
}

function setScanUi(active, text) {
  const overlay = document.getElementById('cropScanOverlay');
  const stage = document.getElementById('cropStage');
  const label = document.getElementById('cropScanText');
  if (label && text) label.textContent = text;
  overlay?.classList.toggle('hidden', !active);
  stage?.classList.toggle('is-scanning', !!active);
  if (overlay) overlay.setAttribute('aria-hidden', active ? 'false' : 'true');
}

/** Soft edge clean — removes halo without eating into the product. */
function tightenCutout(canvas, radius) {
  if (!radius || radius < 1) return canvas;
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const alpha = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3];

  let mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = alpha[i] < 12 ? 1 : 0;

  for (let pass = 0; pass < radius; pass++) {
    const next = new Uint8Array(mask);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (mask[i]) continue;
        // Only nibble semi-transparent / fringe pixels, not solid product
        if (alpha[i] > 220) continue;
        if (mask[i - 1] || mask[i + 1] || mask[i - w] || mask[i + w]) next[i] = 1;
      }
    }
    mask = next;
  }

  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    data[i * 4 + 3] = 0;
  }

  // Gentle anti-alias on the new edge
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const a = data[i * 4 + 3];
      if (a < 40 || a > 230) continue;
      const nearClear = data[(i - 1) * 4 + 3] < 12 || data[(i + 1) * 4 + 3] < 12
        || data[(i - w) * 4 + 3] < 12 || data[(i + w) * 4 + 3] < 12;
      if (nearClear) data[i * 4 + 3] = Math.round(a * 0.65);
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Fallback: flood-fill from edges (fond uni only). */
function removeBackgroundFromImage(img, tightness) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const pts = [
    [2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3],
    [(w / 2) | 0, 2], [(w / 2) | 0, h - 3], [2, (h / 2) | 0], [w - 3, (h / 2) | 0],
    [(w / 4) | 0, 2], [(3 * w / 4) | 0, 2], [2, (h / 4) | 0], [w - 3, (3 * h / 4) | 0],
  ];
  let sr = 0; let sg = 0; let sb = 0;
  pts.forEach(([x, y]) => {
    const i = (y * w + x) * 4;
    sr += data[i]; sg += data[i + 1]; sb += data[i + 2];
  });
  sr /= pts.length; sg /= pts.length; sb /= pts.length;

  const tolerance = 52 + Math.min(24, tightness * 4);
  const visited = new Uint8Array(w * h);
  const queue = [];
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (visited[idx]) return;
    const i = idx * 4;
    if (colorDist(data[i], data[i + 1], data[i + 2], sr, sg, sb) <= tolerance) {
      visited[idx] = 1;
      queue.push(idx);
    }
  };
  for (let x = 0; x < w; x++) { enqueue(x, 0); enqueue(x, h - 1); }
  for (let y = 0; y < h; y++) { enqueue(0, y); enqueue(w - 1, y); }

  while (queue.length) {
    const idx = queue.pop();
    const x = idx % w;
    const y = (idx / w) | 0;
    enqueue(x + 1, y); enqueue(x - 1, y); enqueue(x, y + 1); enqueue(x, y - 1);
  }

  for (let grow = 0; grow < 2 + Math.min(3, tightness); grow++) {
    const add = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        if (visited[idx]) continue;
        const near = visited[idx - 1] || visited[idx + 1] || visited[idx - w] || visited[idx + w];
        if (!near) continue;
        const i = idx * 4;
        if (colorDist(data[i], data[i + 1], data[i + 2], sr, sg, sb) <= tolerance + 16) add.push(idx);
      }
    }
    add.forEach((idx) => { visited[idx] = 1; });
  }

  for (let idx = 0; idx < w * h; idx++) {
    if (visited[idx]) data[idx * 4 + 3] = 0;
  }

  ctx.putImageData(imageData, 0, 0);
  return tightenCutout(canvas, Math.max(1, tightness));
}

function imageElementToBlob(img, maxSide = 1600) {
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/jpeg', 0.92);
  });
}

function blobToCutoutCanvas(blob) {
  return createImageBitmap(blob).then((bitmap) => {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    bitmap.close?.();
    return canvas;
  });
}

let bgRemoveLoader = null;

async function loadAiBackgroundRemover() {
  if (bgRemoveLoader) return bgRemoveLoader;
  bgRemoveLoader = (async () => {
    try {
      const ort = await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/+esm');
      if (ort?.env?.wasm) {
        ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/';
        ort.env.wasm.numThreads = 1;
      }
    } catch (_) { /* imgly may still load its own ort */ }

    const mod = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm');
    const fn = mod.removeBackground || mod.default;
    if (typeof fn !== 'function') throw new Error('Module IA invalide');
    return fn;
  })().catch((err) => {
    bgRemoveLoader = null;
    throw err;
  });
  return bgRemoveLoader;
}

async function removeBackgroundAI(img, tightness, onProgress) {
  const removeBackground = await loadAiBackgroundRemover();
  onProgress?.('Préparation du scan…');
  const inputBlob = await imageElementToBlob(img, 1600);
  onProgress?.('Scan IA du produit…');
  const blob = await removeBackground(inputBlob, {
    model: 'medium',
    proxyToWorker: true,
    device: 'gpu',
    publicPath: 'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/',
    progress: (key, current, total) => {
      if (!total) onProgress?.(key === 'fetch:model' ? 'Téléchargement du modèle de scan…' : `Scan : ${key}…`);
      else onProgress?.(`Scan du produit… ${Math.round((100 * current) / total)}%`);
    },
    output: { format: 'image/png', quality: 0.95, type: 'foreground' },
  });
  onProgress?.('Finition des contours…');
  const canvas = await blobToCutoutCanvas(blob);
  return tightenCutout(canvas, tightness);
}

function getActiveBgPreset() {
  return BG_PRESETS.find((p) => p.id === cropBgPreset) || BG_PRESETS[0];
}

function rebuildCropComposite() {
  if (!cropImg) { cropComposited = null; return; }
  if (!cropCutout || cropBgPreset === 'original') {
    cropComposited = null;
    return;
  }
  const src = cropCutout;
  const w = src.width;
  const h = src.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const preset = getActiveBgPreset();

  if (preset.type === 'transparent') {
    // keep alpha — no fill
  } else if (preset.type === 'color' || (preset.type === 'custom')) {
    const color = preset.type === 'custom'
      ? (document.getElementById('cropBgColor')?.value || '#ffffff')
      : preset.color;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
  } else if (preset.type === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, preset.colors[0]);
    g.addColorStop(1, preset.colors[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  } else if (preset.type === 'image' && cropBgImg) {
    const scale = Math.max(w / cropBgImg.width, h / cropBgImg.height);
    const dw = cropBgImg.width * scale;
    const dh = cropBgImg.height * scale;
    ctx.drawImage(cropBgImg, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else if (preset.type === 'image') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  }

  ctx.drawImage(src, 0, 0);
  cropComposited = canvas;
}

function cropSource() {
  if (!cropCutout || cropBgPreset === 'original') return cropImg;
  return cropComposited || cropCutout;
}

function setCropStatus(msg) {
  const el = document.getElementById('cropBgStatus');
  if (el) el.textContent = msg || '';
}

function syncStudioUi() {
  const tools = document.getElementById('studioTools');
  const title = document.getElementById('cropperTitle');
  const hint = document.getElementById('cropperHint');
  tools?.classList.toggle('hidden', !cropStudio);
  if (title) title.textContent = cropStudio ? 'Studio photo produit' : 'Recadrer la photo';
  if (hint) {
    hint.textContent = cropStudio
      ? 'Scanner & découper : un faisceau scanne la photo, détecte le produit et coupe tout autour (comme Canva).'
      : 'Tourne ou redresse la photo, zoome et glisse pour positionner.';
  }
  document.getElementById('cropRestoreBtn')?.classList.toggle('hidden', !cropCutout);
  const tol = document.getElementById('cropBgTolerance');
  const tolVal = document.getElementById('cropTolVal');
  if (tol && tolVal) tolVal.textContent = tol.value;
  renderBgPresets();
}

function renderBgPresets() {
  const box = document.getElementById('bgPresets');
  if (!box) return;
  box.innerHTML = BG_PRESETS.map((p) => {
    let style = '';
    let extra = '';
    if (p.type === 'transparent' || p.type === 'original') extra = ' is-checker';
    if (p.type === 'color') style = `background:${p.color}`;
    if (p.type === 'gradient') style = `background:linear-gradient(180deg,${p.colors[0]},${p.colors[1]})`;
    if (p.type === 'custom') style = `background:${document.getElementById('cropBgColor')?.value || '#ffffff'}`;
    if (p.type === 'image' && cropBgImg) style = `background-image:url(${cropBgImg.src});background-size:cover;background-position:center`;
    if (p.type === 'image' && !cropBgImg) extra = ' is-checker';
    const active = cropBgPreset === p.id ? ' active' : '';
    return `<button type="button" class="bg-preset${extra}${active}" data-bg="${p.id}" title="${p.label}" style="${style}"><span>${p.label}</span></button>`;
  }).join('');
  box.querySelectorAll('.bg-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.bg;
      if (id === 'image' && !cropBgImg) {
        document.getElementById('cropBgFile')?.click();
        return;
      }
      if ((id === 'transparent' || id === 'custom' || id === 'image' || id === 'white' || id === 'soft'
        || id === 'studio' || id === 'cream' || id === 'charcoal' || id === 'black') && !cropCutout && id !== 'original') {
        // Allow picking BG before remove — auto-remove first for non-original
        if (id !== 'original') {
          runRemoveBackground().then(() => {
            cropBgPreset = id;
            rebuildCropComposite();
            syncStudioUi();
            drawCropPreview();
          });
          return;
        }
      }
      cropBgPreset = id;
      rebuildCropComposite();
      syncStudioUi();
      drawCropPreview();
    });
  });
}

async function runRemoveBackground() {
  if (!cropImg || cropBusy) return;
  cropBusy = true;
  const btn = document.getElementById('cropRemoveBgBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Scan en cours…'; }
  const tightness = getCutTightness();
  const minScanMs = 2200;
  const started = Date.now();
  setScanUi(true, 'Scan du produit…');
  setCropStatus('Scan en cours — détection du produit…');

  const updateProgress = (msg) => {
    setCropStatus(msg);
    setScanUi(true, msg);
  };

  try {
    let usedAi = true;
    try {
      cropCutout = await removeBackgroundAI(cropImg, tightness, updateProgress);
      updateProgress('Produit détecté — découpe terminée');
    } catch (aiErr) {
      console.warn('AI cutout failed, fallback', aiErr);
      usedAi = false;
      updateProgress('Scan local du fond…');
      await new Promise((r) => setTimeout(r, 400));
      cropCutout = removeBackgroundFromImage(cropImg, tightness);
    }
    const wait = Math.max(0, minScanMs - (Date.now() - started));
    if (wait) await new Promise((r) => setTimeout(r, wait));

    if (cropBgPreset === 'original') cropBgPreset = 'transparent';
    rebuildCropComposite();
    setCropStatus(usedAi
      ? 'Produit découpé — choisis un arrière-plan'
      : 'Découpe rapide (fond uni) — choisis un fond');
    toast(usedAi ? 'Scan terminé — produit découpé' : 'Découpe appliquée');
  } catch (err) {
    console.error(err);
    toast('Impossible de scanner / découper', 'error');
    setCropStatus('');
  }

  setScanUi(false);
  if (btn) { btn.disabled = false; btn.textContent = 'Scanner & découper'; }
  cropBusy = false;
  syncStudioUi();
  drawCropPreview();
}

function openCropper(src, aspectKey, cb, opts = {}) {
  cropStudio = !!opts.studio;
  cropCutout = null;
  cropComposited = null;
  cropBgImg = null;
  cropBgPreset = 'original';
  cropImg = new Image();
  cropImg.onload = () => {
    cropCb = cb;
    cropScale = 1; cropQuarter = 0; cropStraighten = 0; cropOffX = 0.5; cropOffY = 0.5;
    const sel = document.getElementById('cropAspect');
    if (sel && CROP_ASPECTS[aspectKey] !== undefined) sel.value = aspectKey || 'square';
    document.getElementById('cropZoom').value = 1;
    syncRotateUi();
    syncStudioUi();
    document.getElementById('cropperModal').classList.remove('hidden');
    drawCropPreview();
  };
  cropImg.onerror = () => toast('Image illisible', 'error');
  cropImg.crossOrigin = 'anonymous';
  cropImg.src = src;
}

function currentAspect() {
  const key = document.getElementById('cropAspect')?.value || 'square';
  const ar = CROP_ASPECTS[key];
  const src = cropSource();
  return ar || (src ? src.width / src.height : 1);
}

function drawCrop(ctx, cw, ch, mode = 'preview') {
  const src = cropSource();
  if (!src) return;
  const sw = src.width || src.naturalWidth;
  const sh = src.height || src.naturalHeight;
  const rad = (cropRotationDeg() * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  // Bounding box of the rotated image (scale 1)
  const bw = sw * cos + sh * sin;
  const bh = sw * sin + sh * cos;
  const base = Math.max(cw / bw, ch / bh);
  const s = base * cropScale;
  const overX = Math.max(0, bw * s - cw);
  const overY = Math.max(0, bh * s - ch);
  const panX = (0.5 - cropOffX) * overX;
  const panY = (0.5 - cropOffY) * overY;
  const keepAlpha = cropCutout && getActiveBgPreset().type === 'transparent';

  if (mode === 'preview') {
    ctx.clearRect(0, 0, cw, ch);
    if (keepAlpha) {
      const size = 12;
      for (let y = 0; y < ch; y += size) {
        for (let x = 0; x < cw; x += size) {
          ctx.fillStyle = ((x / size + y / size) | 0) % 2 ? '#d0d0d0' : '#f5f5f5';
          ctx.fillRect(x, y, size, size);
        }
      }
    }
  } else if (keepAlpha) {
    ctx.clearRect(0, 0, cw, ch);
  }

  ctx.save();
  ctx.translate(cw / 2 + panX, ch / 2 + panY);
  ctx.rotate(rad);
  ctx.drawImage(src, -(sw * s) / 2, -(sh * s) / 2, sw * s, sh * s);
  ctx.restore();
}

function drawCropPreview() {
  if (!cropImg) return;
  const stage = document.getElementById('cropStage');
  const canvas = document.getElementById('cropCanvas');
  const ar = currentAspect();
  const maxW = Math.min(stage.clientWidth || 340, 400);
  let cw = maxW;
  let ch = Math.round(cw / ar);
  const maxH = 380;
  if (ch > maxH) { ch = maxH; cw = Math.round(ch * ar); }
  canvas.width = cw; canvas.height = ch;
  drawCrop(canvas.getContext('2d'), cw, ch, 'preview');
}

document.getElementById('cropAspect')?.addEventListener('change', () => { cropOffX = 0.5; cropOffY = 0.5; drawCropPreview(); });
document.getElementById('cropZoom')?.addEventListener('input', (e) => { cropScale = parseFloat(e.target.value); drawCropPreview(); });
document.getElementById('cropRotate')?.addEventListener('input', (e) => {
  cropStraighten = parseFloat(e.target.value) || 0;
  syncRotateUi();
  drawCropPreview();
});
document.getElementById('cropRotLeft')?.addEventListener('click', () => {
  cropQuarter = (cropQuarter + 3) % 4;
  syncRotateUi();
  drawCropPreview();
});
document.getElementById('cropRotRight')?.addEventListener('click', () => {
  cropQuarter = (cropQuarter + 1) % 4;
  syncRotateUi();
  drawCropPreview();
});
document.getElementById('cropRotReset')?.addEventListener('click', () => {
  cropQuarter = 0;
  cropStraighten = 0;
  syncRotateUi();
  drawCropPreview();
});

document.getElementById('cropRemoveBgBtn')?.addEventListener('click', () => runRemoveBackground());
document.getElementById('cropRestoreBtn')?.addEventListener('click', () => {
  cropCutout = null;
  cropComposited = null;
  cropBgPreset = 'original';
  setCropStatus('');
  syncStudioUi();
  drawCropPreview();
  toast('Original restauré');
});
document.getElementById('cropBgTolerance')?.addEventListener('input', (e) => {
  const tolVal = document.getElementById('cropTolVal');
  if (tolVal) tolVal.textContent = e.target.value;
});
document.getElementById('cropBgTolerance')?.addEventListener('change', () => {
  if (cropCutout) runRemoveBackground();
});
document.getElementById('cropBgColor')?.addEventListener('input', () => {
  cropBgPreset = 'custom';
  if (!cropCutout) {
    runRemoveBackground().then(() => {
      cropBgPreset = 'custom';
      rebuildCropComposite();
      syncStudioUi();
      drawCropPreview();
    });
    return;
  }
  rebuildCropComposite();
  syncStudioUi();
  drawCropPreview();
});
document.getElementById('cropBgUploadBtn')?.addEventListener('click', () => document.getElementById('cropBgFile')?.click());
document.getElementById('cropBgFile')?.addEventListener('change', () => {
  const file = document.getElementById('cropBgFile')?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      cropBgImg = img;
      const apply = () => {
        cropBgPreset = 'image';
        rebuildCropComposite();
        syncStudioUi();
        drawCropPreview();
        toast('Fond image appliqué');
      };
      if (!cropCutout) runRemoveBackground().then(apply);
      else apply();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  document.getElementById('cropBgFile').value = '';
});

function cropPointer(e) {
  const t = e.touches ? e.touches[0] : e;
  return { x: t.clientX, y: t.clientY };
}
const cropCanvasEl = document.getElementById('cropCanvas');
function cropStart(e) { cropDragging = true; cropLast = cropPointer(e); }
function cropMove(e) {
  if (!cropDragging || !cropImg) return;
  const p = cropPointer(e);
  const canvas = document.getElementById('cropCanvas');
  const src = cropSource();
  const sw = src.width || src.naturalWidth;
  const sh = src.height || src.naturalHeight;
  const rad = (cropRotationDeg() * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const bw = sw * cos + sh * sin;
  const bh = sw * sin + sh * cos;
  const base = Math.max(canvas.width / bw, canvas.height / bh) * cropScale;
  const overX = Math.max(0, bw * base - canvas.width);
  const overY = Math.max(0, bh * base - canvas.height);
  if (overX > 0) cropOffX = Math.min(1, Math.max(0, cropOffX - (p.x - cropLast.x) / overX));
  if (overY > 0) cropOffY = Math.min(1, Math.max(0, cropOffY - (p.y - cropLast.y) / overY));
  cropLast = p;
  drawCropPreview();
  e.preventDefault();
}
function cropEnd() { cropDragging = false; }
cropCanvasEl?.addEventListener('mousedown', cropStart);
window.addEventListener('mousemove', cropMove);
window.addEventListener('mouseup', cropEnd);
cropCanvasEl?.addEventListener('touchstart', cropStart, { passive: false });
cropCanvasEl?.addEventListener('touchmove', cropMove, { passive: false });
cropCanvasEl?.addEventListener('touchend', cropEnd);

document.getElementById('cropCancelBtn')?.addEventListener('click', () => document.getElementById('cropperModal').classList.add('hidden'));

document.getElementById('cropApplyBtn')?.addEventListener('click', () => {
  if (!cropImg || !cropCb) return;
  const ar = currentAspect();
  const outW = 1080;
  const outH = Math.round(outW / ar);
  const canvas = document.createElement('canvas');
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext('2d');
  const preset = getActiveBgPreset();
  const keepAlpha = cropCutout && preset.type === 'transparent';
  if (!keepAlpha) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
  }
  drawCrop(ctx, outW, outH, 'export');
  const dataUrl = keepAlpha
    ? canvas.toDataURL('image/png')
    : canvas.toDataURL('image/jpeg', 0.88);
  cropCb(dataUrl);
  document.getElementById('cropperModal').classList.add('hidden');
  toast(cropStudio ? 'Photo studio appliquée' : 'Photo recadrée');
});

function setupUploadWithCrop(zoneId, fileId, previewId, aspectFn, cb) {
  const zone = document.getElementById(zoneId);
  const fileInput = document.getElementById(fileId);
  const preview = document.getElementById(previewId);
  zone?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', async () => {
    if (!fileInput.files[0]) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      openCropper(e.target.result, aspectFn(), (dataUrl) => {
        preview.src = dataUrl; preview.classList.remove('hidden');
        cb(dataUrl);
      }, { studio: false });
    };
    reader.readAsDataURL(fileInput.files[0]);
    fileInput.value = '';
  });
}

// ——— Ambassadors ———
async function ambApi(action, { method = 'GET', body } = {}) {
  const q = method === 'GET' ? `?action=${encodeURIComponent(action)}` : '?action=' + encodeURIComponent(action);
  const res = await fetch(apiUrl(`/api/ambassador-admin${q}`), {
    method,
    headers: headers(),
    body: body ? JSON.stringify({ ...body, action }) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur Ambassador API');
  return data;
}

function moneyCad(n) {
  return `${(Number(n) || 0).toFixed(2)}$`;
}

async function renderAmbassadors() {
  try {
    // Load list/overview first so create/approve never depends on commissions
    const [overview, list, commissionsRes, emailStatus] = await Promise.all([
      ambApi('overview'),
      ambApi('list'),
      ambApi('commissions').catch((err) => ({ commissions: [], _error: err.message })),
      ambApi('email-status').catch(() => ({ emailConfigured: false })),
    ]);
    const statusEl = document.getElementById('ambEmailStatus');
    if (statusEl) {
      const p = emailStatus.providers || {};
      const active = [p.brevo && 'Brevo', p.smtp && 'Gmail/SMTP', p.resend && 'Resend'].filter(Boolean).join(' + ');
      statusEl.textContent = emailStatus.configured || emailStatus.emailConfigured
        ? `Emails OK${active ? ` · ${active}` : ''}${emailStatus.from ? ` · from ${emailStatus.from}` : ''}`
        : '⚠ Emails OFF — ajoute sur Netlify (boutiquemenes) : BREVO_API_KEY + EMAIL_FROM (gratuit) · ou SMTP_USER + SMTP_PASS (Gmail)';
    }
    const commissions = commissionsRes || { commissions: [] };
    const s = overview.stats || {};
    const grid = document.getElementById('ambStatsGrid');
    if (grid) {
      grid.innerHTML = [
        ['Ambassadeurs', s.totalAmbassadors],
        ['Actifs', s.activeAmbassadors],
        ['En attente', s.pendingAmbassadors],
        ['Ventes amb.', moneyCad(s.totalAmbassadorSales)],
        ['Commissions', moneyCad(s.totalCommissions)],
        ['Pending', moneyCad(s.pendingCommissions)],
        ['Disponibles', moneyCad(s.availableCommissions)],
        ['Payées', moneyCad(s.paidCommissions)],
      ].map(([l, v]) => `<div class="stat-card"><span class="stat-label">${l}</span><strong class="stat-value">${v}</strong></div>`).join('');
    }

    const settings = overview.settings || {};
    const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
    set('ambSetPersonal', settings.personalCommission);
    set('ambSetL1', settings.referralLevel1);
    set('ambSetL2', settings.referralLevel2);
    set('ambSetAttr', settings.attributionDays);
    set('ambSetPending', settings.pendingDays);
    set('ambSetMinPay', settings.minPayout);
    set('ambSetApproval', String(settings.requireApproval !== false));
    set('ambSetShop', settings.shopBaseUrl || '');

    const weeklyBoard = document.getElementById('ambWeeklyXpBoard');
    if (weeklyBoard) {
      const contest = overview.weeklyXpContest || {};
      const prizes = contest.prizes || [3, 2, 1];
      const rows = (contest.leaderboard || []).slice(0, 5).map((r) => {
        const prize = r.place <= 3 ? ` · +${prizes[r.place - 1]}$` : '';
        return `${r.place}. ${esc(r.displayName || '—')} — ${r.xp || 0} XP${prize}`;
      });
      const last = contest.lastSettlement?.winners?.length
        ? `<br><br>Dernière semaine (${esc(contest.lastSettlement.weekKey)}) : ${contest.lastSettlement.winners.map((w) => `${w.place}. ${esc(w.displayName)} (+${w.amount}$)`).join(' · ')}`
        : '';
      weeklyBoard.innerHTML = rows.length
        ? `<strong>${esc(contest.weekKey || '')}</strong><br>${rows.join('<br>')}${last}`
        : 'Aucun XP cette semaine encore.';
    }

    const ambs = list.ambassadors || [];
    const byId = Object.fromEntries(ambs.map((a) => [a.id, a]));

    renderTeamTreeEditor(ambs);

    const ambList = document.getElementById('ambList');
    if (ambList) {
      const rows = ambs.map((a) => {
        const parent = a.referredBy ? byId[a.referredBy] : null;
        return `
        <tr>
          <td><strong>${esc(a.displayName)}</strong><br><span class="hint">${esc(a.email)}</span></td>
          <td><span class="badge">${esc(a.status)}</span></td>
          <td>${esc(a.rankId)} · ${a.xp || 0} XP</td>
          <td>${esc(a.slug)}<br><code>${esc(a.promoCode)}</code></td>
          <td>${parent ? esc(parent.displayName) : '<span class="hint">— racine —</span>'}</td>
          <td>${moneyCad(a.stats?.personalSales)} / ${a.stats?.personalOrders || 0}</td>
          <td>${moneyCad(a.stats?.totalEarned)}</td>
          <td class="btn-row">
            ${a.status === 'pending' ? `<button type="button" class="btn-primary btn-sm" data-amb-approve="${a.id}">Approuver</button>` : ''}
            ${a.status === 'active' ? `<button type="button" class="btn-outline btn-sm" data-amb-resend="${a.id}">Renvoyer email</button>` : ''}
            ${a.status === 'active' ? `<button type="button" class="btn-outline btn-sm" data-amb-suspend="${a.id}">Suspendre</button>` : ''}
            ${a.status === 'suspended' ? `<button type="button" class="btn-outline btn-sm" data-amb-reactivate="${a.id}">Réactiver</button>` : ''}
            <button type="button" class="btn-danger btn-sm" data-amb-delete="${a.id}">Suppr.</button>
          </td>
        </tr>`;
      }).join('');
      ambList.innerHTML = `<table class="data-table"><thead><tr>
        <th>Ambassador</th><th>Statut</th><th>Rang</th><th>Lien / Code</th><th>Parrain</th><th>Ventes</th><th>Gains</th><th></th>
      </tr></thead><tbody>${rows || '<tr><td colspan="8">Aucun ambassadeur</td></tr>'}</tbody></table>`;
      ambList.querySelectorAll('[data-amb-approve]').forEach((b) => b.addEventListener('click', async () => {
        const data = await ambApi('approve', { method: 'POST', body: { id: b.dataset.ambApprove } });
        if (data.email?.ok) toast('Approuvé · email envoyé', 'ok');
        else toast(`Approuvé · email ÉCHEC: ${data.email?.error || (data.emailConfigured === false ? 'Resend non configuré' : 'inconnu')}`, 'error');
        renderAmbassadors();
      }));
      ambList.querySelectorAll('[data-amb-resend]').forEach((b) => b.addEventListener('click', async () => {
        try {
          const data = await ambApi('resend-welcome', { method: 'POST', body: { id: b.dataset.ambResend } });
          if (data.email?.ok) toast('Email renvoyé', 'ok');
          else toast(`Email échec: ${data.email?.error || 'Resend?'}`, 'error');
        } catch (err) {
          toast(err.message, 'error');
        }
      }));
      ambList.querySelectorAll('[data-amb-suspend]').forEach((b) => b.addEventListener('click', async () => {
        await ambApi('suspend', { method: 'POST', body: { id: b.dataset.ambSuspend } });
        toast('Suspendu'); renderAmbassadors();
      }));
      ambList.querySelectorAll('[data-amb-reactivate]').forEach((b) => b.addEventListener('click', async () => {
        await ambApi('update', { method: 'POST', body: { id: b.dataset.ambReactivate, status: 'active' } });
        toast('Réactivé', 'ok'); renderAmbassadors();
      }));
      ambList.querySelectorAll('[data-amb-delete]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Supprimer définitivement cet ambassadeur ?')) return;
        await ambApi('delete', { method: 'POST', body: { id: b.dataset.ambDelete } });
        toast('Ambassadeur supprimé', 'ok'); renderAmbassadors();
      }));
    }

    const comEl = document.getElementById('ambCommissions');
    if (comEl) {
      if (commissions._error) {
        comEl.innerHTML = `<p class="hint">Commissions indisponibles: ${esc(commissions._error)}</p>`;
      } else {
        const rows = (commissions.commissions || []).slice(0, 40).map((c) => `
        <tr>
          <td>${esc(c.type)}</td>
          <td>#${esc(c.orderId)}</td>
          <td>${moneyCad(c.amount)}</td>
          <td>${esc(c.status)}</td>
          <td>${esc((c.createdAt || '').slice(0, 10))}</td>
        </tr>`).join('');
        comEl.innerHTML = `<table class="data-table"><thead><tr><th>Type</th><th>Commande</th><th>Montant</th><th>Statut</th><th>Date</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">Aucune commission</td></tr>'}</tbody></table>`;
      }
    }

    const fraudEl = document.getElementById('ambFraud');
    if (fraudEl) {
      const flags = overview.fraudFlags || [];
      fraudEl.innerHTML = flags.length
        ? `<table class="data-table"><thead><tr><th>Type</th><th>Amb</th><th>Commande</th><th>Note</th></tr></thead><tbody>${
          flags.map((f) => `<tr><td>${esc(f.type)}</td><td>${esc(f.ambassadorId)}</td><td>${esc(f.orderId)}</td><td>${esc(f.note || f.status)}</td></tr>`).join('')
        }</tbody></table>`
        : '<p class="hint">Aucun signalement.</p>';
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

/** Flat ordered list: roots first, then their descendants indented */
function buildTeamFlatRows(ambs) {
  const byId = Object.fromEntries(ambs.map((a) => [a.id, a]));
  const kids = {};
  ambs.forEach((a) => {
    const pid = a.referredBy && byId[a.referredBy] ? a.referredBy : null;
    if (!kids[pid || '__root__']) kids[pid || '__root__'] = [];
    kids[pid || '__root__'].push(a);
  });
  Object.values(kids).forEach((list) => list.sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || ''), 'fr')));

  const rows = [];
  const seen = new Set();
  function walk(parentKey, depth) {
    for (const a of kids[parentKey] || []) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      const parentOk = a.referredBy && byId[a.referredBy];
      rows.push({
        amb: a,
        depth,
        isRoot: !a.referredBy,
        isOrphan: Boolean(a.referredBy && !byId[a.referredBy]),
        parentOk: Boolean(parentOk),
      });
      walk(a.id, depth + 1);
    }
  }
  walk('__root__', 0);
  // Any leftover (cycles) still shown
  ambs.forEach((a) => {
    if (seen.has(a.id)) return;
    rows.push({ amb: a, depth: 0, isRoot: !a.referredBy, isOrphan: true, parentOk: false });
  });
  return rows;
}

function parentOptionsHtml(ambs, currentId, selectedParentId) {
  const opts = [`<option value="">— Aucun (racine) —</option>`];
  ambs.forEach((p) => {
    if (p.id === currentId) return;
    const sel = selectedParentId === p.id ? ' selected' : '';
    opts.push(`<option value="${esc(p.id)}"${sel}>${esc(p.displayName)}</option>`);
  });
  return opts.join('');
}

function renderTeamTreeEditor(ambs) {
  const box = document.getElementById('ambForest');
  const alertEl = document.getElementById('ambTreeAlert');
  const msg = document.getElementById('ambTreeMsg');
  if (!box) return;

  if (!ambs.length) {
    box.innerHTML = '<p class="amb-tree-empty">Aucun ambassadeur pour l’instant.</p>';
    if (alertEl) alertEl.hidden = true;
    return;
  }

  const flat = buildTeamFlatRows(ambs);
  const roots = flat.filter((r) => r.isRoot || r.isOrphan);
  const multiRoot = roots.length > 1;

  if (alertEl) {
    if (multiRoot) {
      const names = roots.map((r) => r.amb.displayName).join(', ');
      alertEl.hidden = false;
      alertEl.innerHTML = `<strong>${roots.length} personnes sans parrain</strong> (équipes séparées) : ${esc(names)}. Pour qu’elles soient dans la même équipe, choisis un parrain à droite.`;
    } else {
      alertEl.hidden = true;
      alertEl.innerHTML = '';
    }
  }

  box.innerHTML = flat.map(({ amb: a, depth, isRoot, isOrphan }) => {
    const pad = Math.min(depth, 8) * 18;
    const tag = isOrphan ? ' · orphelin' : (isRoot ? ' · racine' : '');
    const cls = ['amb-tree-row', isRoot || isOrphan ? 'is-root' : '', isOrphan || (isRoot && multiRoot && roots.length > 1) ? 'is-orphan' : ''].filter(Boolean).join(' ');
    return `
      <div class="${cls}" style="margin-left:${pad}px" data-amb-id="${esc(a.id)}">
        <div class="amb-tree-who">
          <strong>${depth ? '↳ ' : ''}${esc(a.displayName)}</strong>
          <span class="amb-tree-meta">${esc(a.email || '')} · ${esc(a.status || '')}${tag}</span>
        </div>
        <div class="amb-tree-parent">
          <label for="ambParent_${esc(a.id)}">Parrain</label>
          <select id="ambParent_${esc(a.id)}" data-amb-parent="${esc(a.id)}" aria-label="Parrain de ${esc(a.displayName)}">
            ${parentOptionsHtml(ambs, a.id, a.referredBy || '')}
          </select>
        </div>
      </div>`;
  }).join('');

  box.querySelectorAll('[data-amb-parent]').forEach((sel) => {
    sel.addEventListener('change', async () => {
      const id = sel.dataset.ambParent;
      const referredBy = sel.value || null;
      sel.disabled = true;
      try {
        await ambApi('update', { method: 'POST', body: { id, referredBy } });
        if (msg) msg.textContent = 'Place enregistrée.';
        toast('Arbre mis à jour', 'ok');
        renderAmbassadors();
      } catch (err) {
        if (msg) msg.textContent = err.message;
        toast(err.message, 'error');
        sel.disabled = false;
        renderAmbassadors();
      }
    });
  });
}

document.getElementById('ambCreateBtn')?.addEventListener('click', async () => {
  const msg = document.getElementById('ambCreateMsg');
  try {
    const data = await ambApi('create', {
      method: 'POST',
      body: {
        displayName: document.getElementById('ambCreateName')?.value,
        email: document.getElementById('ambCreateEmail')?.value,
        promoCode: document.getElementById('ambCreateCode')?.value,
        password: document.getElementById('ambCreatePass')?.value || undefined,
        status: 'active',
      },
    });
    msg.textContent = `Créé · MDP temporaire: ${data.tempPassword || '—'} · Code ${data.ambassador?.promoCode}`;
    toast('Ambassador créé', 'ok');
    renderAmbassadors();
  } catch (err) {
    msg.textContent = err.message;
    toast(err.message, 'error');
  }
});

document.getElementById('ambInviteBtn')?.addEventListener('click', async () => {
  try {
    const email = document.getElementById('ambCreateEmail')?.value || '';
    const data = await ambApi('invite', { method: 'POST', body: { email } });
    document.getElementById('ambCreateMsg').textContent = `Invitation: ${data.inviteUrl}`;
    await navigator.clipboard.writeText(data.inviteUrl);
    toast('Lien d\'invitation copié', 'ok');
  } catch (err) {
    toast(err.message, 'error');
  }
});

document.getElementById('ambSaveSettingsBtn')?.addEventListener('click', async () => {
  try {
    await ambApi('settings', {
      method: 'POST',
      body: {
        settings: {
          personalCommission: Number(document.getElementById('ambSetPersonal')?.value),
          referralLevel1: Number(document.getElementById('ambSetL1')?.value),
          referralLevel2: Number(document.getElementById('ambSetL2')?.value),
          attributionDays: Number(document.getElementById('ambSetAttr')?.value),
          pendingDays: Number(document.getElementById('ambSetPending')?.value),
          minPayout: Number(document.getElementById('ambSetMinPay')?.value),
          requireApproval: document.getElementById('ambSetApproval')?.value === 'true',
          shopBaseUrl: document.getElementById('ambSetShop')?.value,
        },
      },
    });
    toast('Réglages sauvegardés', 'ok');
  } catch (err) {
    toast(err.message, 'error');
  }
});

document.getElementById('ambRefreshBtn')?.addEventListener('click', () => renderAmbassadors());
document.getElementById('ambNotifyReadyBtn')?.addEventListener('click', async () => {
  if (!confirm('Envoyer un email à TOUS les ambassadeurs actifs : « la plateforme est maintenant fonctionnelle » ?')) return;
  const statusEl = document.getElementById('ambEmailStatus');
  const btn = document.getElementById('ambNotifyReadyBtn');
  try {
    if (btn) btn.disabled = true;
    if (statusEl) statusEl.textContent = 'Envoi en cours…';
    const data = await ambApi('notify-platform-ready', { method: 'POST', body: {} });
    const msg = `Emails envoyés: ${data.sent}/${data.total}${data.failed ? ` · échecs: ${data.failed}` : ''}`;
    if (statusEl) statusEl.textContent = msg;
    toast(msg, data.failed ? 'error' : 'ok');
  } catch (err) {
    if (statusEl) statusEl.textContent = err.message;
    toast(err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
});
document.getElementById('ambMatureBtn')?.addEventListener('click', async () => {
  try {
    const data = await ambApi('mature-commissions', { method: 'POST', body: {} });
    toast(`${data.matured || 0} commission(s) maturée(s)`, 'ok');
    renderAmbassadors();
  } catch (err) { toast(err.message, 'error'); }
});
document.getElementById('ambRecalcXpBtn')?.addEventListener('click', async () => {
  if (!confirm('Recalculer les XP de tous les ambassadeurs selon l’activité réelle ? (corrige les scores gonflés)')) return;
  try {
    const data = await ambApi('recalc-xp', { method: 'POST', body: {} });
    const top = (data.results || []).slice(0, 3).map((r) => `${r.displayName}:${r.xp}`).join(' · ');
    toast(`XP recalculés · top ${top}`, 'ok');
    renderAmbassadors();
  } catch (err) { toast(err.message, 'error'); }
});
document.getElementById('ambSyncPromosBtn')?.addEventListener('click', async () => {
  try {
    const data = await ambApi('sync-promos', { method: 'POST', body: {} });
    toast(`${data.synced || 0} code(s) promo ambassadeur synchronisé(s)`, 'ok');
    await loadStore();
    renderMarketing();
  } catch (err) { toast(err.message, 'error'); }
});
document.getElementById('ambExportBtn')?.addEventListener('click', async () => {
  try {
    const res = await fetch(apiUrl('/api/ambassador-admin?action=export&type=ambassadors'), { headers: headers() });
    const data = await res.json();
    const rows = data.rows || [];
    if (!rows.length) { toast('Rien à exporter'); return; }
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(','), ...rows.map((r) => keys.map((k) => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'menes-ambassadors.csv';
    a.click();
  } catch (err) { toast(err.message, 'error'); }
});
document.getElementById('ambAnnounceBtn')?.addEventListener('click', async () => {
  try {
    await ambApi('post-announcement', { method: 'POST', body: { text: document.getElementById('ambAnnounce')?.value } });
    toast('Annonce publiée', 'ok');
    document.getElementById('ambAnnounce').value = '';
  } catch (err) { toast(err.message, 'error'); }
});
document.getElementById('ambCampBtn')?.addEventListener('click', async () => {
  try {
    await ambApi('create-campaign', {
      method: 'POST',
      body: { name: document.getElementById('ambCampName')?.value, description: document.getElementById('ambCampDesc')?.value },
    });
    toast('Campagne créée', 'ok');
  } catch (err) { toast(err.message, 'error'); }
});
document.getElementById('ambChalBtn')?.addEventListener('click', async () => {
  try {
    await ambApi('create-challenge', {
      method: 'POST',
      body: {
        title: document.getElementById('ambChalTitle')?.value,
        xpReward: Number(document.getElementById('ambChalXp')?.value) || 500,
        goalType: 'sales_count',
        goalValue: 5,
      },
    });
    toast('Défi créé', 'ok');
  } catch (err) { toast(err.message, 'error'); }
});
document.getElementById('ambContentBtn')?.addEventListener('click', async () => {
  try {
    await ambApi('upload-content', {
      method: 'POST',
      body: {
        title: document.getElementById('ambContentTitle')?.value,
        url: document.getElementById('ambContentUrl')?.value,
        flags: ['NEW'],
      },
    });
    toast('Contenu ajouté', 'ok');
  } catch (err) { toast(err.message, 'error'); }
});

// Export/import
document.getElementById('exportDataBtn')?.addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(storeData, null, 2)], { type: 'application/json' }));
  a.download = `${activeSiteId}-backup.json`; a.click();
});
document.getElementById('importDataBtn')?.addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile')?.addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    storeData = JSON.parse(ev.target.result);
    await saveStore('Import réussi');
    loadDesignForm(); renderProducts(); renderSectionEditors(); updateDashboard();
  };
  reader.readAsText(file);
});

// Init
initAdminTheme();
setupMobileNav();
(async () => {
  if (sessionStorage.getItem(AUTH_KEY)) {
    adminPassword = sessionStorage.getItem('menes_admin_pw') || '';
    try { await showApp(); } catch { sessionStorage.clear(); }
  }
})();
