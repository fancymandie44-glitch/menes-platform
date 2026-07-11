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
  return {
    id: draft.orderId || Date.now().toString(36).toUpperCase(),
    customer: draft.customer,
    items: draft.items,
    subtotal: draft.subtotal ?? draft.total,
    tax: draft.tax || { amount: 0, label: '' },
    total: draft.total,
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

  const rows = draft.items.map((item) => `
    <div class="summary-row">
      <span>${esc(item.name)} (${esc(item.size)}) ×${item.qty}</span>
      <span>${(item.price * item.qty).toFixed(2)}$</span>
    </div>
  `);
  const subtotal = draft.subtotal ?? draft.total;
  rows.push(`<div class="summary-row"><span>Sous-total</span><span>${subtotal.toFixed(2)}$</span></div>`);
  if (draft.tax?.amount > 0) {
    rows.push(`<div class="summary-row"><span>Taxes · ${esc(draft.tax.label)}</span><span>${draft.tax.amount.toFixed(2)}$</span></div>`);
  }
  rows.push('<div class="summary-row"><span>Livraison</span><span>Gratuite</span></div>');
  document.getElementById('summaryItems').innerHTML = rows.join('');

  document.getElementById('summaryTotal').textContent = `${draft.total.toFixed(2)}$`;

  if (draft.customer) {
    const c = draft.customer;
    document.getElementById('summaryCustomer').innerHTML = `
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
  sessionStorage.removeItem('menes_cart');
  showToast('✓ Paiement reçu! Merci pour ta commande.');
  history.replaceState({}, '', '/paiement.html');
}
