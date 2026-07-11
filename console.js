/* MENES Platform Console — Admin pro multi-boutiques */
const AUTH_KEY = 'menes_console_auth';
const SITE_KEY = 'menes_active_site';
const STORAGE_KEY = 'menes_store_data';

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
  customers: 'Clients', marketing: 'Marketing', appearance: 'Apparence & thème', design: 'Design & contenu',
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
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3200);
}

function switchTab(tab) {
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${tab}`));
  document.getElementById('pageTitle').textContent = TAB_TITLES[tab] || tab;
  const renders = {
    dashboard: updateDashboard, products: renderProducts, collections: renderCollections,
    orders: renderOrders, customers: renderCustomers, marketing: renderMarketing,
    sites: renderSites, domains: renderDomains, design: loadDesignForm, appearance: loadAppearanceForm,
    sections: () => { renderSectionEditors(); renderGalleryEditor(); },
  };
  renders[tab]?.();
}
window.switchTab = switchTab;

async function loadPlatform() {
  const res = await fetch(apiUrl('/api/platform'), { headers: headers() });
  if (!res.ok) throw new Error('Erreur chargement platform');
  platform = await res.json();
  if (!platform.sites?.some((s) => s.id === activeSiteId)) activeSiteId = platform.defaultSiteId || 'menes';
  renderSiteSelector();
}

async function loadStore() {
  const res = await fetch(apiUrl(`/api/store?site=${activeSiteId}`), { cache: 'no-store' });
  if (res.ok) {
    storeData = await res.json();
    delete storeData._siteId;
    if (!storeData.collections?.length) {
      storeData.collections = [
        { id: 'vetements', name: 'Vêtements', active: true },
        { id: 'grillz', name: 'Grillz', active: true },
        { id: 'accessoires', name: 'Accessoires', active: true },
      ];
    }
    if (!storeData.discounts) storeData.discounts = [];
    if (!storeData.customers) storeData.customers = [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storeData));
    return;
  }
  const saved = localStorage.getItem(STORAGE_KEY);
  storeData = saved ? JSON.parse(saved) : { site: {}, products: [], orders: [], customers: [], discounts: [], collections: [] };
}

async function saveStore(msg = '✅ Sauvegardé') {
  try {
    const res = await fetch(apiUrl('/api/store'), { method: 'POST', headers: headers(), body: JSON.stringify({ ...storeData, _siteId: activeSiteId }) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast(msg, 'success');
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storeData));
    } else {
      toast(data.error || `Erreur sauvegarde (${res.status})`, 'error');
      console.error('Save failed:', data);
    }
  } catch (err) {
    toast('Connexion API impossible — vérifie que boutiquemenes.netlify.app est en ligne', 'error');
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
document.getElementById('saveAllBtn').addEventListener('click', () => saveStore('Tout sauvegardé ✓'));

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
  const customers = new Set(orders.map((o) => o.customer?.email).filter(Boolean));
  document.getElementById('statProducts').textContent = p.filter((x) => x.active).length;
  document.getElementById('statOrders').textContent = orders.length;
  document.getElementById('statCustomers').textContent = customers.size;
  document.getElementById('statPending').textContent = orders.filter((o) => o.status === 'pending').length;
  document.getElementById('statRevenue').textContent = `${orders.filter((o) => o.status === 'paid' || o.status === 'shipped' || o.status === 'delivered').reduce((s, o) => s + (o.total || 0), 0).toFixed(0)}$`;
  document.getElementById('statSites').textContent = platform?.sites?.length || 1;

  const recent = orders.slice(-5).reverse();
  document.getElementById('recentOrders').innerHTML = recent.length
    ? recent.map((o) => `<div class="mini-item"><span>#${o.id} · ${esc(o.customer?.name)}</span><span>${(o.total || 0).toFixed(0)}$</span></div>`).join('')
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
    toast(`Boutique ${name} créée ✓`, 'success');
  } else toast(data.error || 'Erreur', 'error');
});

