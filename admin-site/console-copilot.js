/* MENES Copilot — floating operator + health / ads / approvals */
(function () {
  const state = { threadId: null, history: [], open: false };

  function admin() {
    return window.MENES_ADMIN || {};
  }

  function headers() {
    return admin().headers ? admin().headers() : { 'Content-Type': 'application/json' };
  }

  function apiUrl(path) {
    return admin().apiUrl ? admin().apiUrl(path) : path;
  }

  function siteId() {
    return admin().siteId ? admin().siteId() : 'menes';
  }

  function page() {
    return document.querySelector('.nav-btn.active')?.dataset.tab || 'dashboard';
  }

  function toast(msg, type) {
    if (admin().toast) admin().toast(msg, type);
  }

  function esc(s) {
    return admin().esc ? admin().esc(s) : String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  async function copilot(body) {
    let res;
    try {
      res = await fetch(apiUrl('/api/copilot'), {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ storeId: siteId(), page: page(), ...body }),
        signal: AbortSignal.timeout(28_000),
      });
    } catch (err) {
      if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new Error('Copilot timed out. Try a shorter question.');
      }
      throw new Error(err.message || 'Network error talking to Copilot');
    }
    const raw = await res.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(`Copilot HTTP ${res.status}: ${(raw || 'empty response').slice(0, 140)}`);
    }
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || data.reply || `Copilot HTTP ${res.status}`);
    }
    return data;
  }

  function logEl() {
    return document.getElementById('copilotLog');
  }

  function pushMsg(role, text) {
    const box = logEl();
    if (!box) return;
    const div = document.createElement('div');
    div.className = `copilot-msg ${role}`;
    div.textContent = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  async function sendChat(text) {
    const message = String(text || '').trim();
    if (!message) return;
    pushMsg('user', message);
    pushMsg('sys', 'Copilot is working…');
    try {
      const data = await copilot({
        action: 'chat',
        message,
        threadId: state.threadId,
        history: state.history,
      });
      state.threadId = data.threadId || state.threadId;
      const sys = logEl()?.querySelector('.copilot-msg.sys:last-child');
      if (sys) sys.remove();
      (data.steps || []).filter((s) => s.type === 'tool').forEach((s) => pushMsg('sys', s.text));
      pushMsg('bot', data.reply || data.error || 'No reply');
      state.history.push({ role: 'user', content: message });
      state.history.push({ role: 'assistant', content: data.reply || '' });
      if (page() === 'health') loadHealth();
      if (page() === 'approvals') loadApprovals();
    } catch (err) {
      const sys = logEl()?.querySelector('.copilot-msg.sys:last-child');
      if (sys) sys.remove();
      pushMsg('bot', err.message);
    }
  }

  function currentTab() {
    return document.querySelector('.tab.active')?.id?.replace(/^tab-/, '') || 'dashboard';
  }

  function fillAdForm(draft) {
    if (!draft) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    set('adCampaignName', draft.campaignName);
    set('adObjective', draft.objective || 'sales');
    set('adAudience', draft.audience);
    set('adPlacements', Array.isArray(draft.placements) ? draft.placements.join(', ') : draft.placements);
    set('adBudget', draft.dailyBudget);
    set('adPrimary', draft.primaryText);
    set('adHeadline', draft.headline);
    set('adDescription', draft.description);
    set('adCta', draft.cta || 'SHOP_NOW');
    set('adLanding', draft.landingPageUrl);
    set('adUtm', draft.utm ? new URLSearchParams(draft.utm).toString() : '');
    set('adVariations', (draft.variations || []).map((v, i) => `V${i + 1}\n${v.headline || ''}\n${v.primaryText || ''}`).join('\n\n'));
    const badge = document.getElementById('adComplianceBadge');
    if (badge) badge.textContent = 'Draft ready — review before spend';
  }

  async function autofillAd() {
    const product = document.getElementById('adProduct')?.value || document.getElementById('adPrompt')?.value;
    toast('Autofill with AI…');
    try {
      const data = await copilot({ action: 'autofill-ad', productId: product, message: document.getElementById('adPrompt')?.value });
      if (!data.ok) throw new Error(data.error || 'Autofill failed');
      fillAdForm(data.draft);
      if (data.compliance && !data.compliance.ok) {
        toast(data.compliance.issues.map((i) => i.message).join(' · '), 'error');
      } else {
        toast('Ad fields filled — review, then save draft', 'ok');
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function readAdDraft() {
    const utm = {};
    String(document.getElementById('adUtm')?.value || '').split('&').forEach((part) => {
      const [k, v] = part.split('=');
      if (k && v) utm[decodeURIComponent(k)] = decodeURIComponent(v);
    });
    return {
      campaignName: document.getElementById('adCampaignName')?.value,
      objective: document.getElementById('adObjective')?.value,
      audience: document.getElementById('adAudience')?.value,
      placements: String(document.getElementById('adPlacements')?.value || '').split(',').map((s) => s.trim()).filter(Boolean),
      dailyBudget: Number(document.getElementById('adBudget')?.value) || 0,
      primaryText: document.getElementById('adPrimary')?.value,
      headline: document.getElementById('adHeadline')?.value,
      description: document.getElementById('adDescription')?.value,
      cta: document.getElementById('adCta')?.value,
      landingPageUrl: document.getElementById('adLanding')?.value,
      utm,
      productId: document.getElementById('adProduct')?.value,
      platform: document.getElementById('adPlatform')?.value || 'meta',
      variations: String(document.getElementById('adVariations')?.value || '').split(/\n\s*\n/).filter(Boolean).map((block) => {
        const lines = block.split('\n').filter(Boolean);
        return { headline: lines[1] || lines[0], primaryText: lines.slice(2).join(' ') || lines[0] };
      }),
    };
  }

  async function saveAdDraft() {
    try {
      const data = await copilot({ action: 'save-ad', draft: readAdDraft() });
      if (data.error || data.ok === false) throw new Error(data.error || 'Save failed');
      const store = admin().store?.();
      if (store && data.ad) {
        store.ads = store.ads || [];
        store.ads.unshift(data.ad);
      }
      toast('Ad draft saved (not published)', 'ok');
      renderAds();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function renderAds() {
    const box = document.getElementById('adsList');
    if (!box) return;
    const ads = admin().store?.()?.ads || [];
    if (!ads.length) {
      box.innerHTML = '<p class="hint">No ad drafts yet.</p>';
      return;
    }
    box.innerHTML = ads.map((a) => `<div class="ad-row"><strong>${esc(a.campaignName || a.id)}</strong> · ${esc(a.status)} · ${esc(a.platform || 'meta')} · ${Number(a.dailyBudget || 0)}$/day</div>`).join('');
  }

  function renderSuppliers() {
    const box = document.getElementById('suppliersList');
    if (!box) return;
    const rows = admin().store?.()?.suppliers || [];
    box.innerHTML = rows.length
      ? `<table class="data-table"><thead><tr><th>Name</th><th>URL</th><th>Status</th></tr></thead><tbody>${
        rows.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.url || s.link)}</td><td>${esc(s.status || 'active')}</td></tr>`).join('')
      }</tbody></table>`
      : '<p class="hint">Add supplier catalog URLs so Copilot can ping them.</p>';
  }

  async function addSupplier() {
    const store = admin().store?.();
    if (!store) return;
    store.suppliers = store.suppliers || [];
    store.suppliers.push({
      id: `sup_${Date.now().toString(36)}`,
      name: document.getElementById('supName')?.value,
      url: document.getElementById('supUrl')?.value,
      status: 'active',
    });
    if (admin().saveStore) await admin().saveStore('Supplier added');
    renderSuppliers();
  }

  async function loadHealth() {
    const box = document.getElementById('healthBoard');
    if (!box) return;
    try {
      const res = await fetch(apiUrl(`/api/site-health?site=${encodeURIComponent(siteId())}`), { headers: headers() });
      const data = await res.json();
      const r = data.latest;
      if (!r) {
        box.innerHTML = '<p class="hint">No audit yet. Run a health check.</p>';
        return;
      }
      box.innerHTML = `
        <div class="health-score">${esc(r.score)}/100</div>
        <p>${esc(r.summary)}</p>
        <p class="hint">${esc(r.at)} · ${esc(r.mode)} · ${esc(r.origin || '')}</p>
        ${(r.issues || []).map((i) => `
          <div class="health-issue ${esc(i.severity)}">
            <div class="sev">${esc(i.severity)}</div>
            <strong>${esc(i.title)}</strong>
            <p class="hint">${esc(i.evidence)}</p>
            <p>${esc(i.suggestedFix)}</p>
          </div>`).join('')}`;
    } catch (err) {
      box.innerHTML = `<p class="hint">${esc(err.message)}</p>`;
    }
  }

  async function runHealth(mode, heal) {
    toast('Running health check…');
    try {
      const res = await fetch(apiUrl('/api/site-health'), {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ storeId: siteId(), mode, heal: !!heal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Health failed');
      toast(data.report?.summary || 'Health done', 'ok');
      await loadHealth();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function loadApprovals() {
    const box = document.getElementById('approvalsList');
    if (!box) return;
    const res = await fetch(apiUrl('/api/copilot?view=approvals'), { headers: headers() });
    const data = await res.json();
    const rows = (data.approvals || []).filter((a) => a.status === 'pending');
    if (!rows.length) {
      box.innerHTML = '<p class="hint">Nothing waiting. Risky spend/publish stays here.</p>';
      return;
    }
    box.innerHTML = rows.map((a) => `
      <div class="approval-row">
        <div><strong>${esc(a.title || a.type)}</strong><div class="hint">${esc(a.type)} · ${esc(a.at)}</div></div>
        <div class="btn-row">
          <button class="btn-outline btn-sm" data-reject="${esc(a.id)}">Reject</button>
          <button class="btn-primary btn-sm" data-approve="${esc(a.id)}">Approve</button>
        </div>
      </div>`).join('');
    box.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', () => decide(b.dataset.approve, 'approve')));
    box.querySelectorAll('[data-reject]').forEach((b) => b.addEventListener('click', () => decide(b.dataset.reject, 'reject')));
  }

  async function decide(id, action) {
    try {
      await copilot({ action, id });
      toast(action === 'approve' ? 'Applied' : 'Rejected', 'ok');
      loadApprovals();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function loadAudit() {
    const box = document.getElementById('copilotAuditList');
    if (!box) return;
    const res = await fetch(apiUrl('/api/copilot?view=audit'), { headers: headers() });
    const data = await res.json();
    const rows = data.entries || [];
    box.innerHTML = rows.slice(0, 80).map((e) => `
      <div class="audit-row">
        <strong>${esc(e.tool)}</strong> · ${esc(e.permission)} · ${esc(e.result)}
        <div class="hint">${esc(e.at)} · ${esc(e.actor || '')}${e.undo ? ` · <button class="btn-link" data-undo='${esc(JSON.stringify(e.undo))}'>Undo</button>` : ''}</div>
      </div>`).join('') || '<p class="hint">No Copilot actions yet.</p>';
    box.querySelectorAll('[data-undo]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await copilot({ action: 'undo', undo: JSON.parse(b.dataset.undo) });
        toast('Undone', 'ok');
        loadAudit();
      } catch (err) { toast(err.message, 'error'); }
    }));
  }

  function populateAdProducts() {
    const sel = document.getElementById('adProduct');
    if (!sel) return;
    const products = admin().store?.()?.products || [];
    sel.innerHTML = '<option value="">Select a product</option>' + products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  }

  function bind() {
    document.getElementById('copilotFab')?.addEventListener('click', () => {
      state.open = !state.open;
      document.getElementById('copilotPanel')?.classList.toggle('hidden', !state.open);
    });
    document.getElementById('copilotClose')?.addEventListener('click', () => {
      state.open = false;
      document.getElementById('copilotPanel')?.classList.add('hidden');
    });
    document.getElementById('copilotForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('copilotInput');
      const text = input.value;
      input.value = '';
      sendChat(text);
    });
    document.querySelectorAll('[data-copilot-q]').forEach((b) => b.addEventListener('click', () => sendChat(b.dataset.copilotQ)));
    document.getElementById('adAutofillBtn')?.addEventListener('click', autofillAd);
    document.getElementById('adSaveDraftBtn')?.addEventListener('click', saveAdDraft);
    document.getElementById('healthRunBtn')?.addEventListener('click', () => runHealth('full', false));
    document.getElementById('healthHealBtn')?.addEventListener('click', () => runHealth('full', true));
    document.getElementById('addSupplierBtn')?.addEventListener('click', addSupplier);

    const orig = window.switchTab;
    window.switchTab = function patched(tab) {
      orig?.(tab);
      if (tab === 'health') loadHealth();
      if (tab === 'approvals') loadApprovals();
      if (tab === 'copilot-audit') loadAudit();
      if (tab === 'suppliers') renderSuppliers();
      if (tab === 'marketing') {
        populateAdProducts();
        renderAds();
      }
    };
  }

  window.MENES_COPILOT = { sendChat, fillAdForm, runHealth, loadHealth, renderAds, populateAdProducts };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
