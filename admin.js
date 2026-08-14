// MENES Admin CMS
let adminPassword = '';
const STORAGE_KEY = 'menes_store_data';
const AUTH_KEY = 'menes_admin_auth';
const PW_KEY = 'menes_admin_pw';
const API = '/api/store';
let storeData = null;
let pendingProductImage = null;
let pendingHeroImage = null;
let pendingLogo = null;

async function loadStore() {
  try {
    const res = await fetch(API);
    if (res.ok) { storeData = await res.json(); localStorage.setItem(STORAGE_KEY, JSON.stringify(storeData)); return; }
  } catch {}
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) { storeData = JSON.parse(saved); return; }
  try {
    const res = await fetch('/data/store.json');
    storeData = await res.json();
  } catch { storeData = { site: {}, products: [], orders: [] }; }
}

async function saveStore(msg = '✅ Sauvegardé!') {
  const json = JSON.stringify(storeData);
  localStorage.setItem(STORAGE_KEY, json);
  try {
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword }, body: json });
    if (res.ok) toast(msg, 'success');
    else toast('Sauvegardé localement', '');
  } catch { toast('Sauvegardé localement. Visible sur F5.', ''); }
  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: json }));
}

function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast ${type}`; el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3500);
}

function switchTab(tab) {
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${tab}`));
  if (tab === 'products') renderProducts();
  if (tab === 'orders') renderOrders();
  if (tab === 'dashboard') updateDashboard();
  if (tab === 'sections') { renderSectionEditors(); renderGalleryEditor(); }
}
window.switchTab = switchTab;

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

function setupUpload(zoneId, fileId, previewId, callback) {
  const zone = document.getElementById(zoneId);
  const fileInput = document.getElementById(fileId);
  const preview = document.getElementById(previewId);
  zone.addEventListener('click', () => fileInput.click());
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', async (e) => {
    e.preventDefault(); zone.classList.remove('drag');
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) await handleImage(file, preview, callback);
  });
  fileInput.addEventListener('change', async () => {
    if (fileInput.files[0]) await handleImage(fileInput.files[0], preview, callback);
  });
}

async function handleImage(file, preview, callback) {
  try {
    const dataUrl = await compressImage(file);
    preview.src = dataUrl;
    preview.classList.remove('hidden');
    callback(dataUrl);
    toast('Photo optimisée ✓');
  } catch { toast('Erreur photo', 'error'); }
}

// Auth
document.getElementById('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const pw = document.getElementById('loginPassword').value.trim();
  if (!pw) {
    toast('Configure ADMIN_PASSWORD et saisis le mot de passe', 'error');
    return;
  }
  adminPassword = pw;
  sessionStorage.setItem(AUTH_KEY, '1');
  sessionStorage.setItem(PW_KEY, adminPassword);
  showApp();
});
document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(PW_KEY);
  adminPassword = '';
  location.reload();
});
document.querySelectorAll('.nav-btn').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  loadSiteForm();
  updateDashboard();
  renderSectionEditors();
  renderGalleryEditor();
}

function updateDashboard() {
  const p = storeData.products || [];
  document.getElementById('statProducts').textContent = p.filter((x) => x.active).length;
  document.getElementById('statOrders').textContent = (storeData.orders || []).length;
  const rev = (storeData.orders || []).filter((o) => o.status === 'paid').reduce((s, o) => s + (o.total || 0), 0);
  document.getElementById('statRevenue').textContent = `${rev.toFixed(0)}$`;
}

