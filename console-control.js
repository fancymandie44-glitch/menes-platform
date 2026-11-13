/* MENES Control Center — intel, tracking, health, upsells, automations */
(function () {
  const KPI_KEY = 'menes_cc_kpis';
  const ALL_KPIS = [
    { id: 'today', label: 'Aujourd’hui' },
    { id: 'week', label: '7 jours' },
    { id: 'month', label: 'Mois' },
    { id: 'year', label: 'Année' },
    { id: 'aov', label: 'AOV' },
    { id: 'conversion', label: 'Conversion checkout' },
    { id: 'returning', label: 'Clients récurrents' },
    { id: 'abandoned', label: 'Checkouts abandonnés' },
    { id: 'inventory', label: 'Alertes stock' },
  ];

  function money(n) {
    const v = Number(n) || 0;
    return `${v.toFixed(2)}$ CAD`;
  }

  function chosenKpis() {
    try {
      const raw = JSON.parse(localStorage.getItem(KPI_KEY) || 'null');
      if (Array.isArray(raw) && raw.length) return raw;
    } catch {}
    return ALL_KPIS.map((k) => k.id);
  }

  async function fetchJson(path, opts) {
    const res = await fetch(apiUrl(path), { headers: headers(), ...(opts || {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function spark(el, series) {
    if (!el) return;
    const vals = (series || []).map((d) => Number(d.net) || 0);
    const max = Math.max(...vals, 1);
    const w = 320;
    const h = 64;
    const pts = vals.map((v, i) => {
      const x = vals.length <= 1 ? w / 2 : (i / (vals.length - 1)) * w;
      const y = h - 4 - (v / max) * (h - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" class="sparkline" preserveAspectRatio="none"><polyline class="sparkline-line" points="${pts}"/></svg>`;
  }

  window.ccRenderOverview = function ccRenderOverview(intel) {
    const host = document.getElementById('ccIntel');
    if (!host || !intel) return;
    const p = intel.periods || {};
    const map = {
      today: { n: money(p.today?.net), s: `${p.today?.vsPrevPct || 0}% vs hier`, d: intel.definitions?.net },
      week: { n: money(p.week?.net), s: `${p.week?.vsPrevPct || 0}% vs 7j préc.`, d: intel.definitions?.net },
      month: { n: money(p.month?.net), s: `${p.month?.vsPrevPct || 0}% vs mois préc.`, d: intel.definitions?.net },
      year: { n: money(p.year?.net), s: `${p.year?.orders || 0} cmd`, d: intel.definitions?.net },
      aov: { n: money(intel.all?.aov), s: intel.definitions?.aov, d: intel.definitions?.aov },
      conversion: { n: `${intel.conversion || 0}%`, s: intel.definitions?.conversion, d: intel.definitions?.conversion },
      returning: { n: `${intel.customers?.returningRate || 0}%`, s: `${intel.customers?.returningCount || 0} récurrents`, d: intel.definitions?.returning },
      abandoned: { n: String((intel.abandoned || []).length), s: intel.definitions?.abandoned, d: intel.definitions?.abandoned },
      inventory: { n: String((intel.inventory || []).length), s: 'Seuil 5 unités', d: 'Stock produit / variante ≤ 5' },
    };
    const picks = chosenKpis();
    host.innerHTML = `
      <div class="cc-kpi-bar">${ALL_KPIS.map((k) => `
        <label class="cc-kpi-toggle"><input type="checkbox" data-kpi="${k.id}" ${picks.includes(k.id) ? 'checked' : ''}> ${esc(k.label)}</label>`).join('')}</div>
      <div class="stats-grid cc-stats">${picks.map((id) => {
        const k = ALL_KPIS.find((x) => x.id === id);
        const v = map[id] || { n: '—', s: '' };
        return `<div class="stat-card" title="${esc(v.d || '')}"><span class="stat-num">${esc(v.n)}</span><span class="stat-label">${esc(k?.label || id)}</span><span class="stat-delta">${esc(v.s || '')}</span></div>`;
      }).join('')}</div>
      <div class="grid-2">
        <div class="card"><h3>Meilleures ventes (payé)</h3>
          <div class="mini-list">${(intel.bestSellers || []).slice(0, 8).map((p) => `<div class="mini-row"><span>${esc(p.name)}</span><strong>${esc(money(p.revenue))}</strong></div>`).join('') || '<p class="empty">Pas encore de ventes payées</p>'}</div>
        </div>
        <div class="card"><h3>Collections</h3>
          <div class="mini-list">${(intel.collections || []).slice(0, 8).map((c) => `<div class="mini-row"><span>${esc(c.id)}</span><strong>${esc(money(c.revenue))}</strong></div>`).join('') || '<p class="empty">—</p>'}</div>
        </div>
      </div>
      <div class="grid-2">
        <div class="card"><h3>Stock à surveiller</h3>
          <div class="mini-list">${(intel.inventory || []).slice(0, 10).map((a) => `<div class="mini-row"><span>${esc(a.name)} ${esc(a.variant || '')}</span><strong class="${a.level === 'out' ? 'cc-bad' : 'cc-warn'}">${a.stock}</strong></div>`).join('') || '<p class="empty">Aucun seuil dépassé</p>'}</div>
        </div>
        <div class="card"><h3>Checkouts abandonnés (&gt;1 h)</h3>
          <div class="mini-list">${(intel.abandoned || []).slice(0, 10).map((a) => `<div class="mini-row"><span>${esc(a.email || a.id)}</span><strong>${esc(money(a.total))}</strong></div>`).join('') || '<p class="empty">Aucun</p>'}</div>
        </div>
      </div>
      <div class="card">
        <h3>Profit estimé</h3>
        ${intel.profit?.available
          ? `<p>Net ${esc(money(intel.profit.net))} − COGS ${esc(money(intel.profit.cogs))} = <strong>${esc(money(intel.profit.estimate))}</strong>. Lignes sans coût: ${intel.profit.linesMissingCost}.</p>`
          : `<p class="hint">${esc(intel.profit?.reason || '')}</p>`}
        <p class="hint">${esc(intel.ads?.reason || '')}</p>
        <div id="ccSpark30" class="revenue-chart"></div>
      </div>`;
    spark(document.getElementById('ccSpark30'), intel.series30);
    host.querySelectorAll('[data-kpi]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const next = [...host.querySelectorAll('[data-kpi]:checked')].map((x) => x.dataset.kpi);
        localStorage.setItem(KPI_KEY, JSON.stringify(next.length ? next : ['today']));
        ccRenderOverview(intel);
      });
    });
  };

  window.ccLoadOverview = async function () {
    try {
      const data = await fetchJson('/api/intel');
      window.__ccIntel = data.intel;
      ccRenderOverview(data.intel);
    } catch (e) {
      const host = document.getElementById('ccIntel');
      if (host) host.innerHTML = `<p class="hint">Intel indisponible: ${esc(e.message)}</p>`;
    }
  };

  window.ccLoadTracking = async function () {
    const t = storeData?.site?.tracking || {};
    const secretsNote = document.getElementById('ccTrackSecrets');
    const pix = document.getElementById('ccMetaPixel');
    const tik = document.getElementById('ccTiktokPixel');
    const ga = document.getElementById('ccGa4');
    const test = document.getElementById('ccTrackTest');
    if (pix) pix.value = t.metaPixelId || '';
    if (tik) tik.value = t.tiktokPixelId || '';
    if (ga) ga.value = t.ga4MeasurementId || '';
    if (test) test.checked = t.testMode === true;
    try {
      const data = await fetchJson('/api/intel');
      const by = data.intel?.tracking?.byEvent || {};
      const box = document.getElementById('ccTrackEvents');
      if (box) {
        box.innerHTML = Object.keys(by).map((ev) => {
          const s = by[ev];
          const state = s.ok ? 'ok' : (s.fail ? 'fail' : 'miss');
          return `<div class="cc-event ${state}"><strong>${esc(ev)}</strong><span>${s.ok} ok · ${s.fail} fail</span><em>${esc(s.last || 'jamais')}</em></div>`;
        }).join('') || '<p class="hint">Aucun événement serveur encore. Les tokens CAPI/Events/GA4 MP se configurent dans Netlify (META_CAPI_TOKEN, TIKTOK_EVENTS_TOKEN, GA4_API_SECRET) — jamais dans cette page.</p>';
      }
      if (secretsNote) secretsNote.textContent = 'Pixel IDs publics seulement. Tokens serveur: variables d’environnement Netlify.';
    } catch (e) {
      if (secretsNote) secretsNote.textContent = e.message;
    }
  };

  window.ccSaveTracking = async function () {
    storeData.site = storeData.site || {};
    storeData.site.tracking = {
      metaPixelId: document.getElementById('ccMetaPixel')?.value.trim() || '',
      tiktokPixelId: document.getElementById('ccTiktokPixel')?.value.trim() || '',
      ga4MeasurementId: document.getElementById('ccGa4')?.value.trim() || '',
      testMode: document.getElementById('ccTrackTest')?.checked === true,
    };
    await saveStore('Tracking sauvegardé');
  };

  window.ccRunHealth = async function () {
    const box = document.getElementById('ccHealth');
    if (box) box.textContent = 'Vérification en cours…';
    try {
      const data = await fetchJson('/api/diagnostics', { method: 'POST' });
      const r = data.report;
      if (!box) return;
      box.innerHTML = `
        <div class="stat-card highlight"><span class="stat-num">${r.score}</span><span class="stat-label">System Health Score · ${esc(r.grade)}</span></div>
        <p class="hint">Shopify: ${esc(r.shopify?.reason || '')}</p>
        <div class="mini-list">${(r.checks || []).map((c) => `<div class="mini-row"><span>${esc(c.label)}</span><strong class="${c.ok ? 'cc-ok' : (c.optional ? 'cc-warn' : 'cc-bad')}">${c.ok ? 'OK' : (c.optional ? 'non configuré' : 'échec')}</strong></div>${c.action && !c.ok ? `<p class="hint">${esc(c.action)}</p>` : ''}`).join('')}</div>
        <p class="hint">Ping ${r.pingMs} ms · ${r.orders} commandes en blob.</p>`;
    } catch (e) {
      if (box) box.innerHTML = `<p class="hint">${esc(e.message)}</p>`;
    }
  };

  window.ccLoadUpsells = function () {
    const u = storeData?.site?.upsells || {};
    const ids = document.getElementById('ccUpsellIds');
    const min = document.getElementById('ccUpsellMin');
    const en = document.getElementById('ccUpsellOn');
    if (ids) ids.value = (u.cartProductIds || []).join(', ');
    if (min) min.value = u.minCart || 0;
    if (en) en.checked = u.enabled !== false;
    const box = document.getElementById('ccUpsellStats');
    const stats = storeData?.upsellStats || {};
    if (box) {
      box.innerHTML = Object.keys(stats).length
        ? Object.entries(stats).map(([id, s]) => `<div class="mini-row"><span>${esc(id)}</span><strong>${s.impressions || 0} vues · ${s.adds || 0} ajouts · ${esc(money(s.revenue))}</strong></div>`).join('')
        : '<p class="hint">Les stats d’upsell s’accumulent quand un client ajoute une reco (compte local boutique, pas simulé).</p>';
    }
  };

  window.ccSaveUpsells = async function () {
    storeData.site = storeData.site || {};
    storeData.site.upsells = {
      enabled: document.getElementById('ccUpsellOn')?.checked !== false,
      minCart: parseFloat(document.getElementById('ccUpsellMin')?.value) || 0,
      cartProductIds: String(document.getElementById('ccUpsellIds')?.value || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12),
    };
    await saveStore('Upsells sauvegardés');
  };

  window.ccLoadAutomations = function () {
    const list = document.getElementById('ccAutoList');
    const rules = storeData.automations || [
      { id: 'vip200', trigger: 'order_paid', action: 'tag_vip', threshold: 200, enabled: true },
    ];
    storeData.automations = rules;
    if (!list) return;
    list.innerHTML = rules.map((r, i) => `<div class="mini-row"><span>SI commande payée ET LTV ≥ ${esc(r.threshold)} ALORS tag VIP</span><button type="button" class="btn-outline btn-sm" data-auto="${i}">${r.enabled === false ? 'Activer' : 'Pause'}</button></div>`).join('');
    list.querySelectorAll('[data-auto]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const i = Number(btn.dataset.auto);
        storeData.automations[i].enabled = storeData.automations[i].enabled === false;
        await saveStore('Automation mise à jour');
        ccLoadAutomations();
      });
    });
    const alerts = document.getElementById('ccAlerts');
    if (alerts) {
      alerts.innerHTML = (storeData.alerts || []).slice(0, 20).map((a) => `<div class="mini-row"><span>${esc(a.message)}</span><em>${esc(a.at || '')}</em></div>`).join('') || '<p class="empty">Aucune alerte stock encore</p>';
    }
  };

  window.ccLoadInventory = function () {
    const box = document.getElementById('ccInventory');
    if (!box) return;
    const intel = window.__ccIntel;
    const rows = intel?.inventory || [];
    box.innerHTML = rows.length
      ? `<table class="data-table"><thead><tr><th>Produit</th><th>Variante</th><th>Stock</th><th>Niveau</th></tr></thead><tbody>${rows.map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(a.variant)}</td><td>${a.stock}</td><td>${esc(a.level)}</td></tr>`).join('')}</tbody></table>`
      : '<p class="empty">Aucun produit sous le seuil (5). Les stocks vivent dans le blob MENES, pas Shopify.</p>';
    if (!intel) ccLoadOverview().then(() => ccLoadInventory());
  };

  window.ccLoadRecovery = function () {
    const r = storeData.cartRecovery || { enabled: false, delays: [1, 24, 48], discountCode: '' };
    const on = document.getElementById('ccRecOn');
    const delays = document.getElementById('ccRecDelays');
    const code = document.getElementById('ccRecCode');
    if (on) on.checked = r.enabled === true;
    if (delays) delays.value = (r.delays || [1, 24, 48]).join(', ');
    if (code) code.value = r.discountCode || '';
    const list = document.getElementById('ccRecList');
    const abandoned = window.__ccIntel?.abandoned || [];
    if (list) {
      list.innerHTML = abandoned.map((a) => `<div class="mini-row"><span>${esc(a.email || 'sans email')} · ${esc((a.items || []).join(', '))}</span><strong>${esc(money(a.total))}</strong></div>`).join('') || '<p class="empty">Aucun checkout pending &gt; 1 h</p>';
    }
    const note = document.getElementById('ccRecNote');
    if (note) {
      note.textContent = r.enabled
        ? 'Les rappels ne partent que si RESEND_API_KEY/SMTP est configuré ET si le client a un consentement marketing. Sinon la file reste visible ici sans envoi.'
        : 'Active la récupération seulement après consentement. Les paniers localStorage ne sont pas récupérables.';
    }
  };

  window.ccSaveRecovery = async function () {
    storeData.cartRecovery = {
      enabled: document.getElementById('ccRecOn')?.checked === true,
      delays: String(document.getElementById('ccRecDelays')?.value || '1,24,48').split(',').map((n) => parseInt(n, 10)).filter((n) => n > 0).slice(0, 5),
      discountCode: document.getElementById('ccRecCode')?.value.trim() || '',
    };
    await saveStore('Récupération panier enregistrée');
  };

  window.ccGlobalSearch = function (q) {
    const box = document.getElementById('ccSearchHits');
    if (!box) return;
    const s = String(q || '').trim().toLowerCase();
    if (s.length < 2) { box.innerHTML = ''; return; }
    const hits = [];
    (storeData.products || []).forEach((p) => {
      if (String(p.name || '').toLowerCase().includes(s) || String(p.id).includes(s)) hits.push({ tab: 'products', label: p.name });
    });
    (storeData.orders || []).forEach((o) => {
      if (String(o.id || '').toLowerCase().includes(s) || String(o.customer?.email || '').toLowerCase().includes(s)) hits.push({ tab: 'orders', label: `${o.id} · ${o.customer?.email || ''}` });
    });
    box.innerHTML = hits.slice(0, 12).map((h) => `<button type="button" class="quick-card" data-jump="${esc(h.tab)}">${esc(h.label)}</button>`).join('');
    box.querySelectorAll('[data-jump]').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.jump)));
  };

  window.ccExportCustomers = function () {
    const rows = [['email', 'name', 'orders', 'ltv']];
    const map = new Map();
    (storeData.orders || []).forEach((o) => {
      if (!['paid', 'processing', 'shipped', 'delivered'].includes(String(o.status || ''))) return;
      const email = o.customer?.email;
      if (!email) return;
      const prev = map.get(email) || { email, name: o.customer.name || '', orders: 0, ltv: 0 };
      prev.orders += 1;
      prev.ltv += Number(o.total) || 0;
      map.set(email, prev);
    });
    [...map.values()].forEach((c) => rows.push([c.email, c.name, c.orders, c.ltv.toFixed(2)]));
    const blob = new Blob([rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'menes-customers.csv';
    a.click();
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('ccTrackSave')?.addEventListener('click', () => window.ccSaveTracking());
    document.getElementById('ccUpsellSave')?.addEventListener('click', () => window.ccSaveUpsells());
    document.getElementById('ccRecSave')?.addEventListener('click', () => window.ccSaveRecovery());
    document.getElementById('ccHealthRun')?.addEventListener('click', () => window.ccRunHealth());
    document.getElementById('ccExportCustomers')?.addEventListener('click', () => window.ccExportCustomers());
    document.getElementById('ccSearch')?.addEventListener('input', (e) => window.ccGlobalSearch(e.target.value));
  });
})();