// Domains
function renderDomains() {
  const site = platform.sites.find((s) => s.id === activeSiteId);
  document.getElementById('domainSiteName').textContent = `Domaines — ${site?.name || activeSiteId}`;
  const domains = site?.domains || [];
  document.getElementById('domainsList').innerHTML = domains.length
    ? domains.map((d) => `<div class="domain-item"><span>🌐 ${esc(d)}</span><a href="https://${esc(d)}" target="_blank" rel="noopener">Visiter →</a></div>`).join('')
    : '<p class="empty">Aucun domaine — ajoute-en un ci-dessous</p>';
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
  toast('Domaine ajouté — configure-le dans Netlify', 'success');
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
      <td><strong>${esc(p.name)}</strong></td><td>${esc(p.sku || '—')}</td><td>${esc(p.category)}</td>
      <td>${p.price}$${p.comparePrice ? ` <s>${p.comparePrice}$</s>` : ''}</td>
      <td>${p.stock > 0 ? p.stock : '—'}</td>
      <td>${p.active ? '<span class="badge paid">Actif</span>' : '<span class="badge cancelled">Masqué</span>'}</td>
      <td><button onclick="editProduct('${p.id}')">Modifier</button> <button class="btn-danger" onclick="deleteProduct('${p.id}')">✕</button></td>
    </tr>`).join('')}</tbody></table>` : '<p class="empty">Aucun produit</p>';
}

document.getElementById('productSearch')?.addEventListener('input', renderProducts);
document.getElementById('productFilterCat')?.addEventListener('change', renderProducts);
document.getElementById('addProductBtn')?.addEventListener('click', () => openProductModal());
document.getElementById('cancelProductBtn')?.addEventListener('click', () => document.getElementById('productModal').classList.add('hidden'));