// Products
function renderProducts() {
  const list = document.getElementById('productsList');
  const products = storeData.products || [];
  list.innerHTML = products.map((p) => `
    <div class="product-item ${p.active ? '' : 'inactive'}">
      <div class="product-thumb">${p.image ? `<img src="${p.image}" alt="">` : '◆'}</div>
      <div class="product-info"><h4>${esc(p.name)}</h4><p>${p.category} · ${(p.sizes||[]).join(', ')}</p></div>
      <span class="product-price">${p.price}$</span>
      <div class="product-actions">
        <button onclick="editProduct('${p.id}')">Modifier</button>
        <button class="delete" onclick="deleteProduct('${p.id}')">Supprimer</button>
      </div>
    </div>`).join('') || '<p class="empty">Aucun produit. Clique "+ Nouveau produit".</p>';
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

document.getElementById('addProductBtn').addEventListener('click', () => openProductModal());
document.getElementById('cancelProductBtn').addEventListener('click', () => document.getElementById('productModal').classList.add('hidden'));

function openProductModal(product = null) {
  pendingProductImage = null;
  document.getElementById('productModal').classList.remove('hidden');
  document.getElementById('productModalTitle').textContent = product ? 'Modifier produit' : 'Nouveau produit';
  document.getElementById('productId').value = product?.id || '';
  document.getElementById('productName').value = product?.name || '';
  document.getElementById('productCategory').value = product?.category || 'vetements';
  document.getElementById('productPrice').value = product?.price || '';
  document.getElementById('productDesc').value = product?.description || '';
  document.getElementById('productSizes').value = (product?.sizes || []).join(', ');
  document.getElementById('productStock').value = product?.stock || 0;
  document.getElementById('productImageUrl').value = product?.image?.startsWith('http') ? product.image : '';
  document.getElementById('productActive').checked = product?.active !== false;
  document.getElementById('productFeatured').checked = !!product?.featured;
  const prev = document.getElementById('productImagePreview');
  if (product?.image) { prev.src = product.image; prev.classList.remove('hidden'); }
  else { prev.classList.add('hidden'); }
}

window.editProduct = (id) => { const p = storeData.products.find((x) => x.id === id); if (p) openProductModal(p); };
window.deleteProduct = async (id) => {
  if (!confirm('Supprimer?')) return;
  storeData.products = storeData.products.filter((p) => p.id !== id);
  await saveStore('Produit supprimé'); renderProducts();
};

document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('productId').value || document.getElementById('productName').value.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
  const image = pendingProductImage || document.getElementById('productImageUrl').value || '';
  const product = {
    id, name: document.getElementById('productName').value,
    category: document.getElementById('productCategory').value,
    price: parseFloat(document.getElementById('productPrice').value),
    description: document.getElementById('productDesc').value,
    sizes: document.getElementById('productSizes').value.split(',').map((s) => s.trim()).filter(Boolean),
    stock: parseInt(document.getElementById('productStock').value, 10) || 0,
    image, active: document.getElementById('productActive').checked,
    featured: document.getElementById('productFeatured').checked,
  };
  if (!storeData.products) storeData.products = [];
  const idx = storeData.products.findIndex((p) => p.id === id);
  if (idx >= 0) storeData.products[idx] = product; else storeData.products.push(product);
  await saveStore('Produit sauvegardé!');
  document.getElementById('productModal').classList.add('hidden');
  renderProducts();
});

setupUpload('productUploadZone', 'productImageFile', 'productImagePreview', (d) => { pendingProductImage = d; });

