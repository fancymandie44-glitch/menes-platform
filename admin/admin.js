// MENES Admin
const ADMIN_PASSWORD = 'menes2026';
const STORAGE_KEY = 'menes_store_data';
const AUTH_KEY = 'menes_admin_auth';
const API = '/api/store';

let storeData = null;

async function loadStore() {
  try {
    const res = await fetch(API);
    if (res.ok) {
      storeData = await res.json();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storeData));
      return;
    }
  } catch {}

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    storeData = JSON.parse(saved);
    return;
  }

  try {
    const res = await fetch('/data/store.json');
    storeData = await res.json();
  } catch {
    storeData = { site: {}, products: [], orders: [] };
  }
}

async function saveStore() {
  const json = JSON.stringify(storeData);
  localStorage.setItem(STORAGE_KEY, json);

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Password': ADMIN_PASSWORD,
      },
      body: json,
    });
    if (!res.ok) throw new Error('Erreur serveur');
    toast('✅ Sauvegardé! Visible sur la boutique maintenant.', 'success');
  } catch {
    toast('Sauvegardé localement. Lance START-PLATFORM.bat pour sync boutique.', '');
  }

  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: json }));
}

function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

function switchTab(tab) {
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${tab}`));
  if (tab === 'products') renderProducts();
  if (tab === 'orders') renderOrders();
  if (tab === 'dashboard') updateDashboard();
}

window.switchTab = switchTab;

document.getElementById('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (document.getElementById('loginPassword').value === ADMIN_PASSWORD) {
    sessionStorage.setItem(AUTH_KEY, '1');
    showApp();
  } else {
    toast('Mot de passe incorrect', 'error');
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.removeItem(AUTH_KEY);
  location.reload();
});

function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  loadSiteForm();
  updateDashboard();
  loadSquareConfig();
}

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function updateDashboard() {
  const products = storeData.products || [];
  const active = products.filter((p) => p.active).length;
  const orders = storeData.orders || [];
  const revenue = orders.filter((o) => o.status === 'paid').reduce((s, o) => s + o.total, 0);
  document.getElementById('statProducts').textContent = active;
  document.getElementById('statOrders').textContent = orders.length;
  document.getElementById('statRevenue').textContent = `${revenue.toFixed(0)}$`;
}

function renderProducts() {
  const list = document.getElementById('productsList');
  const products = storeData.products || [];
  list.innerHTML = products.map((p) => `
    <div class="product-item ${p.active ? '' : 'inactive'}">
      <div class="product-info">
        <h4>${escapeHtml(p.name)} <span style="color:#888;font-weight:400">· ${p.category}</span></h4>
        <p>${escapeHtml(p.description || '')} · Tailles: ${(p.sizes || []).join(', ')}</p>
      </div>
      <span class="product-price">${p.price}$</span>
      <div class="product-actions">
        <button onclick="editProduct('${p.id}')">Modifier</button>
        <button class="delete" onclick="deleteProduct('${p.id}')">Supprimer</button>
      </div>
    </div>
  `).join('') || '<p>Aucun produit. Clique "+ Nouveau produit".</p>';
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

document.getElementById('addProductBtn').addEventListener('click', () => openProductModal());
document.getElementById('cancelProductBtn').addEventListener('click', () => {
  document.getElementById('productModal').classList.add('hidden');
});

function openProductModal(product = null) {
  document.getElementById('productModal').classList.remove('hidden');
  document.getElementById('productModalTitle').textContent = product ? 'Modifier produit' : 'Nouveau produit';
  document.getElementById('productId').value = product?.id || '';
  document.getElementById('productName').value = product?.name || '';
  document.getElementById('productCategory').value = product?.category || 'vetements';
  document.getElementById('productPrice').value = product?.price || '';
  document.getElementById('productDesc').value = product?.description || '';
  document.getElementById('productSizes').value = (product?.sizes || []).join(', ');
  document.getElementById('productImage').value = product?.image || '';
  document.getElementById('productActive').checked = product?.active !== false;
}

window.editProduct = (id) => {
  const p = storeData.products.find((x) => x.id === id);
  if (p) openProductModal(p);
};

window.deleteProduct = async (id) => {
  if (!confirm('Supprimer ce produit?')) return;
  storeData.products = storeData.products.filter((p) => p.id !== id);
  await saveStore();
  renderProducts();
};

document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('productId').value ||
    document.getElementById('productName').value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const product = {
    id,
    name: document.getElementById('productName').value,
    category: document.getElementById('productCategory').value,
    price: parseFloat(document.getElementById('productPrice').value),
    description: document.getElementById('productDesc').value,
    sizes: document.getElementById('productSizes').value.split(',').map((s) => s.trim()).filter(Boolean),
    image: document.getElementById('productImage').value,
    active: document.getElementById('productActive').checked,
  };
  if (!storeData.products) storeData.products = [];
  const idx = storeData.products.findIndex((p) => p.id === id);
  if (idx >= 0) storeData.products[idx] = product;
  else storeData.products.push(product);
  await saveStore();
  document.getElementById('productModal').classList.add('hidden');
  renderProducts();
});

function loadSiteForm() {
  const s = storeData.site || {};
  document.getElementById('siteName').value = s.name || '';
  document.getElementById('siteTagline').value = s.tagline || '';
  document.getElementById('siteHeroTitle').value = s.heroTitle || '';
  document.getElementById('siteHeroSubtitle').value = s.heroSubtitle || '';
  document.getElementById('siteInstagram').value = s.instagram || '';
  document.getElementById('siteEmail').value = s.email || '';
}

document.getElementById('siteForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  storeData.site = {
    ...storeData.site,
    name: document.getElementById('siteName').value,
    tagline: document.getElementById('siteTagline').value,
    heroTitle: document.getElementById('siteHeroTitle').value,
    heroSubtitle: document.getElementById('siteHeroSubtitle').value,
    instagram: document.getElementById('siteInstagram').value,
    email: document.getElementById('siteEmail').value,
    currency: 'CAD',
  };
  await saveStore();
});

function renderOrders() {
  const orders = storeData.orders || [];
  const list = document.getElementById('ordersList');
  if (!orders.length) {
    list.innerHTML = '<p>Aucune commande pour le moment.</p>';
    return;
  }
  list.innerHTML = orders.map((o) => `
    <div class="order-item">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong>#${o.id}</strong>
        <span class="status ${o.status}">${o.status === 'paid' ? 'Payé' : 'En attente'}</span>
      </div>
      <p>${o.customer?.name} · ${o.customer?.email}</p>
      <p>${o.items?.map((i) => `${i.name} (${i.size}) x${i.qty}`).join(', ')}</p>
      <strong>${o.total?.toFixed(2)}$ CAD</strong>
    </div>
  `).join('');
}

function loadSquareConfig() {
  const cfg = JSON.parse(localStorage.getItem('menes_square') || '{}');
  document.getElementById('squareAppId').value = cfg.appId || '';
  document.getElementById('squareLocationId').value = cfg.locationId || '';
  document.getElementById('squareAccessToken').value = cfg.accessToken || '';
  document.getElementById('squareSandbox').checked = cfg.sandbox !== false;
}

document.getElementById('squareForm').addEventListener('submit', (e) => {
  e.preventDefault();
  localStorage.setItem('menes_square', JSON.stringify({
    appId: document.getElementById('squareAppId').value,
    locationId: document.getElementById('squareLocationId').value,
    accessToken: document.getElementById('squareAccessToken').value,
    sandbox: document.getElementById('squareSandbox').checked,
  }));
  toast('Square configuré localement. Ajoute aussi les clés dans Netlify → Environment variables.', 'success');
});

document.getElementById('exportDataBtn').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(storeData, null, 2)], { type: 'application/json' }));
  a.download = 'store.json';
  a.click();
});

document.getElementById('importDataBtn').addEventListener('click', () => document.getElementById('importFile').click());

document.getElementById('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    storeData = JSON.parse(ev.target.result);
    await saveStore();
    loadSiteForm();
    renderProducts();
    updateDashboard();
  };
  reader.readAsText(file);
});

(async () => {
  await loadStore();
  if (sessionStorage.getItem(AUTH_KEY)) showApp();
})();
