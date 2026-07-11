const STORAGE_KEY = 'menes_store_data';
const API = '/api/store';
let storeData = null;
let cart = JSON.parse(localStorage.getItem('menes_cart') || '[]');
let currentFilter = 'all';

async function loadStoreData() {
  try {
    const res = await fetch(API, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return data;
    }
  } catch {}

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return JSON.parse(saved);

  try {
    const res = await fetch('/data/store.json');
    return await res.json();
  } catch {
    return { site: {}, products: [] };
  }
}

async function refreshStore() {
  storeData = await loadStoreData();
  applySiteSettings();
  renderProducts();
}

async function init() {
  await refreshStore();
  updateCartUI();

  // Payment success
  const params = new URLSearchParams(location.search);
  if (params.get('paid') === '1') {
    cart = [];
    localStorage.removeItem('menes_cart');
    updateCartUI();
    alert('Merci! Paiement reçu. On te contacte bientôt.');
    history.replaceState({}, '', location.pathname);
  }
}

window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY && e.newValue) {
    storeData = JSON.parse(e.newValue);
    applySiteSettings();
    renderProducts();
  }
});

// Auto-refresh every 15s
setInterval(refreshStore, 15000);

function applySiteSettings() {
  const s = storeData?.site || {};
  document.title = `${s.name || 'MENES'} — Boutique`;
  document.getElementById('navBrand').textContent = s.name || 'MENES';
  document.getElementById('heroTag').textContent = s.tagline || '';
  document.getElementById('heroTitle').textContent = s.heroTitle || 'MENES';
  document.getElementById('heroSubtitle').textContent = s.heroSubtitle || '';
  document.getElementById('footerBrand').textContent = s.name || 'MENES';
  if (s.instagram) document.getElementById('linkInstagram').href = s.instagram;
  if (s.email) {
    document.getElementById('linkEmail').href = `mailto:${s.email}`;
    document.getElementById('linkEmail').textContent = s.email;
  }
}

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  const products = (storeData?.products || []).filter((p) => {
    if (!p.active) return false;
    return currentFilter === 'all' || p.category === currentFilter;
  });

  if (!products.length) {
    grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#888;padding:40px">Aucun produit pour le moment. Reviens bientôt!</p>';
    return;
  }

  grid.innerHTML = products.map((p) => `
    <article class="product-card">
      <div class="product-img">${p.image ? `<img src="${p.image}" alt="${p.name}">` : '◆'}</div>
      <div class="product-body">
        <h3>${p.name}</h3>
        <p>${p.description || ''}</p>
        <div class="product-price">${p.price}$ CAD</div>
        ${p.sizes?.length ? `<select id="size-${p.id}">${p.sizes.map((s) => `<option>${s}</option>`).join('')}</select>` : ''}
        <button onclick="addToCart('${p.id}')">Ajouter au panier</button>
      </div>
    </article>
  `).join('');
}

window.addToCart = (id) => {
  const product = storeData.products.find((p) => p.id === id);
  if (!product) return;
  const sizeEl = document.getElementById(`size-${id}`);
  const size = sizeEl ? sizeEl.value : 'Unique';
  const existing = cart.find((c) => c.id === id && c.size === size);
  if (existing) existing.qty++;
  else cart.push({ id, name: product.name, price: product.price, size, qty: 1 });
  localStorage.setItem('menes_cart', JSON.stringify(cart));
  updateCartUI();
  toast('Ajouté au panier!');
};

function toast(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0a0a0a;color:#fff;padding:12px 24px;border-radius:4px;z-index:999;font-size:0.9rem';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

function updateCartUI() {
  const count = cart.reduce((s, c) => s + c.qty, 0);
  const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
  document.getElementById('cartCount').textContent = count;
  document.getElementById('cartTotal').textContent = `${total.toFixed(2)}$`;
  document.getElementById('cartItems').innerHTML = cart.length
    ? cart.map((c) => `<div class="cart-item"><span>${c.name} (${c.size}) x${c.qty}</span><span>${(c.price * c.qty).toFixed(2)}$</span></div>`).join('')
    : '<p style="color:#888;padding:20px 0">Panier vide</p>';
}

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

document.querySelectorAll('.filter').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.cat;
    renderProducts();
  });
});

document.getElementById('checkoutBtn').addEventListener('click', () => {
  if (!cart.length) return alert('Panier vide');
  document.getElementById('checkoutModal').classList.remove('hidden');
});
document.getElementById('cancelCheckout').addEventListener('click', () => {
  document.getElementById('checkoutModal').classList.add('hidden');
});

document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const customer = {
    name: form.get('name'),
    email: form.get('email'),
    phone: form.get('phone'),
    address: form.get('address'),
  };
  const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const order = {
    id: Date.now().toString(36).toUpperCase(),
    customer,
    items: [...cart],
    total,
    status: 'pending',
    date: new Date().toISOString(),
  };

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Traitement...';

  try {
    const res = await fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    });
    const data = await res.json();
    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
      return;
    }
  } catch {}

  // Fallback email
  await fetch('https://formsubmit.co/ajax/mymenes2022@gmail.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      _subject: `Commande MENES #${order.id}`,
      _template: 'table',
      Client: customer.name,
      Email: customer.email,
      Téléphone: customer.phone,
      Adresse: customer.address,
      Total: `${total.toFixed(2)}$ CAD`,
      Articles: cart.map((c) => `${c.name} (${c.size}) x${c.qty}`).join(', '),
    }),
  }).catch(() => {});

  cart = [];
  localStorage.removeItem('menes_cart');
  updateCartUI();
  document.getElementById('checkoutModal').classList.add('hidden');
  closeCart();
  alert('Commande envoyée! Tu recevras un email. Envoie un lien Square au client.');
  btn.disabled = false;
  btn.textContent = 'Continuer vers le paiement Square';
});

init();