let productImagesState = [];
let productOptionsState = [];

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
  document.getElementById('productImageUrl').value = '';
  document.getElementById('productActive').checked = product?.active !== false;
  document.getElementById('productFeatured').checked = !!product?.featured;

  productImagesState = normalizeImages(product);
  productOptionsState = normalizeOptions(product);
  renderProductImagesEditor();
  renderProductOptionsEditor();
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
    box.innerHTML = '<p class="empty" style="padding:16px">Aucune photo — ajoute-en ci-dessous</p>';
    return;
  }
  const variants = variantValuesList();
  box.innerHTML = productImagesState.map((im, i) => `
    <div class="image-edit-row" data-i="${i}">
      <img src="${esc(im.url)}" alt="">
      <div class="image-edit-fields">
        ${i === 0 ? '<span class="badge-main">★ Principale</span>' : `<button type="button" class="btn-link makeMain" data-i="${i}">↑ Définir principale</button>`}
        <label class="img-var-label">Associer à la variante
          <input list="variantOptionsList" class="image-variant" data-i="${i}" value="${esc(im.label || '')}" placeholder="ex: Olive Green">
        </label>
      </div>
      <div class="image-edit-actions">
        <button type="button" class="btn-link recropImg" data-i="${i}">✂️</button>
        <button type="button" class="del-row delImg" data-i="${i}">✕</button>
      </div>
    </div>`).join('')
    + `<datalist id="variantOptionsList">${variants.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;

  box.querySelectorAll('.image-variant').forEach((inp) => inp.addEventListener('input', () => { productImagesState[+inp.dataset.i].label = inp.value; }));
  box.querySelectorAll('.delImg').forEach((b) => b.addEventListener('click', () => { productImagesState.splice(+b.dataset.i, 1); renderProductImagesEditor(); }));
  box.querySelectorAll('.makeMain').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.i; const [im] = productImagesState.splice(i, 1); productImagesState.unshift(im); renderProductImagesEditor(); }));
  box.querySelectorAll('.recropImg').forEach((b) => b.addEventListener('click', () => {
    const i = +b.dataset.i;
    openCropper(productImagesState[i].url, defaultAspectFor(), (dataUrl) => { productImagesState[i].url = dataUrl; renderProductImagesEditor(); });
  }));
}

function renderProductOptionsEditor() {
  const box = document.getElementById('optionsEditor');
  if (!box) return;
  box.innerHTML = productOptionsState.map((o, i) => `
    <div class="option-edit-row" data-i="${i}">
      <input class="opt-name-in" data-i="${i}" value="${esc(o.name)}" placeholder="Nom (ex: Couleur)">
      <input class="opt-values-in" data-i="${i}" value="${esc(o.values)}" placeholder="Valeurs séparées par virgule (ex: Olive Green, Onyx)">
      <button type="button" class="del-row delOpt" data-i="${i}">✕</button>
    </div>`).join('') || '<p class="empty" style="padding:12px">Aucune option — clique « + Ajouter une option » (ex: Taille, Couleur)</p>';

  box.querySelectorAll('.opt-name-in').forEach((inp) => inp.addEventListener('input', () => { productOptionsState[+inp.dataset.i].name = inp.value; }));
  box.querySelectorAll('.opt-values-in').forEach((inp) => inp.addEventListener('input', () => { productOptionsState[+inp.dataset.i].values = inp.value; updateVariantDatalist(); }));
  box.querySelectorAll('.delOpt').forEach((b) => b.addEventListener('click', () => { productOptionsState.splice(+b.dataset.i, 1); renderProductOptionsEditor(); }));
}

function updateVariantDatalist() {
  const dl = document.getElementById('variantOptionsList');
  if (dl) dl.innerHTML = variantValuesList().map((v) => `<option value="${esc(v)}">`).join('');
}

document.getElementById('addOptionBtn')?.addEventListener('click', () => {
  productOptionsState.push({ name: '', values: '' });
  renderProductOptionsEditor();
});

document.getElementById('addImageUrlBtn')?.addEventListener('click', () => {
  const input = document.getElementById('productImageUrl');
  const url = input.value.trim();
  if (!url) return;
  productImagesState.push({ url, label: '' });
  input.value = '';
  renderProductImagesEditor();
});

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
    stock: parseInt(document.getElementById('productStock').value, 10) || 0,
    images,
    image: images[0]?.url || '',
    active: document.getElementById('productActive').checked,
    featured: document.getElementById('productFeatured').checked,
  };
  if (!storeData.products) storeData.products = [];
  const idx = storeData.products.findIndex((p) => p.id === id);
  if (idx >= 0) storeData.products[idx] = product; else storeData.products.push(product);
  await saveStore('Produit sauvegardé ✓');
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
function renderOrders() {
  const status = document.getElementById('orderFilterStatus')?.value || '';
  let orders = [...(storeData.orders || [])].reverse();
  if (status) orders = orders.filter((o) => o.status === status);
  document.getElementById('ordersList').innerHTML = orders.length ? `
    <table class="data-table"><thead><tr><th>#</th><th>Client</th><th>Total</th><th>Paiement</th><th>Statut</th><th>Date</th><th></th></tr></thead>
    <tbody>${orders.map((o) => `<tr>
      <td><strong>${esc(o.id)}</strong></td>
      <td>${esc(o.customer?.name)}<br><small>${esc(o.customer?.email)}</small></td>
      <td>${(o.total || 0).toFixed(2)}$</td>
      <td>${esc(o.payment || o.method || '—')}</td>
      <td><span class="badge ${o.status || 'pending'}">${esc(o.status || 'pending')}</span></td>
      <td>${o.date ? new Date(o.date).toLocaleDateString('fr-CA') : '—'}</td>
      <td><select onchange="updateOrderStatus('${o.id}', this.value)">
        ${['pending','paid','processing','shipped','delivered','cancelled'].map((s) => `<option value="${s}" ${o.status===s?'selected':''}>${s}</option>`).join('')}
      </select></td>
    </tr>`).join('')}</tbody></table>` : '<p class="empty">Aucune commande — elles apparaîtront ici après achat</p>';
}

window.updateOrderStatus = async (id, status) => {
  const o = storeData.orders.find((x) => x.id === id);
  if (o) { o.status = status; await saveStore('Statut mis à jour'); renderOrders(); }
};

document.getElementById('orderFilterStatus')?.addEventListener('change', renderOrders);

// Customers
function renderCustomers() {
  const map = new Map();
  (storeData.orders || []).forEach((o) => {
    const email = o.customer?.email;
    if (!email) return;
    if (!map.has(email)) map.set(email, { name: o.customer.name, email, phone: o.customer.phone, orders: 0, total: 0 });
    const c = map.get(email);
    c.orders++;
    c.total += o.total || 0;
  });
  const list = [...map.values()].sort((a, b) => b.total - a.total);
  document.getElementById('customersList').innerHTML = list.length ? `
    <table class="data-table"><thead><tr><th>Client</th><th>Email</th><th>Commandes</th><th>Total dépensé</th></tr></thead>
    <tbody>${list.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.email)}</td><td>${c.orders}</td><td>${c.total.toFixed(2)}$</td></tr>`).join('')}</tbody></table>`
    : '<p class="empty">Aucun client encore</p>';
}