// Site form
function loadSiteForm() {
  const s = storeData.site || {};
  document.getElementById('siteName').value = s.name || '';
  document.getElementById('siteTagline').value = s.tagline || '';
  document.getElementById('siteAnnouncement').value = s.announcement || '';
  document.getElementById('siteHeroTitle').value = s.heroTitle || '';
  document.getElementById('siteHeroSubtitle').value = s.heroSubtitle || '';
  document.getElementById('siteHeroCta').value = s.heroCta || '';
  document.getElementById('siteInstagram').value = s.instagram || '';
  document.getElementById('siteInstagramHandle').value = s.instagramHandle || '';
  document.getElementById('siteEmail').value = s.email || '';
  document.getElementById('sitePhone').value = s.phone || '';
  document.getElementById('bundleTitle').value = s.bundle?.title || '';
  document.getElementById('bundleText').value = s.bundle?.text || '';
  document.getElementById('bundleCta').value = s.bundle?.cta || '';
  document.getElementById('emailCapTitle').value = s.emailCapture?.title || '';
  document.getElementById('emailCapSubtitle').value = s.emailCapture?.subtitle || '';
  document.getElementById('emailCapBtn').value = s.emailCapture?.button || '';
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
      <span class="crypto-edit-label">${esc(c.symbol)} <small>${esc(c.network)}</small></span>
      <input class="crypto-edit-addr" value="${esc(c.address)}" placeholder="Adresse ${esc(c.symbol)} (colle ton wallet)">
    </div>
  `).join('');
}

document.getElementById('siteForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  storeData.site = {
    ...storeData.site,
    name: document.getElementById('siteName').value,
    tagline: document.getElementById('siteTagline').value,
    announcement: document.getElementById('siteAnnouncement').value,
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
    bundle: {
      title: document.getElementById('bundleTitle').value,
      text: document.getElementById('bundleText').value,
      cta: document.getElementById('bundleCta').value,
    },
    emailCapture: {
      title: document.getElementById('emailCapTitle').value,
      subtitle: document.getElementById('emailCapSubtitle').value,
      button: document.getElementById('emailCapBtn').value,
      placeholder: 'ton@email.com',
    },
    crypto: [...document.querySelectorAll('#cryptoEditor .crypto-edit-row')].map((r) => ({
      symbol: r.dataset.symbol, label: r.dataset.label, network: r.dataset.network,
      address: r.querySelector('.crypto-edit-addr').value.trim(),
    })),
  };
  pendingHeroImage = null; pendingLogo = null;
  await saveStore('Site mis à jour!');
});

setupUpload('heroUploadZone', 'heroImageFile', 'heroImagePreview', (d) => { pendingHeroImage = d; });
setupUpload('logoUploadZone', 'logoFile', 'logoPreview', (d) => { pendingLogo = d; });

// Sections editor
function renderSectionEditors() {
  const s = storeData.site || {};
  const sec = s.sections || {};
  document.getElementById('sectionToggles').innerHTML = [
    ['announcement', 'Barre annonce'], ['trustBar', 'Badges confiance'],
    ['bundle', 'Complete le look'], ['gallery', 'Ils portent MENES'],
    ['why', 'Pourquoi MENES'], ['emailCapture', 'Liste VIP email'],
    ['faq', 'FAQ'], ['guarantee', 'Texte sécurité'],
  ].map(([k, label]) => `<label class="toggle-item"><input type="checkbox" data-sec="${k}" ${sec[k] !== false ? 'checked' : ''}> ${label}</label>`).join('');

  document.getElementById('trustEditor').innerHTML = (s.trust || []).map((t, i) => trustRow(t, i)).join('');
  document.getElementById('whyEditor').innerHTML = (s.why || []).map((w, i) => whyRow(w, i)).join('');
  document.getElementById('faqEditor').innerHTML = (s.faq || []).map((f, i) => faqRow(f, i)).join('');
  document.getElementById('siteGuarantee').value = s.guarantee || '';
  document.getElementById('galleryTitle').value = s.galleryTitle || '';
  document.getElementById('gallerySubtitle').value = s.gallerySubtitle || '';
}

function galleryRow(g, i) {
  return `<div class="gallery-edit-row editor-row col" data-i="${i}">
    <label class="upload-label">Photo client
      <div class="upload-zone small gallery-upload" data-i="${i}">
        <img class="gallery-preview ${g.image ? '' : 'hidden'}" src="${esc(g.image)}" alt="">
        <span>${g.image ? 'Changer photo' : '📷 Ajouter photo'}</span>
        <input type="file" class="gallery-file" accept="image/*" hidden>
      </div>
    </label>
    <input type="hidden" class="gallery-image" value="${esc(g.image)}">
    <input class="gallery-caption" value="${esc(g.caption)}" placeholder="Légende (ex: Hoodie MENES Noir)">
    <input class="gallery-handle" value="${esc(g.handle)}" placeholder="@client (optionnel)">
    <button type="button" class="del-row" onclick="this.parentElement.remove()">✕ Supprimer</button>
  </div>`;
}

function renderGalleryEditor() {
  const list = storeData.site?.gallery?.length ? storeData.site.gallery : [{ image: '', caption: '', handle: '' }];
  const editor = document.getElementById('galleryEditor');
  if (!editor) return;
  editor.innerHTML = list.map((g, i) => galleryRow(g, i)).join('');
  editor.querySelectorAll('.gallery-upload').forEach((zone) => {
    const fileInput = zone.querySelector('.gallery-file');
    const preview = zone.querySelector('.gallery-preview');
    const hidden = zone.closest('.gallery-edit-row').querySelector('.gallery-image');
    zone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      if (!fileInput.files[0]) return;
      try {
        const dataUrl = await compressImage(fileInput.files[0], 800, 0.82);
        preview.src = dataUrl;
        preview.classList.remove('hidden');
        hidden.value = dataUrl;
        toast('Photo galerie optimisée ✓');
      } catch { toast('Erreur photo', 'error'); }
    });
  });
}

document.getElementById('addGalleryBtn')?.addEventListener('click', () => {
  document.getElementById('galleryEditor').insertAdjacentHTML('beforeend', galleryRow({ image: '', caption: '', handle: '' }, 99));
});

function trustRow(t, i) {
  return `<div class="editor-row" data-i="${i}"><input class="trust-icon" value="${esc(t.icon)}" placeholder="🔒"><input class="trust-title" value="${esc(t.title)}"><input class="trust-text" value="${esc(t.text)}"><button type="button" class="del-row" onclick="this.parentElement.remove()">✕</button></div>`;
}
function whyRow(w, i) {
  return `<div class="editor-row" data-i="${i}"><input class="why-title" value="${esc(w.title)}" placeholder="Titre"><textarea class="why-text" rows="2">${esc(w.text)}</textarea><button type="button" class="del-row" onclick="this.parentElement.remove()">✕</button></div>`;
}
function faqRow(f, i) {
  return `<div class="editor-row col" data-i="${i}"><input class="faq-q" value="${esc(f.q)}" placeholder="Question"><textarea class="faq-a" rows="2">${esc(f.a)}</textarea><button type="button" class="del-row" onclick="this.parentElement.remove()">✕</button></div>`;
}

document.getElementById('addTrustBtn').addEventListener('click', () => {
  document.getElementById('trustEditor').insertAdjacentHTML('beforeend', trustRow({ icon:'◆', title:'', text:'' }, 99));
});
document.getElementById('addWhyBtn').addEventListener('click', () => {
  document.getElementById('whyEditor').insertAdjacentHTML('beforeend', whyRow({ title:'', text:'' }, 99));
});
document.getElementById('addFaqBtn').addEventListener('click', () => {
  document.getElementById('faqEditor').insertAdjacentHTML('beforeend', faqRow({ q:'', a:'' }, 99));
});

document.getElementById('saveSectionsBtn').addEventListener('click', async () => {
  const sections = {};
  document.querySelectorAll('#sectionToggles input').forEach((cb) => { sections[cb.dataset.sec] = cb.checked; });
  storeData.site.sections = sections;
  storeData.site.trust = [...document.querySelectorAll('#trustEditor .editor-row')].map((r) => ({
    icon: r.querySelector('.trust-icon').value, title: r.querySelector('.trust-title').value, text: r.querySelector('.trust-text').value,
  }));
  storeData.site.why = [...document.querySelectorAll('#whyEditor .editor-row')].map((r) => ({
    title: r.querySelector('.why-title').value, text: r.querySelector('.why-text').value,
  }));
  storeData.site.faq = [...document.querySelectorAll('#faqEditor .editor-row')].map((r) => ({
    q: r.querySelector('.faq-q').value, a: r.querySelector('.faq-a').value,
  }));
  storeData.site.guarantee = document.getElementById('siteGuarantee').value;
  storeData.site.galleryTitle = document.getElementById('galleryTitle').value;
  storeData.site.gallerySubtitle = document.getElementById('gallerySubtitle').value;
  storeData.site.gallery = [...document.querySelectorAll('#galleryEditor .gallery-edit-row')].map((r) => ({
    image: r.querySelector('.gallery-image').value,
    caption: r.querySelector('.gallery-caption').value,
    handle: r.querySelector('.gallery-handle').value,
  }));
  await saveStore('Sections sauvegardées!');
});

function renderOrders() {
  const orders = storeData.orders || [];
  document.getElementById('ordersList').innerHTML = orders.length ? orders.map((o) => `
    <div class="order-item"><strong>#${o.id}</strong> · ${o.customer?.name} · ${o.total?.toFixed(2)}$<br><small>${o.customer?.email}</small></div>
  `).join('') : '<p class="empty">Aucune commande.</p>';
}

document.getElementById('exportDataBtn').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(storeData, null, 2)], { type: 'application/json' }));
  a.download = 'menes-backup.json'; a.click();
});
document.getElementById('importDataBtn').addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    storeData = JSON.parse(ev.target.result);
    await saveStore('Backup restauré!');
    loadSiteForm(); renderProducts(); renderSectionEditors(); updateDashboard();
  };
  reader.readAsText(file);
});

(async () => {
  await loadStore();
  adminPassword = sessionStorage.getItem(PW_KEY) || '';
  if (sessionStorage.getItem(AUTH_KEY) && adminPassword) showApp();
  else if (sessionStorage.getItem(AUTH_KEY) && !adminPassword) {
    sessionStorage.removeItem(AUTH_KEY);
  }
})();
