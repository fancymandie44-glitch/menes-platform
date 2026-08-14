const DRAFT_KEY = 'menes_checkout_draft';

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

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2800);
}

function loadDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
  } catch {
    return null;
  }
}

function buildOrder(draft) {
  const discount = draft.discount || { amount: 0, code: '', label: '' };
  return {
    id: draft.orderId || Date.now().toString(36).toUpperCase(),
    customer: draft.customer,
    items: draft.items,
    subtotal: draft.subtotal ?? draft.total,
    discount,
    tax: draft.tax || { amount: 0, label: '' },
    total: draft.total,
    promoCode: discount.code || '',
    status: 'pending',
    date: new Date().toISOString(),
  };
}

async function processPayment(method) {
  const draft = loadDraft();
  if (!draft?.items?.length || !draft.customer) {
    window.location.href = '/';
    return;
  }

  const note = document.getElementById('payNote');
  const order = buildOrder(draft);
  const btns = [document.getElementById('payKlarna'), document.getElementById('payPaypal')];
  btns.forEach((b) => { b.disabled = true; });
  note.textContent = 'Redirection sécurisée...';
  note.className = 'checkout-note';

  try {
    const res = await fetch(shopApi('/api/pay'), {
      method: 'POST',
      headers: shopHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ order, method }),
    });
    const data = await res.json();
    if (data.checkoutUrl) {
      sessionStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem('menes_cart');
      sessionStorage.removeItem('menes_cart');
      window.location.href = data.checkoutUrl;
      return;
    }
    note.textContent = data.error || 'Erreur de paiement. Réessaie ou contacte-nous.';
    note.className = 'checkout-note error';
  } catch {
    note.textContent = 'Erreur de connexion. Vérifie ta connexion internet.';
    note.className = 'checkout-note error';
  }

  btns.forEach((b) => { b.disabled = false; });
}

function renderSummary() {
  const draft = loadDraft();
  if (!draft?.items?.length) {
    window.location.href = '/';
    return;
  }

  const itemRows = draft.items.map((item) => {
    const variant = item.variantStr || item.size;
    const variantLabel = variant && variant !== 'Unique' ? ` · ${esc(variant)}` : '';
    return `<div class="sum-row"><span>${esc(item.name)}${variantLabel} ×${item.qty}</span><span>${(item.price * item.qty).toFixed(2)}$</span></div>`;
  });

  const subtotal = draft.subtotal ?? draft.total;
  const discount = draft.discount || { amount: 0, code: '', label: '' };
  const tax = draft.tax || { amount: 0, label: '' };

  const totals = [
    `<div class="sum-row"><span>Sous-total</span><span>${subtotal.toFixed(2)}$</span></div>`,
  ];

  if (discount.amount > 0) {
    const label = discount.code || discount.label || 'Rabais';
    totals.push(`<div class="sum-row sum-discount"><span>Rabais · ${esc(label)}</span><span>−${discount.amount.toFixed(2)}$</span></div>`);
  }

  if (tax.amount > 0) {
    totals.push(`<div class="sum-row"><span>Taxes · ${esc(tax.label)}</span><span>${tax.amount.toFixed(2)}$</span></div>`);
  }

  totals.push(`<div class="sum-row"><span>Livraison</span><span>Gratuite</span></div>`);

  document.getElementById('summaryItems').innerHTML = `
    <div class="sum-title">Articles</div>
    <div class="sum-items">${itemRows.join('')}</div>
    ${totals.join('')}
  `;

  document.getElementById('summaryTotal').textContent = `${draft.total.toFixed(2)}$`;

  if (draft.customer) {
    const c = draft.customer;
    document.getElementById('summaryCustomer').innerHTML = `
      <p class="summary-customer-label">Livraison</p>
      <p><strong>${esc(c.name)}</strong></p>
      <p>${esc(c.email)} · ${esc(c.phone)}</p>
      <p>${esc(c.address)}</p>
    `;
  }
}

document.getElementById('payKlarna').addEventListener('click', () => processPayment('klarna'));
document.getElementById('payPaypal').addEventListener('click', () => processPayment('paypal'));

renderSummary();

const params = new URLSearchParams(location.search);
if (params.get('paid') === '1') {
  sessionStorage.removeItem(DRAFT_KEY);
  localStorage.removeItem('menes_cart');
  sessionStorage.removeItem('menes_cart');
  showToast('Paiement reçu. Merci pour ta commande.');
  history.replaceState({}, '', '/paiement.html');
}