// Marketing
function renderMarketing() {
  document.getElementById('mktAnnouncement').value = storeData.site?.announcement || '';
  const discounts = storeData.discounts || [];
  document.getElementById('discountsList').innerHTML = discounts.map((d, i) => `
    <div class="discount-row">
      <input class="disc-code" data-i="${i}" value="${esc(d.code)}" placeholder="CODE">
      <select class="disc-type" data-i="${i}"><option value="percent" ${d.type==='percent'?'selected':''}>%</option><option value="fixed" ${d.type==='fixed'?'selected':''}>$</option></select>
      <input class="disc-value" data-i="${i}" type="number" value="${d.value}" min="0">
      <button type="button" onclick="removeDiscount(${i})">✕</button>
    </div>`).join('') || '<p class="empty">Aucun code promo</p>';
}

document.getElementById('addDiscountBtn')?.addEventListener('click', () => {
  if (!storeData.discounts) storeData.discounts = [];
  storeData.discounts.push({ code: 'PROMO10', type: 'percent', value: 10, active: true });
  renderMarketing();
});

window.removeDiscount = async (i) => {
  storeData.discounts.splice(i, 1);
  renderMarketing();
  await saveStore('Code supprimé');
};

function readDiscountsFromDOM() {
  return [...document.querySelectorAll('#discountsList .discount-row')].map((r) => ({
    code: r.querySelector('.disc-code').value.trim().toUpperCase(),
    type: r.querySelector('.disc-type').value,
    value: parseFloat(r.querySelector('.disc-value').value) || 0,
    active: true,
  })).filter((d) => d.code);
}

async function saveMarketing() {
  storeData.site.announcement = document.getElementById('mktAnnouncement').value;
  storeData.discounts = readDiscountsFromDOM();
  await saveStore('Marketing sauvegardé ✓');
}

document.getElementById('saveAnnouncementBtn')?.addEventListener('click', saveMarketing);
document.getElementById('saveDiscountsBtn')?.addEventListener('click', saveMarketing);

// Design form
function loadDesignForm() {
  const s = storeData.site || {};
  document.getElementById('siteName').value = s.name || '';
  document.getElementById('siteTagline').value = s.tagline || '';
  document.getElementById('siteHeroTitle').value = s.heroTitle || '';
  document.getElementById('siteHeroSubtitle').value = s.heroSubtitle || '';
  document.getElementById('siteHeroCta').value = s.heroCta || '';
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
  await saveStore('Design sauvegardé ✓');
});

// Sections (reuse patterns)
function renderSectionEditors() {
  const s = storeData.site || {};
  const sec = s.sections || {};
  document.getElementById('sectionToggles').innerHTML = [
    ['announcement','Annonce'],['trustBar','Confiance'],['bundle','Bundle'],['gallery','Galerie'],
    ['why','Pourquoi'],['emailCapture','Liste VIP'],['faq','FAQ'],['guarantee','Sécurité'],
  ].map(([k,l]) => `<label class="toggle-item"><input type="checkbox" data-sec="${k}" ${sec[k]!==false?'checked':''}> ${l}</label>`).join('');
  document.getElementById('trustEditor').innerHTML = (s.trust||[]).map((t)=>trustRow(t)).join('');
  document.getElementById('whyEditor').innerHTML = (s.why||[]).map((w)=>whyRow(w)).join('');
  document.getElementById('faqEditor').innerHTML = (s.faq||[]).map((f)=>faqRow(f)).join('');
  document.getElementById('siteGuarantee').value = s.guarantee || '';
  document.getElementById('galleryTitle').value = s.galleryTitle || '';
  document.getElementById('gallerySubtitle').value = s.gallerySubtitle || '';
}

function trustRow(t) { return `<div class="editor-row"><input class="trust-icon" value="${esc(t.icon)}"><input class="trust-title" value="${esc(t.title)}"><input class="trust-text" value="${esc(t.text)}"><button type="button" class="del-row" onclick="this.parentElement.remove()">✕</button></div>`; }
function whyRow(w) { return `<div class="editor-row col"><input class="why-title" value="${esc(w.title)}"><textarea class="why-text" rows="2">${esc(w.text)}</textarea><button type="button" class="del-row" onclick="this.parentElement.remove()">✕</button></div>`; }
function faqRow(f) { return `<div class="editor-row col"><input class="faq-q" value="${esc(f.q)}"><textarea class="faq-a" rows="2">${esc(f.a)}</textarea><button type="button" class="del-row" onclick="this.parentElement.remove()">✕</button></div>`; }

