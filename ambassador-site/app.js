/* MENES Ambassador PWA */
(() => {
  const CFG = window.MENES_AMB_CONFIG || {};
  const API = (CFG.API_BASE || '').replace(/\/$/, '');
  const TOKEN_KEY = 'menes_amb_token';
  const state = {
    token: localStorage.getItem(TOKEN_KEY) || '',
    ambassador: null,
    dash: null,
    view: 'home',
    channel: 'general',
    onboardingStep: 0,
    deferredPrompt: null,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.classList.add('hidden'), 250);
    }, 2200);
  }

  function money(n) {
    return `${(Number(n) || 0).toFixed(2)}$`;
  }

  function showView(id) {
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === id));
  }

  async function api(action, { method = 'GET', body, auth = true } = {}) {
    const url = `${API}/api/ambassador?action=${encodeURIComponent(action)}`;
    const headers = { 'Content-Type': 'application/json' };
    if (auth && state.token) headers.Authorization = `Bearer ${state.token}`;
    let res;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error('Connexion impossible — vérifie ton réseau');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erreur réseau');
    return data;
  }

  function setToken(token) {
    state.token = token || '';
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async function copyText(text, { label = 'Copié' } = {}) {
    const value = String(text || '').trim();
    if (!value) {
      toast('Rien à copier');
      return false;
    }

    const legacyCopy = () => {
      const el = document.createElement('textarea');
      el.value = value;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.top = '0';
      el.style.left = '0';
      el.style.width = '2em';
      el.style.height = '2em';
      el.style.padding = '0';
      el.style.border = 'none';
      el.style.outline = 'none';
      el.style.boxShadow = 'none';
      el.style.background = 'transparent';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.focus();
      el.select();
      el.setSelectionRange(0, value.length);
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      el.remove();
      return ok;
    };

    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        toast(label);
        return true;
      }
    } catch {
      /* fall through */
    }

    if (legacyCopy()) {
      toast(label);
      return true;
    }

    showCopySheet(value);
    return false;
  }

  function showCopySheet(text, title = 'Copie ce lien') {
    document.querySelector('.copy-sheet')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'copy-sheet';
    overlay.innerHTML = `
      <div class="copy-sheet-card">
        <h3>${esc(title)}</h3>
        <p class="rank-meta">Maintiens appuyé sur le lien pour le copier (iPhone).</p>
        <input type="text" class="copy-sheet-input" readonly value="${esc(text)}" aria-label="Lien à copier">
        <div class="copy-sheet-actions">
          <button type="button" class="btn-gold" id="copySheetBtn">Copier</button>
          <button type="button" class="btn-outline" id="copySheetClose">Fermer</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('.copy-sheet-input');
    const selectAll = () => {
      if (!input) return;
      input.focus();
      input.select();
      input.setSelectionRange(0, text.length);
    };
    selectAll();
    input?.addEventListener('click', selectAll);
    overlay.querySelector('#copySheetBtn')?.addEventListener('click', async () => {
      const ok = await copyText(text, { label: 'Lien copié' });
      if (ok) overlay.remove();
    });
    overlay.querySelector('#copySheetClose')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  function getInviteLink() {
    const slug = state.ambassador?.slug || state.dash?.tools?.slug || '';
    return state.dash?.tools?.inviteLink
      || `${location.origin.replace(/\/$/, '')}/join?ref=${encodeURIComponent(slug)}`;
  }

  function trackInviteShare() {
    const last = Number(sessionStorage.getItem('menes_invite_track_at') || 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem('menes_invite_track_at', String(Date.now()));
    api('create-invite', { method: 'POST', body: {} }).catch(() => {});
  }

  function bindCopyField(input, getValue, { onCopy } = {}) {
    if (!input) return;
    input.addEventListener('click', () => {
      input.focus();
      input.select();
      input.setSelectionRange(0, input.value.length);
    });
    input.addEventListener('focus', () => {
      input.select();
      input.setSelectionRange(0, input.value.length);
    });
    const parent = input.closest('.copy-field');
    parent?.querySelector('[data-copy-field]')?.addEventListener('click', () => {
      const value = typeof getValue === 'function' ? getValue() : input.value;
      copyText(value, { label: 'Lien d\'invitation copié' });
      onCopy?.();
    });
  }

  function shareLink(url, title = 'MENES') {
    if (navigator.share) {
      navigator.share({ title, text: 'Découvre MENES', url }).catch(() => {});
    } else {
      copyText(url);
    }
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function isStandalonePwa() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  }

  function isPushSupported() {
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  }

  async function getPushState() {
    if (!isPushSupported()) {
      return { supported: false, ready: false, reason: 'unsupported' };
    }
    if (isIOS() && !isStandalonePwa()) {
      return { supported: true, ready: false, reason: 'ios_install' };
    }
    if (Notification.permission !== 'granted') {
      return { supported: true, ready: false, reason: Notification.permission === 'denied' ? 'denied' : 'prompt' };
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return { supported: true, ready: Boolean(sub), reason: sub ? 'ok' : 'no_subscription', subscription: sub };
    } catch (err) {
      return { supported: true, ready: false, reason: 'error', error: err.message };
    }
  }

  function renderPushGate(pushState) {
    showView('view-push');
    const body = $('#pushGateBody');
    const iosBlock = $('#pushGateIOS');
    const enableBtn = $('#pushGateEnable');
    const status = $('#pushGateStatus');
    if (status) status.textContent = '';

    if (pushState.reason === 'ios_install') {
      if (body) body.textContent = 'Pour recevoir les notifications sur iPhone, installe d\'abord l\'app sur ton écran d\'accueil.';
      iosBlock?.classList.remove('hidden');
      enableBtn?.classList.add('hidden');
    } else if (pushState.reason === 'unsupported') {
      if (body) body.textContent = 'Ton navigateur ne supporte pas les notifications. Utilise Safari sur iPhone (iOS 16.4+) avec l\'app installée sur l\'écran d\'accueil.';
      iosBlock?.classList.add('hidden');
      enableBtn?.classList.add('hidden');
    } else if (pushState.reason === 'denied') {
      if (body) body.textContent = 'Les notifications sont bloquées. Va dans Réglages → Notifications → MENES Ambassador → Autoriser les notifications.';
      iosBlock?.classList.add('hidden');
      enableBtn?.classList.remove('hidden');
      if (enableBtn) enableBtn.textContent = 'Réessayer';
    } else {
      if (body) body.textContent = 'Les notifications sont obligatoires pour recevoir les ventes, messages du chat et annonces MENES.';
      iosBlock?.classList.add('hidden');
      enableBtn?.classList.remove('hidden');
      if (enableBtn) enableBtn.textContent = 'Activer les notifications';
    }
  }

  async function ensurePushRequired() {
    const pushState = await getPushState();
    if (pushState.ready) return true;
    renderPushGate(pushState);
    return false;
  }

  async function proceedAfterPushEnabled() {
    const pushState = await getPushState();
    if (!pushState.ready) return false;
    showView('view-app');
    renderApp();
    return true;
  }

  /* ——— Auth ——— */
  function setupAuth() {
    const params = new URLSearchParams(location.search);
    const ref = params.get('ref') || '';
    if (ref) $('#regRef').value = ref;

    $$('.auth-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        $$('.auth-tab').forEach((t) => t.classList.toggle('active', t === tab));
        $('#loginForm').classList.toggle('hidden', tab.dataset.auth !== 'login');
        $('#registerForm').classList.toggle('hidden', tab.dataset.auth !== 'register');
      });
    });

    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      $('#loginError').textContent = '';
      try {
        const data = await api('login', {
          method: 'POST',
          auth: false,
          body: { email: fd.get('email'), password: fd.get('password') },
        });
        setToken(data.token);
        state.ambassador = data.ambassador;
        await enterApp();
      } catch (err) {
        $('#loginError').textContent = err.message;
      }
    });

    $('#registerForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      $('#registerError').textContent = '';
      try {
        const data = await api('register', {
          method: 'POST',
          auth: false,
          body: {
            displayName: fd.get('displayName'),
            email: fd.get('email'),
            password: fd.get('password'),
            ref: fd.get('ref') || ref,
          },
        });
        if (data.token) setToken(data.token);
        state.ambassador = data.ambassador;
        toast(data.message || 'Compte créé');
        await enterApp();
      } catch (err) {
        $('#registerError').textContent = err.message;
      }
    });

    $('#pendingLogout')?.addEventListener('click', logout);
  }

  function logout() {
    setToken('');
    state.ambassador = null;
    state.dash = null;
    showView('view-auth');
  }

  async function enterApp() {
    if (enterAppPromise) return enterAppPromise;
    enterAppPromise = enterAppInner().finally(() => { enterAppPromise = null; });
    return enterAppPromise;
  }

  async function enterAppInner() {
    if (!state.token) {
      showView('view-auth');
      return;
    }
    try {
      const data = await api('dashboard');
      if (data.pending) {
        state.ambassador = data.ambassador;
        showView('view-pending');
        return;
      }
      state.dash = data;
      state.ambassador = data.ambassador;
      if (!data.ambassador?.onboardingComplete) {
        let step = Number(data.ambassador?.onboardingStep) || 0;
        // Never leave people stuck past the last visible onboarding screen
        if (step > ONBOARD.length - 1) step = ONBOARD.length - 1;
        // If they reached the end without completing, send them to rules (agreement gate)
        if (step >= ONBOARD.length - 1 && !data.ambassador?.agreementAcceptedAt) {
          step = ONBOARD.findIndex((s) => s.type === 'rules');
          if (step < 0) step = 0;
        }
        state.onboardingStep = step;
        showView('view-onboarding');
        renderOnboarding();
        return;
      }
      if (!(await ensurePushRequired())) return;
      showView('view-app');
      renderApp();
    } catch (err) {
      if (/expir|invalide|autoris|introuvable/i.test(err.message)) {
        logout();
      } else {
        toast(err.message);
        // Keep token — don't kick to auth on transient API errors
        if (state.ambassador && !state.ambassador.onboardingComplete) {
          showView('view-onboarding');
          renderOnboarding();
        } else if (state.dash) {
          showView('view-app');
          renderApp();
        } else {
          showView('view-auth');
        }
      }
    }
  }

  /* ——— Onboarding ——— */
  const ONBOARD = [
    { pct: 0, title: 'Welcome to MENES.', body: "You're officially part of the team.", type: 'welcome' },
    { pct: 20, title: 'Ton profil', body: 'Choisis ton nom affiché.', type: 'profile' },
    { pct: 40, title: 'Règles Ambassador', body: 'Lis et accepte le cadre MENES.', type: 'rules' },
    { pct: 60, title: 'Tes outils', body: 'Lien perso + code promo.', type: 'tools' },
    { pct: 80, title: 'Notifications', body: 'Obligatoires pour les alertes ventes & chat.', type: 'push' },
    { pct: 100, title: 'Commissions', body: 'Tu gagnes sur les ventes réelles — jamais sur le recrutement seul.', type: 'learn' },
  ];

  function renderOnboarding() {
    const max = ONBOARD.length - 1;
    const step = Math.min(Math.max(0, Number(state.onboardingStep) || 0), max);
    state.onboardingStep = step;
    const cfg = ONBOARD[step];
    $('#onboardTitle').textContent = cfg.title;
    $('#onboardBody').textContent = cfg.body;
    $('#onboardBar').style.width = `${cfg.pct}%`;
    $('#onboardPct').textContent = `${cfg.pct}%`;
    const box = $('#onboardStep');
    const a = state.ambassador || {};
    const tools = state.dash?.tools;
    const btn = $('#onboardNext');
    if (btn) btn.disabled = false;

    if (cfg.type === 'welcome') {
      box.innerHTML = `<p class="onboard-body">Prêt à représenter MENES avec sérieux.</p>`;
    } else if (cfg.type === 'profile') {
      box.innerHTML = `
        <label>Nom affiché<input id="obName" value="${esc(a.displayName || '')}" maxlength="40"></label>
        <label>Bio (optionnel)<textarea id="obBio" rows="3">${esc(a.bio || '')}</textarea></label>`;
    } else if (cfg.type === 'rules') {
      box.innerHTML = `
        <div class="rules-box">
          <p><strong>MENES Ambassador — règles</strong></p>
          <p>1. Promouvoir des produits réels auprès de vrais clients.</p>
          <p>2. Aucune rémunération pour le seul fait de recruter.</p>
          <p>3. Pas d'auto-achat pour générer des commissions.</p>
          <p>4. Respect de l'image de marque MENES.</p>
          <p>5. Transparence sur les codes promo et affiliations.</p>
        </div>
        <label style="display:flex;gap:8px;align-items:flex-start;margin-top:12px;text-transform:none;letter-spacing:0;font-size:0.88rem;color:var(--text)">
          <input type="checkbox" id="obAgree" style="width:auto;margin-top:3px" ${a.agreementAcceptedAt ? 'checked' : ''}> J'accepte les règles Ambassador
        </label>`;
    } else if (cfg.type === 'tools') {
      const link = tools?.link || `${CFG.SHOP_URL || 'https://boutiquemenes.netlify.app'}/${a.slug || ''}`;
      box.innerHTML = `
        <div class="tool-row"><div><strong>Lien</strong><br><span>${esc(link)}</span></div></div>
        <div class="tool-row" style="margin-top:8px"><div><strong>Code</strong><br><span>${esc(a.promoCode || tools?.promoCode || '')}</span></div></div>`;
    } else if (cfg.type === 'push') {
      box.innerHTML = `
        <p class="onboard-body">Tu dois activer les notifications pour recevoir les ventes, messages du chat et annonces MENES sur ton téléphone.</p>
        <p class="rank-meta" id="obPushHint"></p>
        <button type="button" class="btn-gold" id="obEnablePush">Activer les notifications</button>
        <p id="obPushStatus" class="rank-meta" style="margin-top:10px"></p>`;
      const hint = $('#obPushHint');
      if (isIOS() && !isStandalonePwa()) {
        if (hint) hint.textContent = 'Sur iPhone : installe d\'abord l\'app sur l\'écran d\'accueil (Safari → Partager → Sur l\'écran d\'accueil).';
      }
      $('#obEnablePush')?.addEventListener('click', async () => {
        await enablePushNotifications($('#obPushStatus'));
      });
    } else {
      box.innerHTML = `
        <div class="rules-box">
          <p>Tu gagnes une commission sur chaque vente réelle via ton lien ou ton code.</p>
          <p>Vente personnelle : ~10% (selon ton rang).</p>
          <p>Équipe niveau 1 / 2 : petit bonus sur les ventes produits de ton équipe.</p>
          <p>Pending → Available après la période de validation. Pas de gain sur le recrutement seul.</p>
        </div>`;
    }
    if (btn) btn.textContent = step >= max ? 'Entrer dans l\'app' : 'Continuer';
  }

  $('#onboardNext')?.addEventListener('click', async () => {
    const max = ONBOARD.length - 1;
    const step = Math.min(Math.max(0, Number(state.onboardingStep) || 0), max);
    const cfg = ONBOARD[step];
    const btn = $('#onboardNext');
    try {
      if (btn) btn.disabled = true;
      const body = { step: Math.min(step + 1, 5) };
      if (cfg.type === 'profile') {
        body.displayName = $('#obName')?.value || state.ambassador?.displayName;
        body.bio = $('#obBio')?.value || '';
      }
      if (cfg.type === 'rules') {
        if (!$('#obAgree')?.checked) {
          toast('Accepte les règles pour continuer');
          if (btn) btn.disabled = false;
          return;
        }
        body.acceptAgreement = true;
      }
      if (cfg.type === 'push') {
        const pushState = await getPushState();
        if (pushState.reason === 'ios_install') {
          toast('Installe l\'app sur l\'écran d\'accueil d\'abord');
          if (btn) btn.disabled = false;
          return;
        }
        if (!pushState.ready) {
          toast('Active les notifications pour continuer');
          if (btn) btn.disabled = false;
          return;
        }
      }
      // Last step (Commissions) must finish onboarding — never loop here
      if (step >= max) body.complete = true;
      const data = await api('onboarding', { method: 'POST', body });
      state.ambassador = data.ambassador;
      if (body.complete) {
        if (!data.ambassador?.onboardingComplete) {
          toast('Onboarding incomplet — reviens aux règles');
          state.onboardingStep = ONBOARD.findIndex((s) => s.type === 'rules');
          if (state.onboardingStep < 0) state.onboardingStep = 0;
          renderOnboarding();
          return;
        }
        await enterApp();
        return;
      }
      state.onboardingStep = step + 1;
      renderOnboarding();
    } catch (err) {
      if (/règles|regles|agreement|needAgreement/i.test(err.message || '')) {
        state.onboardingStep = ONBOARD.findIndex((s) => s.type === 'rules');
        if (state.onboardingStep < 0) state.onboardingStep = 0;
        renderOnboarding();
      }
      toast(err.message);
      if (btn) btn.disabled = false;
    }
  });

  /* ——— Main views ——— */
  let viewSeq = 0;
  let enterAppPromise = null;

  function renderApp() {
    const d = state.dash;
    if (!d) return;
    const seq = ++viewSeq;
    const name = d.ambassador?.displayName || 'Ambassador';
    $('#welcomeLine').textContent = `Bon retour, ${name}`;
    const unread = (d.notifications || []).filter((n) => !n.read).length;
    $('#notifDot').classList.toggle('hidden', unread === 0);
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
    const main = $('#main');
    const renderers = { home: renderHome, sales: renderSales, team: renderTeam, community: renderCommunity, profile: renderProfile };
    const run = renderers[state.view] || renderHome;
    const result = run(main, d, seq);
    if (result && typeof result.then === 'function') {
      result.then(() => {}).catch(() => {});
    }
  }

  function renderHome(main, d) {
    const k = d.kpis || {};
    const r = d.rank || {};
    const eng = d.engagement || {};
    const challenge = (d.challenges || [])[0];
    main.innerHTML = `
      <div class="rank-panel">
        <h3>${esc(r.current?.name || 'Ambassador')}</h3>
        <p class="rank-meta">${money(r.monthlySales || 0)} / ${money(r.next?.minSales || r.monthlySales || 0)} ce mois
          ${r.next ? `· Encore ${money(r.remaining)} pour ${esc(r.next.name)}` : '· Rang max'}
          · ${d.ambassador?.xp || 0} XP</p>
        <div class="rank-bar"><i style="width:${r.progress || 0}%"></i></div>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><span class="label">Ventes perso</span><span class="value">${money(k.personalSales)}</span></div>
        <div class="kpi"><span class="label">Commandes</span><span class="value">${k.orders || 0}</span></div>
        <div class="kpi"><span class="label">Commission</span><span class="value">${money(k.personalCommission)}</span></div>
        <div class="kpi"><span class="label">Bonus équipe</span><span class="value">${money(k.teamBonus)}</span></div>
        <div class="kpi accent"><span class="label">Total gagné</span><span class="value">${money(k.totalEarned)}</span></div>
        <div class="kpi"><span class="label">XP</span><span class="value">${d.ambassador?.xp || 0}</span></div>
      </div>
      <p class="section-title">Engagement</p>
      <div class="kpi-grid">
        <div class="kpi"><span class="label">Clics lien</span><span class="value">${eng.clicks || 0}</span></div>
        <div class="kpi"><span class="label">Codes utilisés</span><span class="value">${eng.promoUses || 0}</span></div>
        <div class="kpi"><span class="label">Chat</span><span class="value">${eng.chatMessages || 0}</span></div>
        <div class="kpi"><span class="label">Idées</span><span class="value">${eng.ideas || 0}</span></div>
        <div class="kpi"><span class="label">Invitations</span><span class="value">${eng.invites || 0}</span></div>
        <div class="kpi"><span class="label">Série</span><span class="value">${eng.streakDays || 0}j</span></div>
      </div>
      <p class="section-title">Comment gagner des XP</p>
      <div class="list">
        ${(d.xpGuide || []).slice(0, 8).map((g) => `
          <div class="list-row">
            <div><strong>${esc(g.action)}</strong></div>
            <strong>+${esc(String(g.xp))}</strong>
          </div>
        `).join('') || '<p class="rank-meta">Guide XP bientôt.</p>'}
      </div>
      ${(d.recentXp || []).length ? `
        <p class="section-title">XP récent</p>
        <div class="list">
          ${d.recentXp.slice(0, 6).map((x) => `
            <div class="list-row">
              <div><strong>${esc(x.reason)}</strong><br><span>${esc((x.at || '').slice(0, 10))}</span></div>
              <strong>+${x.amount}</strong>
            </div>
          `).join('')}
        </div>` : ''}
      <div class="quick-actions">
        <button type="button" data-go="tools">Mon lien</button>
        <button type="button" data-go="sales">Ventes</button>
        <button type="button" data-go="team">Équipe</button>
        <button type="button" data-go="community">Community</button>
        <button type="button" data-go="campaigns">Campagnes</button>
        <button type="button" data-go="ideas">Idées</button>
      </div>
      <p class="section-title">Outils promo</p>
      <div class="tools-list">
        <div class="tool-row">
          <div><strong>Lien boutique</strong><br><span class="tool-url">${esc(d.tools?.link || '')}</span></div>
          <button type="button" class="btn-ghost" data-copy-target="link">Copier</button>
        </div>
        <div class="tool-row">
          <div><strong>Code promo</strong><br><span class="tool-url">${esc(d.tools?.promoCode || '')}</span></div>
          <button type="button" class="btn-ghost" data-copy-target="code">Copier</button>
        </div>
      </div>
      <p class="section-title">Inviter un Ambassador</p>
      <div class="invite-block">
        <p class="rank-meta">Envoie ce lien pour qu'une personne rejoigne ton équipe.</p>
        <div class="copy-field">
          <input type="text" id="homeInviteInput" readonly value="${esc(d.tools?.inviteLink || getInviteLink())}" aria-label="Lien d'invitation">
          <button type="button" class="btn-gold" data-copy-field>Copier</button>
        </div>
        <button type="button" class="btn-outline" id="homeInviteShare" style="width:100%">Partager le lien</button>
      </div>
      <div class="quick-actions" style="margin-top:10px">
        <button type="button" data-share="ig">Instagram</button>
        <button type="button" data-share="wa">WhatsApp</button>
        <button type="button" data-share="qr">QR Code</button>
      </div>
      ${challenge ? `<p class="section-title">Défi</p><div class="challenge-card"><h4>${esc(challenge.title)}</h4><p>${esc(challenge.description || '')} · +${challenge.xpReward || 0} XP</p></div>` : ''}
      <p class="section-title">Classement XP · cette semaine</p>
      <p class="rank-meta" style="margin:-4px 0 10px">
        Top 3 = récompense bonus
        · 1er ${(d.weeklyXpContest?.prizes || [3, 2, 1])[0]}$
        · 2e ${(d.weeklyXpContest?.prizes || [3, 2, 1])[1]}$
        · 3e ${(d.weeklyXpContest?.prizes || [3, 2, 1])[2]}$
        · toi : ${d.thisWeekXp || 0} XP
      </p>
      <ol class="leaderboard">
        ${(d.leaderboard || []).slice(0, 5).map((row) => {
          const prize = row.place <= 3 ? (d.weeklyXpContest?.prizes || [3, 2, 1])[row.place - 1] : null;
          return `<li><span class="place">${row.place}</span><span>${esc(row.displayName || '—')}${prize != null ? ` · +${prize}$` : ''}</span><strong>${row.xp || 0} XP</strong></li>`;
        }).join('') || '<li><span></span><span>Aucun classement</span><span></span></li>'}
      </ol>
      ${d.weeklyXpContest?.lastSettlement?.winners?.length ? `
        <p class="rank-meta" style="margin-top:8px">
          Semaine ${esc(d.weeklyXpContest.lastSettlement.weekKey)} :
          ${d.weeklyXpContest.lastSettlement.winners.map((w) => `${w.place}. ${esc(w.displayName)} (+${w.amount}$)`).join(' · ')}
        </p>` : ''}
    `;
    bindHomeActions(main, d);
  }

  function bindHomeActions(main, d) {
    const copyMap = {
      link: d.tools?.link,
      code: d.tools?.promoCode,
      invite: d.tools?.inviteLink || getInviteLink(),
    };
    main.querySelectorAll('[data-copy-target]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.copyTarget;
        copyText(copyMap[key] || '');
        if (key === 'invite') trackInviteShare();
      });
    });
    bindCopyField($('#homeInviteInput'), () => copyMap.invite, { onCopy: trackInviteShare });
    $('#homeInviteShare')?.addEventListener('click', () => {
      const url = copyMap.invite;
      if (navigator.share) {
        navigator.share({ title: 'MENES Ambassador', text: 'Rejoins mon équipe MENES', url }).catch(() => copyText(url));
      } else {
        copyText(url, { label: 'Lien copié — colle-le où tu veux' });
      }
      trackInviteShare();
    });
    main.querySelectorAll('[data-go]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const go = btn.dataset.go;
        if (go === 'tools') return;
        if (go === 'campaigns' || go === 'ideas') {
          state.view = 'community';
          renderApp();
          if (go === 'ideas') setTimeout(() => openIdeas(), 50);
          return;
        }
        state.view = go;
        renderApp();
      });
    });
    main.querySelectorAll('[data-share]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const link = d.tools?.link || '';
        const code = d.tools?.promoCode || '';
        if (btn.dataset.share === 'wa') {
          window.open(`https://wa.me/?text=${encodeURIComponent(`MENES — ${link} · code ${code}`)}`, '_blank');
        } else if (btn.dataset.share === 'ig') {
          copyText(`${link} · ${code}`);
          toast('Lien copié — colle-le dans Instagram');
        } else if (btn.dataset.share === 'qr') {
          const url = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(link)}`;
          window.open(url, '_blank');
        } else {
          shareLink(link);
        }
      });
    });
  }

  async function renderSales(main) {
    main.innerHTML = `<p class="section-title">Chargement…</p>`;
    try {
      const [sales, commissions] = await Promise.all([
        api('sales'),
        api('commissions'),
      ]);
      const months = buildMonthBars(state.dash?.ambassador?.stats?.monthlySales || {});
      main.innerHTML = `
        <p class="section-title">Performance</p>
        <div class="chart">${months.map((m, i) => `<i style="height:${m.h}%;animation-delay:${i * 0.04}s" title="${m.label}"></i>`).join('')}</div>
        <div class="kpi-grid">
          <div class="kpi"><span class="label">Pending</span><span class="value">${money(state.dash?.kpis?.pendingCommission)}</span></div>
          <div class="kpi accent"><span class="label">Disponible</span><span class="value">${money(state.dash?.kpis?.availableCommission)}</span></div>
        </div>
        <button type="button" class="btn-outline" id="payoutBtn" style="width:100%;margin-bottom:16px">Demander un payout</button>
        <p class="section-title">Ventes</p>
        <div class="list">
          ${(sales.sales || []).map((s) => `
            <div class="list-row">
              <div>
                <strong>#${esc(s.id)}</strong><br>
                <span>${(s.items || []).map((i) => i.name).join(', ') || '—'} · ${esc(s.commissionStatus || '')}</span>
              </div>
              <strong>${money(s.commissionAmount)}</strong>
            </div>
          `).join('') || '<p class="rank-meta">Aucune vente encore. Partage ton lien.</p>'}
        </div>
        <p class="section-title">Commissions</p>
        <div class="list">
          ${(commissions.commissions || []).slice(0, 30).map((c) => `
            <div class="list-row">
              <div><strong>${esc(c.type)}</strong><br><span>${esc(c.status)} · #${esc(c.orderId)}</span></div>
              <strong>${money(c.amount)}</strong>
            </div>
          `).join('') || '<p class="rank-meta">Pas encore de commission.</p>'}
        </div>
      `;
      $('#payoutBtn')?.addEventListener('click', async () => {
        try {
          const res = await api('request-payout', { method: 'POST', body: {} });
          toast(`Payout ${money(res.payout.amount)} demandé`);
          state.dash = await api('dashboard');
          renderSales(main);
        } catch (err) {
          toast(err.message);
        }
      });
    } catch (err) {
      main.innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
    }
  }

  function buildMonthBars(monthly) {
    const keys = Object.keys(monthly).sort().slice(-6);
    if (!keys.length) return Array.from({ length: 6 }, (_, i) => ({ label: '', h: 8 + i * 4 }));
    const max = Math.max(...keys.map((k) => monthly[k] || 0), 1);
    return keys.map((k) => ({ label: k, h: Math.max(8, Math.round((monthly[k] / max) * 100)) }));
  }

  async function renderTeam(main) {
    main.innerHTML = `<p class="section-title">Chargement…</p>`;
    try {
      const data = await api('team');
      const s = data.stats || {};
      const inviteUrl = state.dash?.tools?.inviteLink || getInviteLink();
      main.innerHTML = `
        <div class="kpi-grid">
          <div class="kpi"><span class="label">Directs</span><span class="value">${s.direct || 0}</span></div>
          <div class="kpi"><span class="label">Actifs</span><span class="value">${s.active || 0}</span></div>
          <div class="kpi"><span class="label">Ventes équipe</span><span class="value">${money(s.sales)}</span></div>
          <div class="kpi"><span class="label">XP équipe</span><span class="value">${s.xp || 0}</span></div>
        </div>
        <p class="section-title">Inviter un Ambassador</p>
        <div class="invite-block">
          <p class="rank-meta">Copie ou partage ce lien. La personne pourra créer son compte et rejoindre ton équipe.</p>
          <div class="copy-field">
            <input type="text" id="teamInviteInput" readonly value="${esc(inviteUrl)}" aria-label="Lien d'invitation">
            <button type="button" class="btn-gold" data-copy-field>Copier</button>
          </div>
          <button type="button" class="btn-outline" id="teamInviteShare" style="width:100%">Partager le lien</button>
        </div>
        <p class="section-title">Arbre</p>
        <div id="teamTree"></div>
      `;
      $('#teamTree').innerHTML = renderTreeNode(data.tree);
      bindCopyField($('#teamInviteInput'), () => $('#teamInviteInput')?.value || inviteUrl, { onCopy: trackInviteShare });
      $('#teamInviteShare')?.addEventListener('click', () => {
        const url = $('#teamInviteInput')?.value || inviteUrl;
        if (navigator.share) {
          navigator.share({ title: 'MENES Ambassador', text: 'Rejoins mon équipe MENES', url }).catch(() => copyText(url));
        } else {
          copyText(url, { label: 'Lien copié — colle-le où tu veux' });
        }
        trackInviteShare();
      });
    } catch (err) {
      main.innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
    }
  }

  function renderTreeNode(node) {
    if (!node) return '<p class="rank-meta">Pas encore d\'équipe.</p>';
    return `
      <div class="team-node">
        <strong>${esc(node.displayName)}</strong>
        <span style="color:var(--muted);font-size:0.8rem"> · ${esc(node.rankId || '')} · ${money(node.personalSales)}</span>
        <div class="kids">${(node.children || []).map(renderTreeNode).join('')}</div>
      </div>`;
  }

  async function renderCommunity(main, d, seq) {
    state.chatQuery = state.chatQuery || '';
    state.chatPendingFile = null;
    main.innerHTML = `
      <div class="channels" id="channels"></div>
      <div class="chat-toolbar">
        <input type="search" id="chatSearch" placeholder="Rechercher dans le canal…" value="${esc(state.chatQuery || '')}" autocomplete="off">
      </div>
      <div class="chat-wrap">
        <div class="messages" id="messages"></div>
        <form class="chat-compose" id="chatForm">
          <label class="chat-attach" title="Photo / fichier">
            ＋
            <input type="file" id="chatFile" accept="image/*,application/pdf,video/mp4" hidden>
          </label>
          <div class="chat-compose-main">
            <div id="chatFilePreview" class="chat-file-preview hidden"></div>
            <input id="chatInput" placeholder="Écrire un message…" maxlength="2000" autocomplete="off">
          </div>
          <button type="submit">OK</button>
        </form>
      </div>
      <p class="section-title">Idées promo</p>
      <button type="button" class="btn-outline" id="ideaBtn" style="width:100%;margin-bottom:10px">+ Proposer une idée</button>
      <div id="ideasList"></div>
      <p class="section-title">Kit promo</p>
      <div id="contentList" class="list"></div>
    `;
    let sending = false;
    let searchTimer = null;

    const renderPreview = () => {
      const box = $('#chatFilePreview');
      if (!box) return;
      if (!state.chatPendingFile) {
        box.classList.add('hidden');
        box.innerHTML = '';
        return;
      }
      const f = state.chatPendingFile;
      box.classList.remove('hidden');
      box.innerHTML = f.type.startsWith('image/')
        ? `<img src="${f.dataUrl}" alt=""><button type="button" id="chatFileClear">×</button>`
        : `<span>📎 ${esc(f.name)}</span><button type="button" id="chatFileClear">×</button>`;
      $('#chatFileClear')?.addEventListener('click', () => {
        state.chatPendingFile = null;
        if ($('#chatFile')) $('#chatFile').value = '';
        renderPreview();
      });
    };

    $('#chatFile')?.addEventListener('change', async () => {
      const file = $('#chatFile')?.files?.[0];
      if (!file) return;
      if (file.size > 4 * 1024 * 1024) {
        toast('Fichier trop lourd (max 4 Mo avant compression)');
        $('#chatFile').value = '';
        return;
      }
      try {
        const compressed = await compressImageFile(file);
        if (String(compressed.dataUrl || '').length > 1_200_000) {
          toast('Image encore trop lourde — choisis une photo plus légère');
          $('#chatFile').value = '';
          return;
        }
        state.chatPendingFile = {
          name: compressed.name || file.name,
          type: compressed.type || file.type || 'application/octet-stream',
          dataUrl: compressed.dataUrl,
        };
        renderPreview();
      } catch {
        toast('Impossible de lire le fichier');
      }
    });

    $('#chatSearch')?.addEventListener('input', (e) => {
      state.chatQuery = e.target.value || '';
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadCommunity(viewSeq), 280);
    });

    $('#chatForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (sending) return;
      const text = $('#chatInput')?.value?.trim() || '';
      const attachment = state.chatPendingFile;
      if (!text && !attachment) return;
      sending = true;
      const submitBtn = $('#chatForm button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        await api('send-message', {
          method: 'POST',
          body: {
            channelId: state.channel,
            text,
            attachments: attachment ? [attachment] : [],
          },
        });
        $('#chatInput').value = '';
        state.chatPendingFile = null;
        if ($('#chatFile')) $('#chatFile').value = '';
        renderPreview();
        await loadCommunity(viewSeq);
      } catch (err) {
        toast(err.message);
      } finally {
        sending = false;
        if (submitBtn) submitBtn.disabled = false;
      }
    });
    $('#ideaBtn')?.addEventListener('click', openIdeas);
    await loadCommunity(seq ?? viewSeq);
  }

  function renderMsgAttachments(m) {
    const atts = m.attachments || [];
    if (!atts.length) return '';
    return `<div class="msg-atts">${atts.map((a, i) => {
      const isImg = (a.type || '').startsWith('image/') || String(a.dataUrl || '').startsWith('data:image/');
      if (isImg) {
        const src = a.dataUrl || '';
        return `<button type="button" class="msg-img-btn" data-msg-img="${esc(m.id)}" data-att="${i}" aria-label="Voir la photo">
          <img class="msg-img" src="${src}" alt="${esc(a.name || 'Photo')}" loading="lazy">
        </button>`;
      }
      return `<button type="button" class="msg-file" data-msg-file="${esc(m.id)}" data-att="${i}">📎 ${esc(a.name || 'Fichier')}</button>`;
    }).join('')}</div>`;
  }

  function openMediaViewer(attachment) {
    if (!attachment?.dataUrl) {
      toast('Fichier indisponible');
      return;
    }
    document.querySelector('.media-viewer')?.remove();
    const isImg = (attachment.type || '').startsWith('image/')
      || String(attachment.dataUrl).startsWith('data:image/');
    const overlay = document.createElement('div');
    overlay.className = 'media-viewer';
    overlay.innerHTML = `
      <div class="media-viewer-card">
        ${isImg
          ? `<img class="media-viewer-img" src="${attachment.dataUrl}" alt="${esc(attachment.name || 'Photo')}">`
          : `<p class="rank-meta">Fichier : ${esc(attachment.name || 'fichier')}</p>`}
        <div class="media-viewer-actions">
          <button type="button" class="btn-gold" id="mediaSaveBtn">Enregistrer</button>
          <button type="button" class="btn-outline" id="mediaCloseBtn">Fermer</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    $('#mediaCloseBtn', overlay)?.addEventListener('click', close);
    $('#mediaSaveBtn', overlay)?.addEventListener('click', () => {
      downloadDataUrl(attachment.dataUrl, attachment.name || (isImg ? 'menes-photo.jpg' : 'menes-fichier'));
    });
  }

  function downloadDataUrl(dataUrl, filename) {
    try {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename || 'menes-fichier';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('Téléchargement lancé');
    } catch {
      // iOS often blocks download attribute — open blob in same tab viewer already shown
      toast('Maintiens appuyé sur la photo pour l’enregistrer');
    }
  }

  async function compressImageFile(file, { maxSide = 1280, quality = 0.72 } = {}) {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve({ dataUrl: r.result, type: file.type, name: file.name });
        r.onerror = reject;
        r.readAsDataURL(file);
      });
    }
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve({ dataUrl: r.result, type: file.type, name: file.name });
        r.onerror = reject;
        r.readAsDataURL(file);
      });
    }
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const type = 'image/jpeg';
    const dataUrl = canvas.toDataURL(type, quality);
    const base = String(file.name || 'photo').replace(/\.[^.]+$/, '');
    return { dataUrl, type, name: `${base}.jpg` };
  }

  async function loadCommunity(seq) {
    try {
      const q = state.chatQuery ? `&q=${encodeURIComponent(state.chatQuery)}` : '';
      const [channels, msgsRes, ideas, content] = await Promise.all([
        api('channels'),
        fetch(`${API}/api/ambassador?action=messages&channel=${encodeURIComponent(state.channel)}${q}`, {
          headers: { Authorization: `Bearer ${state.token}` },
        }).then(async (r) => {
          const data = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(data.error || 'Erreur messages');
          return data;
        }),
        api('ideas'),
        api('content'),
      ]);
      if (seq != null && seq !== viewSeq) return;

      const chEl = $('#channels');
      if (chEl) {
        chEl.innerHTML = (channels.channels || []).map((c) =>
          `<button type="button" class="${c.id === state.channel ? 'active' : ''}" data-ch="${c.id}">${esc(c.name)}</button>`
        ).join('');
        chEl.querySelectorAll('[data-ch]').forEach((b) => {
          b.addEventListener('click', () => {
            state.channel = b.dataset.ch;
            state.chatQuery = '';
            if ($('#chatSearch')) $('#chatSearch').value = '';
            loadCommunity(viewSeq);
          });
        });
      }

      const box = $('#messages');
      if (box) {
        const list = msgsRes.messages || [];
        box.innerHTML = list.map((m) => `
          <div class="msg ${m.pinned ? 'is-pinned' : ''}" data-msg="${esc(m.id)}">
            ${m.pinned ? '<div class="pin-tag">Épinglé</div>' : ''}
            <div class="msg-top">
              <div class="who">${esc(m.authorName || 'Ambassador')}</div>
              <div class="msg-actions">
                <button type="button" class="msg-act" data-pin="${esc(m.id)}" data-pinned="${m.pinned ? '1' : '0'}" title="${m.pinned ? 'Désépingler' : 'Épingler'}">${m.pinned ? '📍' : '📌'}</button>
                ${m.canDelete ? `<button type="button" class="msg-act danger" data-del="${esc(m.id)}" title="Supprimer">🗑</button>` : ''}
              </div>
            </div>
            ${m.text ? `<div class="msg-text">${esc(m.text)}</div>` : ''}
            ${renderMsgAttachments(m)}
            <div class="when">${new Date(m.createdAt).toLocaleString('fr-CA')}</div>
          </div>
        `).join('') || `<p class="rank-meta">${state.chatQuery ? 'Aucun résultat.' : 'Aucun message — lance la discussion.'}</p>`;
        if (!state.chatQuery) box.scrollTop = box.scrollHeight;

        const byId = Object.fromEntries(list.map((m) => [m.id, m]));
        box.querySelectorAll('[data-msg-img]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const msg = byId[btn.dataset.msgImg];
            const att = msg?.attachments?.[Number(btn.dataset.att)];
            openMediaViewer(att);
          });
        });
        box.querySelectorAll('[data-msg-file]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const msg = byId[btn.dataset.msgFile];
            const att = msg?.attachments?.[Number(btn.dataset.att)];
            openMediaViewer(att);
          });
        });

        box.querySelectorAll('[data-del]').forEach((b) => {
          b.addEventListener('click', async () => {
            if (!confirm('Supprimer ce message ?')) return;
            try {
              await api('delete-message', { method: 'POST', body: { messageId: b.dataset.del } });
              toast('Message supprimé');
              loadCommunity(viewSeq);
            } catch (err) { toast(err.message); }
          });
        });
        box.querySelectorAll('[data-pin]').forEach((b) => {
          b.addEventListener('click', async () => {
            try {
              const pinned = b.dataset.pinned !== '1';
              await api('pin-message', { method: 'POST', body: { messageId: b.dataset.pin, pinned } });
              toast(pinned ? 'Épinglé' : 'Désépinglé');
              loadCommunity(viewSeq);
            } catch (err) { toast(err.message); }
          });
        });
      }
      const ideasList = $('#ideasList');
      if (ideasList) {
        ideasList.innerHTML = (ideas.ideas || []).slice(0, 10).map((idea) => `
          <div class="idea">
            <h4>${esc(idea.title)}</h4>
            <p>${esc(idea.body)}</p>
            <button type="button" class="btn-ghost" data-like="${idea.id}">${idea.likedByMe ? '♥' : '♡'} ${idea.likeCount || 0}</button>
            <span class="badge-pill">${esc(idea.status)}</span>
          </div>
        `).join('') || '<p class="rank-meta">Aucune idée pour l\'instant.</p>';
        ideasList.querySelectorAll('[data-like]').forEach((b) => {
          b.addEventListener('click', async () => {
            await api('like-idea', { method: 'POST', body: { ideaId: b.dataset.like } });
            loadCommunity(viewSeq);
          });
        });
      }
      const contentList = $('#contentList');
      if (contentList) {
        contentList.innerHTML = (content.content || []).slice(0, 12).map((c) => `
          <div class="list-row">
            <div><strong>${esc(c.title)}</strong><br><span>${esc((c.flags || []).join(' · '))}</span></div>
            <a class="btn-ghost" href="${esc(c.url)}" target="_blank" rel="noopener">Ouvrir</a>
          </div>
        `).join('') || '<p class="rank-meta">Kit bientôt disponible.</p>';
      }
    } catch (err) {
      if (seq != null && seq !== viewSeq) return;
      toast(err.message);
    }
  }

  function openIdeas() {
    const title = prompt('Titre de l\'idée');
    if (!title) return;
    const body = prompt('Décris ton idée promo');
    if (!body) return;
    api('submit-idea', { method: 'POST', body: { title, body } })
      .then(() => { toast('Idée envoyée'); loadCommunity(); })
      .catch((e) => toast(e.message));
  }

  function renderProfile(main, d) {
    const a = d.ambassador || {};
    const pushOn = a.notificationPrefs?.push === true;
    const pushSupported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    main.innerHTML = `
      <div class="rank-panel">
        <h3>${esc(a.displayName || '')}</h3>
        <p class="rank-meta">${esc(a.email || '')} · ${esc(a.rankId || '')} · ${a.xp || 0} XP</p>
      </div>

      <p class="section-title">Identité & code promo</p>
      <div style="padding:14px;border:1px solid var(--line);background:var(--bg-elev);margin-bottom:14px">
        <label class="rank-meta" style="display:block;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.08em;font-size:0.72rem">
          Nom affiché
          <input id="profileDisplayName" type="text" maxlength="40" value="${esc(a.displayName || '')}"
            style="display:block;width:100%;margin-top:6px;padding:12px;background:var(--bg);border:1px solid var(--line);color:var(--text);text-transform:none;letter-spacing:0;font-size:0.95rem">
        </label>
        <label class="rank-meta" style="display:block;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.08em;font-size:0.72rem">
          Code promo
          <input id="profilePromoCode" type="text" maxlength="12" value="${esc(a.promoCode || '')}"
            style="display:block;width:100%;margin-top:6px;padding:12px;background:var(--bg);border:1px solid var(--line);color:var(--gold);letter-spacing:0.08em;font-size:1rem;text-transform:uppercase"
            autocomplete="off" spellcheck="false">
        </label>
        <p class="rank-meta" style="margin:0 0 12px;font-size:0.78rem;line-height:1.45">
          3–12 lettres/chiffres. L’ancien code sera désactivé. Ton lien perso (${esc(a.slug || '')}) reste le même.
        </p>
        <button type="button" class="btn-gold" id="saveIdentityBtn">Enregistrer nom & code</button>
        <p id="identityStatus" class="rank-meta" style="margin:8px 0 0;min-height:1.2em"></p>
      </div>

      <p class="section-title">Badges</p>
      <div class="badge-row">
        ${(d.badges || a.badges || []).map((b) => `<span class="badge-pill">${esc(b.name || b.id)}</span>`).join('') || '<span class="rank-meta">Pas encore de badge</span>'}
      </div>
      <p class="section-title">Préférences</p>
      <label class="rank-meta" style="display:flex;gap:8px;align-items:center;margin:8px 0">
        <input type="checkbox" id="prefEmail" ${a.notificationPrefs?.email !== false ? 'checked' : ''}> Emails
      </label>
      <label class="rank-meta" style="display:flex;gap:8px;align-items:center;margin:8px 0">
        <input type="checkbox" id="prefSales" ${a.notificationPrefs?.sales !== false ? 'checked' : ''}> Alertes ventes
      </label>
      <label class="rank-meta" style="display:flex;gap:8px;align-items:center;margin:8px 0">
        <input type="checkbox" id="prefCommunity" ${a.notificationPrefs?.community !== false ? 'checked' : ''}> Messages communauté
      </label>
      <div style="margin:14px 0;padding:14px;border:1px solid var(--line);background:var(--bg-elev)">
        <p class="section-title" style="margin-top:0">Notifications téléphone · obligatoires</p>
        <p class="rank-meta" style="margin:0 0 10px">Alertes ventes, chat, commissions et annonces MENES.</p>
        ${!pushSupported ? '<p class="form-error">Sur iPhone : installe l\'app via Safari → Partager → Sur l\'écran d\'accueil (iOS 16.4+).</p>' : ''}
        <button type="button" class="btn-gold" id="enablePushBtn" ${!pushSupported ? 'disabled' : ''}>
          ${pushOn ? 'Notifications actives — resynchroniser' : 'Activer les notifications'}
        </button>
        <p id="pushStatus" class="hint" style="margin-top:8px;color:var(--muted);font-size:0.8rem"></p>
      </div>
      <button type="button" class="btn-outline" id="savePrefs" style="width:100%;margin:12px 0">Sauvegarder préférences</button>
      <button type="button" class="btn-outline" id="installFromProfile" style="width:100%;margin-bottom:12px">Installer sur l'écran d'accueil</button>
      <button type="button" class="btn-gold" id="logoutBtn">Déconnexion</button>
    `;

    $('#profilePromoCode')?.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    });

    $('#saveIdentityBtn')?.addEventListener('click', async () => {
      const status = $('#identityStatus');
      const displayName = $('#profileDisplayName')?.value?.trim() || '';
      const promoCode = $('#profilePromoCode')?.value?.trim() || '';
      if (status) status.textContent = 'Enregistrement…';
      try {
        const res = await api('update-profile', {
          method: 'POST',
          body: { displayName, promoCode },
        });
        state.ambassador = res.ambassador;
        if (state.dash) {
          state.dash.ambassador = res.ambassador;
          if (state.dash.tools) {
            state.dash.tools.promoCode = res.ambassador.promoCode;
          }
        }
        if (status) status.textContent = res.promoChanged
          ? `OK — nouveau code ${res.ambassador.promoCode}`
          : 'OK — profil mis à jour';
        toast('Profil mis à jour');
        $('#welcomeLine').textContent = `Bon retour, ${res.ambassador.displayName}`;
        renderProfile(main, { ...d, ambassador: res.ambassador, badges: d.badges });
      } catch (err) {
        if (status) status.textContent = err.message;
        toast(err.message);
      }
    });

    $('#savePrefs')?.addEventListener('click', async () => {
      try {
        await api('update-profile', {
          method: 'POST',
          body: {
            notificationPrefs: {
              email: $('#prefEmail').checked,
              sales: $('#prefSales').checked,
              community: $('#prefCommunity').checked,
            },
          },
        });
        toast('Préférences enregistrées');
      } catch (err) {
        toast(err.message);
      }
    });
    $('#enablePushBtn')?.addEventListener('click', () => enablePushNotifications($('#pushStatus')));
    $('#logoutBtn')?.addEventListener('click', logout);
    $('#installFromProfile')?.addEventListener('click', triggerInstall);
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  async function enablePushNotifications(statusEl) {
    try {
      if (statusEl) statusEl.textContent = 'Demande d\'autorisation…';
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        if (statusEl) statusEl.textContent = 'Permission refusée';
        toast('Autorise les notifications dans les réglages');
        return;
      }
      const keyRes = await api('push-public-key', { auth: false });
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey),
        });
      }
      await api('push-subscribe', {
        method: 'POST',
        body: { subscription: sub.toJSON() },
      });
      await api('update-profile', {
        method: 'POST',
        body: { notificationPrefs: { push: true, community: true } },
      });
      if (statusEl) statusEl.textContent = 'Notifications activées sur cet appareil';
      toast('Notifications activées');
      if (state.dash?.ambassador) {
        state.dash.ambassador.notificationPrefs = {
          ...(state.dash.ambassador.notificationPrefs || {}),
          push: true,
          community: true,
          sales: true,
          commission: true,
          announcements: true,
        };
      }
      // Only leave onboarding after it is already complete
      if (state.ambassador?.onboardingComplete || state.dash?.ambassador?.onboardingComplete) {
        await proceedAfterPushEnabled();
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = err.message;
      toast(err.message || 'Impossible d\'activer');
    }
  }

  async function disablePushNotifications(statusEl) {
    toast('Les notifications sont obligatoires');
    if (statusEl) statusEl.textContent = 'Obligatoires — resynchronise si besoin';
  }

  $('#pushGateEnable')?.addEventListener('click', async () => {
    await enablePushNotifications($('#pushGateStatus'));
  });
  $('#pushGateInstall')?.addEventListener('click', () => triggerInstall());

  /* ——— Notifications panel ——— */
  $('#notifBtn')?.addEventListener('click', () => {
    const list = state.dash?.notifications || [];
    const overlay = document.createElement('div');
    overlay.className = 'notif-panel';
    overlay.innerHTML = `
      <div class="notif-sheet">
        <h3>Notifications</h3>
        ${(list).map((n) => `
          <div class="list-row" style="margin-bottom:8px">
            <div><strong>${esc(n.title)}</strong><br><span>${esc(n.body || '')}</span></div>
          </div>
        `).join('') || '<p class="rank-meta">Rien de nouveau.</p>'}
        <button type="button" class="btn-outline" style="width:100%;margin-top:12px" id="closeNotif">Fermer</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    $('#closeNotif', overlay)?.addEventListener('click', async () => {
      try { await api('read-notifications', { method: 'POST', body: {} }); } catch {}
      overlay.remove();
      $('#notifDot').classList.add('hidden');
    });
  });

  $$('.bottom-nav .nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      renderApp();
    });
  });

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ——— PWA install ——— */
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredPrompt = e;
    $('#installBtn')?.classList.remove('hidden');
  });
  $('#installBtn')?.addEventListener('click', triggerInstall);
  async function triggerInstall() {
    if (state.deferredPrompt) {
      state.deferredPrompt.prompt();
      await state.deferredPrompt.userChoice;
      state.deferredPrompt = null;
      $('#installBtn')?.classList.add('hidden');
    } else {
      toast('Sur iPhone : Partager → Sur l\'écran d\'accueil');
    }
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'navigate') {
        state.view = event.data.view || 'community';
        if (event.data.channel) state.channel = event.data.channel;
        if (state.token) enterApp();
      }
    });
  }

  setupAuth();
  const bootParams = new URLSearchParams(location.search);
  const viewParam = bootParams.get('view');
  if (viewParam) state.view = viewParam;
  if (bootParams.get('channel')) state.channel = bootParams.get('channel');
  enterApp();
})();