function galleryRow(g) {
  return `<div class="gallery-edit-row editor-row col"><div class="upload-zone small gallery-upload"><img class="gallery-preview ${g.image?'':'hidden'}" src="${esc(g.image)}"><span>📷 Photo</span><input type="file" class="gallery-file" accept="image/*" hidden></div><input type="hidden" class="gallery-image" value="${esc(g.image)}"><input class="gallery-caption" value="${esc(g.caption)}" placeholder="Légende"><input class="gallery-handle" value="${esc(g.handle)}" placeholder="@client"><button type="button" class="del-row" onclick="this.parentElement.remove()">✕</button></div>`;
}

function renderGalleryEditor() {
  const editor = document.getElementById('galleryEditor');
  if (!editor) return;
  const list = storeData.site?.gallery?.length ? storeData.site.gallery : [{ image:'', caption:'', handle:'' }];
  editor.innerHTML = list.map(galleryRow).join('');
  editor.querySelectorAll('.gallery-upload').forEach((zone) => {
    const fileInput = zone.querySelector('.gallery-file');
    const preview = zone.querySelector('.gallery-preview');
    const hidden = zone.closest('.gallery-edit-row').querySelector('.gallery-image');
    zone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      if (!fileInput.files[0]) return;
      const dataUrl = await compressImage(fileInput.files[0], 800, 0.82);
      preview.src = dataUrl; preview.classList.remove('hidden'); hidden.value = dataUrl;
      toast('Photo optimisée ✓');
    });
  });
}

document.getElementById('addTrustBtn')?.addEventListener('click', () => document.getElementById('trustEditor').insertAdjacentHTML('beforeend', trustRow({icon:'◆',title:'',text:''})));
document.getElementById('addWhyBtn')?.addEventListener('click', () => document.getElementById('whyEditor').insertAdjacentHTML('beforeend', whyRow({title:'',text:''})));
document.getElementById('addFaqBtn')?.addEventListener('click', () => document.getElementById('faqEditor').insertAdjacentHTML('beforeend', faqRow({q:'',a:''})));
document.getElementById('addGalleryBtn')?.addEventListener('click', () => { document.getElementById('galleryEditor').insertAdjacentHTML('beforeend', galleryRow({image:'',caption:'',handle:''})); });

document.getElementById('saveSectionsBtn')?.addEventListener('click', async () => {
  const sections = {};
  document.querySelectorAll('#sectionToggles input').forEach((cb) => { sections[cb.dataset.sec] = cb.checked; });
  storeData.site.sections = sections;
  storeData.site.trust = [...document.querySelectorAll('#trustEditor .editor-row')].map((r) => ({ icon: r.querySelector('.trust-icon').value, title: r.querySelector('.trust-title').value, text: r.querySelector('.trust-text').value }));
  storeData.site.why = [...document.querySelectorAll('#whyEditor .editor-row')].map((r) => ({ title: r.querySelector('.why-title').value, text: r.querySelector('.why-text').value }));
  storeData.site.faq = [...document.querySelectorAll('#faqEditor .editor-row')].map((r) => ({ q: r.querySelector('.faq-q').value, a: r.querySelector('.faq-a').value }));
  storeData.site.guarantee = document.getElementById('siteGuarantee').value;
  storeData.site.galleryTitle = document.getElementById('galleryTitle').value;
  storeData.site.gallerySubtitle = document.getElementById('gallerySubtitle').value;
  storeData.site.gallery = [...document.querySelectorAll('#galleryEditor .gallery-edit-row')].map((r) => ({ image: r.querySelector('.gallery-image').value, caption: r.querySelector('.gallery-caption').value, handle: r.querySelector('.gallery-handle').value }));
  await saveStore('Sections sauvegardées ✓');
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
    toast('Image optimisée ✓');
  });
}

// Hero photo goes through the cropper; logo/favicon are simple
setupUploadWithCrop('heroUploadZone', 'heroImageFile', 'heroImagePreview', () => 'landscape', (d) => { pendingHeroImage = d; });
setupUpload('logoUploadZone', 'logoFile', 'logoPreview', (d) => { pendingLogo = d; });

function defaultAspectFor() {
  return storeData?.site?.theme?.productAspect || 'square';
}

// Product photo upload → crop → append to the product gallery
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
      });
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
  mode: 'light', accent: '#c9a84c', accentDark: '#9a7b2f', bg: '#fafafa', surface: '#ffffff', text: '#0a0a0a',
  headingFont: 'Bebas Neue', bodyFont: 'Inter', productAspect: '', productImgFit: 'cover', productImgHeight: 320,
  gridMin: 280, heroHeight: 85, heroOverlay: 55, announceBg: '#0a0a0a', announceColor: '#c9a84c', radius: 6, buttonRadius: 6,
};

function setVal(id, v) { const el = document.getElementById(id); if (el != null && v != null) el.value = v; }

function loadAppearanceForm() {
  const s = storeData.site || {};
  const th = { ...THEME_DEFAULTS, ...(s.theme || {}) };
  setVal('apLanguage', s.language || 'fr');
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

document.getElementById('saveAppearanceBtn')?.addEventListener('click', async () => {
  const g = (id) => document.getElementById(id)?.value;
  const num = (id, d) => { const v = parseFloat(g(id)); return Number.isFinite(v) ? v : d; };
  storeData.site = storeData.site || {};
  storeData.site.language = g('apLanguage') || 'fr';
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
  await saveStore('Apparence sauvegardée ✓ — rafraîchis ta boutique');
});

document.getElementById('resetAppearanceBtn')?.addEventListener('click', async () => {
  if (!confirm('Réinitialiser toute l\'apparence aux valeurs par défaut?')) return;
  storeData.site.theme = { ...THEME_DEFAULTS };
  storeData.site.language = 'fr';
  loadAppearanceForm();
  await saveStore('Apparence réinitialisée');
});

setupUpload('faviconUploadZone', 'faviconFile', 'faviconPreview', (d) => { pendingFavicon = d; });

/* ---------- Image cropper ---------- */
const CROP_ASPECTS = { square: 1, portrait45: 4 / 5, portrait34: 3 / 4, landscape: 16 / 9, wide: 3 / 2, free: 0 };
let cropImg = null;
let cropCb = null;
let cropScale = 1;
let cropOffX = 0.5;
let cropOffY = 0.5;
let cropDragging = false;
let cropLast = null;

function openCropper(src, aspectKey, cb) {
  cropImg = new Image();
  cropImg.onload = () => {
    cropCb = cb;
    cropScale = 1; cropOffX = 0.5; cropOffY = 0.5;
    const sel = document.getElementById('cropAspect');
    if (sel && CROP_ASPECTS[aspectKey] !== undefined) sel.value = aspectKey || 'square';
    document.getElementById('cropZoom').value = 1;
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
  return ar || (cropImg ? cropImg.width / cropImg.height : 1);
}

function drawCrop(ctx, cw, ch) {
  const base = Math.max(cw / cropImg.width, ch / cropImg.height);
  const s = base * cropScale;
  const dw = cropImg.width * s;
  const dh = cropImg.height * s;
  const overX = dw - cw;
  const overY = dh - ch;
  const dx = -overX * cropOffX;
  const dy = -overY * cropOffY;
  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(cropImg, dx, dy, dw, dh);
}

function drawCropPreview() {
  if (!cropImg) return;
  const stage = document.getElementById('cropStage');
  const canvas = document.getElementById('cropCanvas');
  const ar = currentAspect();
  const maxW = Math.min(stage.clientWidth || 340, 360);
  let cw = maxW;
  let ch = Math.round(cw / ar);
  const maxH = 360;
  if (ch > maxH) { ch = maxH; cw = Math.round(ch * ar); }
  canvas.width = cw; canvas.height = ch;
  drawCrop(canvas.getContext('2d'), cw, ch);
}

document.getElementById('cropAspect')?.addEventListener('change', () => { cropOffX = 0.5; cropOffY = 0.5; drawCropPreview(); });
document.getElementById('cropZoom')?.addEventListener('input', (e) => { cropScale = parseFloat(e.target.value); drawCropPreview(); });

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
  const base = Math.max(canvas.width / cropImg.width, canvas.height / cropImg.height) * cropScale;
  const overX = cropImg.width * base - canvas.width;
  const overY = cropImg.height * base - canvas.height;
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
  drawCrop(canvas.getContext('2d'), outW, outH);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  cropCb(dataUrl);
  document.getElementById('cropperModal').classList.add('hidden');
  toast('Photo recadrée ✓');
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
      });
    };
    reader.readAsDataURL(fileInput.files[0]);
    fileInput.value = '';
  });
}

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
    await saveStore('Import réussi ✓');
    loadDesignForm(); renderProducts(); renderSectionEditors(); updateDashboard();
  };
  reader.readAsText(file);
});

// Init
(async () => {
  if (sessionStorage.getItem(AUTH_KEY)) {
    adminPassword = sessionStorage.getItem('menes_admin_pw') || '';
    try { await showApp(); } catch { sessionStorage.clear(); }
  }
})();
