/**
 * Shop bundles UI — driven only by MENES_BUNDLES (data/bundles.js).
 */
(function () {
  const PRELOADED = new Set();
  let booted = false;
  let activeSlug = '';
  let selectedCombo = '';
  let builderPicks = [];
  let selectedBoxerColor = '';
  let selectedBoxerSize = '';
  let skipNextPop = false;
  let dropTick = 0;
  let dropWasLive = null;

  function api() {
    return window.MENES_BUNDLES || null;
  }

  function lang() {
    return typeof currentLang === 'string' && currentLang === 'fr' ? 'fr' : 'en';
  }

  function loc(map) {
    const B = api();
    return B ? B.loc(map, lang()) : '';
  }

  function isMemberContext() {
    const B = api();
    if (!B) return false;
    const code = String(B.CLIENT_DISCOUNT?.code || '').toUpperCase();
    if (typeof appliedPromoCode === 'string' && appliedPromoCode.toUpperCase() === code) return true;
    if (B.CLIENT_DISCOUNT?.autoIfPassport && typeof rememberedPassportEmail === 'function' && rememberedPassportEmail()) {
      return Number(B.CLIENT_DISCOUNT.percent) > 0;
    }
    return false;
  }

  function money(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '';
    const s = v.toFixed(2);
    return lang() === 'fr' ? `${s.replace('.', ',')}$` : `${s}$`;
  }

  function priceHtml(bundle, opts = {}) {
    const B = api();
    if (!B || !B.isPriced(bundle)) {
      return `<span class="price-now">${esc(lang() === 'fr' ? 'Prix à confirmer' : 'Price to confirm')}</span>`;
    }
    const list = Number(bundle.price);
    const member = isMemberContext() ? B.memberPrice(list, true) : list;
    const save = B.savings(bundle);
    const showMember = isMemberContext() && member < list;
    const old = save ? `<span class="price-old">${esc(money(bundle.comparePrice))} CAD</span>` : '';
    const now = `<span class="price-now">${esc(money(showMember ? member : list))} CAD</span>`;
    const saveBadge = save && !showMember ? `<span class="price-save">−${esc(String(save.pct))}%</span>` : '';
    const memberNote = showMember
      ? `<span class="bundle-member-price">${esc(loc(B.CLIENT_DISCOUNT.label))}: ${esc(money(member))} · ${esc(lang() === 'fr' ? 'rég.' : 'reg.')} ${esc(money(list))}</span>`
      : (Number(B.CLIENT_DISCOUNT.percent) > 0
        ? `<span class="bundle-member-hint">${esc(lang() === 'fr' ? 'Prix client avec Passeport ou code' : 'Member price with Passport or code')} ${esc(B.CLIENT_DISCOUNT.code)}</span>`
        : '');
    if (opts.compact) return `${old}${now}${saveBadge}`;
    return `${old}${now}${saveBadge}${memberNote}`;
  }

  function preloadBundleImages(bundle) {
    const urls = new Set();
    if (bundle.image) urls.add(bundle.image);
    (bundle.combos || []).forEach((c) => { if (c.image) urls.add(c.image); });
    (bundle.pairOptions || []).forEach((p) => { if (p.image) urls.add(p.image); });
    (bundle.boxerOptions || []).forEach((p) => { if (p.image) urls.add(p.image); });
    urls.forEach((src) => {
      if (PRELOADED.has(src)) return;
      PRELOADED.add(src);
      const img = new Image();
      img.src = src;
    });
  }

  function headline() {
    const B = api();
    if (B && !B.isDropLive()) {
      return lang() === 'fr'
        ? 'Les packs s’ouvrent le 20 novembre à minuit. Essentials 99,99 $. Kultur Steps 34,99 $. Holiday Exclusive 329,99 $. Tu peux les regarder maintenant. Tu les achètes à minuit.'
        : 'Packs unlock Nov 20 at midnight. Essentials 99.99. Kultur Steps 34.99. Holiday Exclusive 329.99. Look now. Buy when the clock hits zero.';
    }
    return lang() === 'fr'
      ? 'Le cadeau, sans te casser la tête. Essentials à 99,99 $. Kultur Steps à 34,99 $. Holiday Exclusive à 329,99 $. Tu construis le pack en une minute.'
      : 'Don\'t overthink the gift. Essentials at 99.99. Kultur Steps at 34.99. Holiday Exclusive at 329.99. Build it in a minute.';
  }

  function viewLabel() {
    return lang() === 'fr' ? 'Acheter maintenant' : 'Shop now';
  }

  function soonLabel() {
    return lang() === 'fr' ? 'Bientôt' : 'Coming soon';
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function clockHtml(parts) {
    const units = lang() === 'fr'
      ? [['d', 'j'], ['h', 'h'], ['m', 'min'], ['s', 's']]
      : [['d', 'd'], ['h', 'h'], ['m', 'm'], ['s', 's']];
    const vals = [parts.days, parts.hours, parts.minutes, parts.seconds];
    return units.map((u, i) => `<span class="bundle-drop-unit"><b>${esc(i === 0 ? String(vals[i]) : pad2(vals[i]))}</b><small>${esc(u[1])}</small></span>`).join('');
  }

  function renderDropTimer() {
    const B = api();
    const box = document.getElementById('shopBundlesTimer');
    if (!box || !B) return B ? B.isDropLive() : true;
    const live = B.isDropLive();
    if (live) {
      box.hidden = true;
      box.innerHTML = '';
      return true;
    }
    const parts = B.countdownParts();
    box.hidden = false;
    box.innerHTML = `
      <p class="bundle-drop-kicker">${esc(lang() === 'fr' ? 'Achat ouvert le 20 novembre à minuit' : 'Buy opens Nov 20 at midnight Eastern')}</p>
      <div class="bundle-drop-clock" aria-live="polite">${clockHtml(parts)}</div>
    `;
    return false;
  }

  function startDropTimer() {
    if (dropTick) return;
    renderDropTimer();
    dropWasLive = api()?.isDropLive() || false;
    dropTick = window.setInterval(() => {
      const live = renderDropTimer();
      if (live !== dropWasLive) {
        dropWasLive = live;
        renderShopBundles();
        if (activeSlug) renderBundlePanel();
        if (typeof updateCartUI === 'function') updateCartUI();
      } else if (activeSlug) {
        const msg = document.getElementById('bundleAtcMsg');
        const btn = document.getElementById('bundleAddBtn');
        const B = api();
        const bundle = B?.bySlug(activeSlug);
        if (msg && bundle && !B.canPurchase(bundle)) {
          msg.textContent = lockLine();
        }
        if (btn && bundle && !B.canPurchase(bundle)) {
          btn.textContent = lockLine(true);
        }
      }
    }, 1000);
  }

  function lockLine(short) {
    const B = api();
    if (!B || B.isDropLive()) return '';
    const p = B.countdownParts();
    if (short) {
      return lang() === 'fr'
        ? `Ouvre dans ${p.days}j ${pad2(p.hours)}h ${pad2(p.minutes)}m`
        : `Opens in ${p.days}d ${pad2(p.hours)}h ${pad2(p.minutes)}m`;
    }
    return B.dropLockMessage(lang());
  }

  function renderShopBundles() {
    const B = api();
    const grid = document.getElementById('shopBundlesGrid');
    const kicker = document.getElementById('shopBundlesKicker');
    const title = document.getElementById('shopBundlesTitle');
    const lead = document.getElementById('shopBundlesLead');
    if (!grid || !B) return;
    if (kicker) kicker.textContent = lang() === 'fr' ? 'Drop des fêtes' : 'Holiday drop';
    if (title) title.textContent = lang() === 'fr' ? 'Le temps des fêtes est là' : 'The season is on';
    if (lead) lead.textContent = headline();
    renderDropTimer();
    renderFastBuy(B);

    const list = B.sorted();
    grid.innerHTML = list.map((bundle) => {
      const ready = B.isBrowsable ? B.isBrowsable(bundle) : B.isReady(bundle);
      const buy = B.canPurchase ? B.canPurchase(bundle) : ready;
      const featured = !!bundle.featured;
      const highlights = (loc(bundle.highlights) || []).slice(0, 4);
      const img = bundle.image
        ? `<img src="${esc(bundle.image)}" alt="${esc(loc(bundle.name))}" width="640" height="800" ${featured ? '' : 'loading="lazy" decoding="async"'}>`
        : `<div class="shop-bundle-ph" aria-hidden="true">MENES</div>`;
      const badge = loc(bundle.badge);
      const urgency = typeof bundle.urgency === 'string' ? bundle.urgency : loc(bundle.urgency);
      const ctaLabel = buy ? viewLabel() : (ready ? (lang() === 'fr' ? 'Voir le pack' : 'See the pack') : soonLabel());
      const cta = ready
        ? `<a class="${featured && buy ? 'hero-cta' : 'btn-outline-block'}" href="/bundle/${esc(bundle.slug)}">${esc(ctaLabel)}</a>`
        : `<span class="shop-bundle-soon">${esc(soonLabel())}</span>`;
      return `<article class="shop-bundle-card${featured ? ' is-featured' : ''}${ready ? '' : ' is-soon'}${buy ? '' : ' is-locked'}" data-slug="${esc(bundle.slug)}">
        ${badge ? `<span class="shop-bundle-badge">${esc(badge)}</span>` : ''}
        <a class="shop-bundle-media" href="${ready ? `/bundle/${esc(bundle.slug)}` : '#shopBundles'}" ${ready ? '' : 'aria-disabled="true" tabindex="-1"'}>
          ${img}
        </a>
        <div class="shop-bundle-body">
          <h3>${esc(loc(bundle.name))}</h3>
          <p class="shop-bundle-tag">${esc(loc(bundle.tagline))}</p>
          <div class="shop-bundle-price">${priceHtml(bundle)}</div>
          ${urgency ? `<p class="shop-bundle-urgency">${esc(urgency)}</p>` : ''}
          ${highlights.length ? `<ul class="shop-bundle-points">${highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
          ${cta}
        </div>
      </article>`;
    }).join('');

    wireBundleLinks(grid);
  }

  function renderFastBuy(B) {
    const row = document.getElementById('shopBundlesFast');
    if (!row || !B) return;
    const ready = B.sorted().filter((b) => B.isReady(b))
      .sort((a, b) => Number(a.price) - Number(b.price));
    if (!ready.length) {
      row.innerHTML = '';
      return;
    }
    const live = B.isDropLive();
    row.innerHTML = ready.map((bundle) => {
      const label = live
        ? (lang() === 'fr'
          ? `${loc(bundle.name)} ${money(bundle.price)}. Acheter`
          : `${loc(bundle.name)} ${money(bundle.price)}. Shop now`)
        : (lang() === 'fr'
          ? `${loc(bundle.name)} · ouvre à minuit le 20`
          : `${loc(bundle.name)} · unlocks midnight Nov 20`);
      return `<a class="shop-bundles-fast-btn${bundle.featured && live ? ' is-featured' : ''}${live ? '' : ' is-locked'}" href="/bundle/${esc(bundle.slug)}">${esc(label)}</a>`;
    }).join('');
    wireBundleLinks(row);
  }

  function wireBundleLinks(root) {
    if (!root) return;
    root.querySelectorAll('a[href^="/bundle/"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const href = a.getAttribute('href') || '';
        const slug = href.replace(/^\/bundle\//, '').replace(/\/$/, '');
        if (!slug) return;
        e.preventDefault();
        openShopBundle(slug, { push: true });
      });
    });
  }

  function comboList(bundle) {
    return Array.isArray(bundle.combos) ? bundle.combos : [];
  }

  function activeCombo(bundle) {
    const B = api();
    return B.comboById(bundle, selectedCombo) || comboList(bundle)[0] || null;
  }

  function galleryUrls(bundle) {
    const combo = activeCombo(bundle);
    const urls = [];
    if (combo?.image) urls.push(combo.image);
    if (bundle.image && bundle.image !== combo?.image) urls.push(bundle.image);
    comboList(bundle).forEach((c) => {
      if (c.image && !urls.includes(c.image)) urls.push(c.image);
    });
    (bundle.boxerOptions || []).forEach((b) => {
      if (b.image && !urls.includes(b.image)) urls.push(b.image);
    });
    if (bundle.fixedPairId) {
      const B = api();
      const fixed = B?.pairById(bundle, bundle.fixedPairId);
      if (fixed?.image && !urls.includes(fixed.image)) urls.push(fixed.image);
    }
    (bundle.pairOptions || []).forEach((p) => {
      if (p.image && !urls.includes(p.image)) urls.push(p.image);
    });
    return urls;
  }

  function missingMessage(bundle) {
    const B = api();
    if (!B.isPriced(bundle)) return lang() === 'fr' ? 'Prix à confirmer. Pas encore en vente.' : 'Price to confirm. Not on sale yet.';
    if (bundle.kind === 'combo' && comboList(bundle).length && !selectedCombo) {
      return lang() === 'fr' ? 'Choisis un combo de couleurs.' : 'Pick a color combo.';
    }
    if (bundle.kind === 'builder') {
      const need = B.pairNeed ? B.pairNeed(bundle) : (Number(bundle.pairCount) || 3);
      const n = builderPicks.filter(Boolean).length;
      if (n < need) return lang() === 'fr' ? `${n} / ${need} paires choisies. Il en manque ${need - n}.` : `${n} / ${need} pairs chosen. ${need - n} left.`;
      if (bundle.boxer && !selectedBoxerColor) return lang() === 'fr' ? 'Choisis ton boxer (Red ou Grey).' : 'Pick your boxer (Red or Grey).';
      if (bundle.boxer && !selectedBoxerSize) return lang() === 'fr' ? 'Choisis la taille du boxer.' : 'Pick the boxer size.';
    }
    return '';
  }

  function canAdd(bundle) {
    const B = api();
    if (!B.canPurchase(bundle)) return false;
    const variant = currentVariant(bundle);
    return !B.validateLine(bundle, variant).error;
  }

  function currentVariant(bundle) {
    if (bundle.kind === 'builder') {
      const variant = { pairs: builderPicks.filter(Boolean) };
      if (bundle.boxer) {
        variant.boxerColor = selectedBoxerColor;
        variant.boxerSize = selectedBoxerSize;
      }
      return variant;
    }
    if (comboList(bundle).length) return { combo: selectedCombo || comboList(bundle)[0].id };
    return {};
  }

  function renderBundlePanel() {
    const B = api();
    const inner = document.getElementById('bundlePanelInner');
    if (!inner || !B) return;
    const bundle = B.bySlug(activeSlug);
    if (!bundle) {
      inner.innerHTML = `<div class="bundle-empty"><p>${esc(lang() === 'fr' ? 'Bundle introuvable.' : 'Bundle not found.')}</p></div>`;
      return;
    }
    preloadBundleImages(bundle);
    if (bundle.kind === 'combo' && !selectedCombo && comboList(bundle)[0]) selectedCombo = comboList(bundle)[0].id;
    const combo = activeCombo(bundle);
    const mainImg = combo?.image || bundle.image || '';
    const thumbs = galleryUrls(bundle);
    const included = loc(bundle.included) || [];
    const highlights = loc(bundle.highlights) || [];
    const ready = B.isReady(bundle);
    const miss = missingMessage(bundle);
    const addOk = canAdd(bundle);
    const comboName = combo ? loc(combo.name) : '';

    const thumbsHtml = thumbs.map((url, i) => `
      <button type="button" class="bundle-thumb${url === mainImg ? ' active' : ''}" data-url="${esc(url)}" aria-label="${esc(lang() === 'fr' ? `Photo ${i + 1}` : `Photo ${i + 1}`)}">
        <img src="${esc(url)}" alt="" width="64" height="64">
      </button>`).join('');

    const swatches = bundle.kind === 'combo'
      ? comboList(bundle).map((c) => `
      <button type="button" class="bundle-swatch${c.id === selectedCombo ? ' active' : ''}" data-combo="${esc(c.id)}"
        style="--swatch:${esc(c.swatch || '#888')}"
        aria-label="${esc(loc(c.name))}" aria-pressed="${c.id === selectedCombo ? 'true' : 'false'}"></button>`).join('')
      : '';

    const builder = bundle.kind === 'builder' ? renderBuilder(bundle) : '';
    inner.innerHTML = `
      <div class="bundle-pdp">
        <div class="pdp-media">
          <div class="pdp-img-wrap">
            <img id="bundleMainImg" src="${esc(mainImg)}" alt="${esc(loc(bundle.name))}${comboName ? ` ${esc(comboName)}` : ''}" width="720" height="900">
          </div>
          <div class="pdp-thumbs" id="bundleThumbs">${thumbsHtml}</div>
        </div>
        <div class="pdp-body">
          <p class="pdp-cat">${esc(loc(bundle.badge) || 'Bundle')}</p>
          <h2 id="bundlePdpName">${esc(loc(bundle.name))}</h2>
          <p class="shop-bundle-tag">${esc(loc(bundle.tagline))}</p>
          <div class="pdp-price">${priceHtml(bundle)}</div>
          ${loc(bundle.urgency) || (typeof bundle.urgency === 'string' && bundle.urgency) ? `<p class="pdp-urgency">${esc(typeof bundle.urgency === 'string' ? bundle.urgency : loc(bundle.urgency))}</p>` : ''}
          <p class="pdp-desc">${esc(loc(bundle.description))}</p>
          ${included.length ? `<div class="bundle-included"><h3>${esc(lang() === 'fr' ? 'Ce que le bundle contient' : 'What this bundle includes')}</h3><ul>${included.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`
            : (highlights.length ? `<ul class="shop-bundle-points">${highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : '')}
          ${swatches ? `<div class="bundle-swatch-block"><p class="bundle-swatch-label" id="bundleColorName">${esc(comboName || (lang() === 'fr' ? 'Couleur' : 'Color'))}</p><div class="bundle-swatches" role="group" aria-label="${esc(lang() === 'fr' ? 'Combos de couleurs' : 'Color combos')}">${swatches}</div></div>` : ''}
          ${builder}
          <div class="pdp-proof">
            <span>${esc(t('proof_pay'))}</span>
            <span>${esc(t('proof_ship'))}</span>
            <span>${esc(t('proof_ex'))}</span>
          </div>
          <p class="bundle-atc-msg" id="bundleAtcMsg">${esc(B.canPurchase(bundle) ? miss : lockLine())}</p>
          <button type="button" class="btn-checkout" id="bundleAddBtn" ${addOk ? '' : 'disabled'}>${esc(B.canPurchase(bundle) ? t('add_to_cart') : lockLine(true))}</button>
        </div>
      </div>
      `;

    inner.querySelectorAll('.bundle-swatch').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedCombo = btn.getAttribute('data-combo') || '';
        renderBundlePanel();
      });
    });
    inner.querySelectorAll('.bundle-thumb').forEach((btn) => {
      btn.addEventListener('click', () => {
        const url = btn.getAttribute('data-url');
        const img = document.getElementById('bundleMainImg');
        if (!img || !url) return;
        inner.querySelectorAll('.bundle-thumb').forEach((b) => b.classList.toggle('active', b === btn));
        img.style.opacity = '0';
        window.setTimeout(() => { img.src = url; img.style.opacity = '1'; }, 120);
      });
    });
    inner.querySelector('#bundleAddBtn')?.addEventListener('click', () => addBundleToCart(bundle));
    bindBuilder(bundle);
    applyBundleSeo(bundle);
  }

  function renderBuilder(bundle) {
    const B = api();
    const need = B.pairNeed ? B.pairNeed(bundle) : (Number(bundle.pairCount) || 3);
    if (builderPicks.length !== need) builderPicks = Array.from({ length: need }, (_, i) => builderPicks[i] || null);
    const filled = builderPicks.filter(Boolean).length;
    const fixedPair = bundle.fixedPairId ? B.pairById(bundle, bundle.fixedPairId) : null;
    const locked = fixedPair ? `<div class="builder-slot is-filled is-locked" aria-label="${esc(loc(fixedPair.name))}">
        <span class="builder-slot-n">${esc(lang() === 'fr' ? 'Incluse' : 'Included')}</span>
        <img src="${esc(fixedPair.image)}" alt="${esc(loc(fixedPair.name))}">
        <strong>${esc(loc(fixedPair.name))}</strong>
      </div>` : '';
    const slots = builderPicks.map((id, i) => {
      const pair = id ? B.pairById(bundle, id) : null;
      return `<div class="builder-slot${pair ? ' is-filled' : ''}" data-slot="${i}">
        <span class="builder-slot-n">${esc(lang() === 'fr' ? `Paire ${i + 1}` : `Pair ${i + 1}`)}</span>
        ${pair ? `<img src="${esc(pair.image)}" alt="${esc(loc(pair.name))}"><strong>${esc(loc(pair.name))}</strong>
          <button type="button" class="builder-clear" data-clear="${i}" aria-label="${esc(lang() === 'fr' ? 'Retirer' : 'Remove')}">${esc(lang() === 'fr' ? 'Retirer' : 'Remove')}</button>`
          : `<span class="builder-empty">${esc(lang() === 'fr' ? 'En attente' : 'Empty')}</span>`}
      </div>`;
    }).join('');
    const options = (bundle.pairOptions || []).map((p) => {
      const out = p.inStock === false;
      const used = !bundle.allowDuplicatePairs && builderPicks.includes(p.id);
      const disabled = out || used;
      return `<button type="button" class="builder-opt${disabled ? ' is-disabled' : ''}" data-pair="${esc(p.id)}" ${disabled ? 'disabled' : ''}
        aria-label="${esc(loc(p.name))}${out ? ` ${esc(t('sold_out'))}` : ''}">
        <img src="${esc(p.image)}" alt="${esc(loc(p.name))}" width="160" height="200">
        <span class="builder-opt-swatch" style="background:${esc(p.swatch || '#888')}" aria-hidden="true"></span>
        <strong>${esc(loc(p.name))}</strong>
        ${out ? `<span class="builder-oos">${esc(t('sold_out'))}</span>` : ''}
      </button>`;
    }).join('');
    const boxer = bundle.boxer ? B.boxerById(bundle, selectedBoxerColor) : null;
    const boxerSizes = bundle.boxerSizes || ['S', 'M', 'L', 'XL'];
    const boxerBlock = bundle.boxer ? `
      <div class="builder-boxer">
        <p class="builder-count">${esc(lang() === 'fr' ? 'Choisis ton boxer' : 'Pick your boxer')}</p>
        <div class="builder-grid builder-boxer-grid">
          ${(bundle.boxerOptions || []).map((b) => `
            <button type="button" class="builder-opt${b.id === selectedBoxerColor ? ' is-active' : ''}" data-boxer="${esc(b.id)}" aria-pressed="${b.id === selectedBoxerColor ? 'true' : 'false'}">
              <img src="${esc(b.image)}" alt="${esc(loc(b.name))}" width="160" height="200">
              <span class="builder-opt-swatch" style="background:${esc(b.swatch || '#888')}" aria-hidden="true"></span>
              <strong>${esc(loc(b.name))}</strong>
            </button>`).join('')}
        </div>
        <p class="builder-count">${esc(lang() === 'fr' ? 'Taille' : 'Size')}</p>
        <div class="builder-sizes" role="group" aria-label="${esc(lang() === 'fr' ? 'Taille du boxer' : 'Boxer size')}">
          ${boxerSizes.map((s) => `<button type="button" class="opt-chip${s === selectedBoxerSize ? ' active' : ''}" data-boxer-size="${esc(s)}" aria-pressed="${s === selectedBoxerSize ? 'true' : 'false'}">${esc(s)}</button>`).join('')}
        </div>
      </div>` : '';
    const summary = [];
    if (fixedPair) summary.push(loc(fixedPair.name));
    builderPicks.filter(Boolean).forEach((id) => summary.push(loc(B.pairById(bundle, id)?.name) || id));
    if (boxer) summary.push(`${loc(boxer.name)} ${selectedBoxerSize}`.trim());
    const slotClass = (need + (fixedPair ? 1 : 0)) === 3 ? '' : (need === 2 ? ' builder-slots-2' : '');
    const countLine = fixedPair
      ? `${esc(lang() === 'fr' ? '1 paire Kultur incluse' : '1 Kultur pair included')} · ${esc(String(filled))} / ${esc(String(need))} ${esc(lang() === 'fr' ? 'couleurs' : 'colors')}`
      : `${esc(String(filled))} / ${esc(String(need))} ${esc(lang() === 'fr' ? 'paires choisies' : 'pairs chosen')}`;
    return `<div class="bundle-builder" aria-label="${esc(lang() === 'fr' ? 'Compose ton pack' : 'Build your pack')}">
      <div class="builder-count" aria-live="polite">${countLine}</div>
      <div class="builder-slots${slotClass}">${locked}${slots}</div>
      <div class="builder-grid">${options}</div>
      ${boxerBlock}
      <div class="builder-summary">
        <strong>${esc(lang() === 'fr' ? 'Résumé' : 'Summary')}</strong>
        <p>${summary.length ? esc(summary.join(' · ')) : esc(lang() === 'fr' ? 'Rien encore.' : 'Nothing yet.')}</p>
        <p class="builder-total">${priceHtml(bundle, { compact: true })}</p>
      </div>
    </div>`;
  }

  function bindBuilder(bundle) {
    if (bundle.kind !== 'builder') return;
    const inner = document.getElementById('bundlePanelInner');
    if (!inner) return;
    inner.querySelectorAll('.builder-opt').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-pair');
        const idx = builderPicks.findIndex((x) => !x);
        if (idx < 0) return;
        builderPicks[idx] = id;
        renderBundlePanel();
      });
    });
    inner.querySelectorAll('.builder-clear').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.getAttribute('data-clear'));
        builderPicks[i] = null;
        renderBundlePanel();
      });
    });
    inner.querySelectorAll('[data-boxer]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedBoxerColor = btn.getAttribute('data-boxer') || '';
        renderBundlePanel();
      });
    });
    inner.querySelectorAll('[data-boxer-size]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedBoxerSize = btn.getAttribute('data-boxer-size') || '';
        renderBundlePanel();
      });
    });
  }

  function addBundleToCart(bundle) {
    const B = api();
    if (!B || !B.canPurchase(bundle)) {
      showToast(lockLine() || B?.dropLockMessage(lang()));
      return;
    }
    if (!canAdd(bundle)) return;
    const variant = currentVariant(bundle);
    const check = B.validateLine(bundle, variant);
    if (check.error) {
      showToast(check.error);
      return;
    }
    const variantStr = B.variantLabel(bundle, check.variant, lang()) || loc(bundle.name);
    const combo = B.comboById(bundle, check.variant?.combo);
    const existing = cart.find((c) => c.id === bundle.id && (c.variantStr || c.size) === variantStr);
    if (existing) existing.qty += 1;
    else {
      cart.push({
        id: bundle.id,
        name: loc(bundle.name),
        price: Number(bundle.price),
        variant: check.variant,
        variantStr,
        size: variantStr,
        qty: 1,
        image: combo?.image || bundle.image || '',
        bundle: true,
      });
    }
    persistCart();
    updateCartUI({ forceList: true });
    showToast(t('added'));
    closeShopBundle({ restore: true });
    document.getElementById('cartBtn')?.click();
  }

  function applyBundleSeo(bundle) {
    if (!bundle) return;
    const B = api();
    document.title = loc(bundle.seoTitle) || loc(bundle.name);
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta); }
    meta.content = loc(bundle.seoDescription) || loc(bundle.description);
    setMetaProp('og:title', document.title);
    setMetaProp('og:description', meta.content);
    setMetaProp('og:url', `${B.SITE_ORIGIN}/bundle/${bundle.slug}`);
    if (bundle.image) setMetaProp('og:image', `${B.SITE_ORIGIN}${bundle.image}`);
    let canon = document.querySelector('link[rel="canonical"]');
    if (!canon) { canon = document.createElement('link'); canon.rel = 'canonical'; document.head.appendChild(canon); }
    canon.href = `${B.SITE_ORIGIN}/bundle/${bundle.slug}`;
  }

  function setMetaProp(property, content) {
    let el = document.querySelector(`meta[property="${property}"]`);
    if (!el) { el = document.createElement('meta'); el.setAttribute('property', property); document.head.appendChild(el); }
    el.content = content;
  }

  function openShopBundle(slug, opts = {}) {
    const B = api();
    if (!B) return;
    const bundle = B.bySlug(slug);
    if (!bundle) return;
    activeSlug = slug;
    selectedCombo = comboList(bundle)[0]?.id || '';
    builderPicks = Array.from({ length: B.pairNeed ? B.pairNeed(bundle) : (Number(bundle.pairCount) || 3) }, () => null);
    selectedBoxerColor = '';
    selectedBoxerSize = '';
    document.getElementById('pdpPanel')?.classList.add('hidden');
    document.getElementById('pdpOverlay')?.classList.add('hidden');
    document.getElementById('bundleOverlay')?.classList.remove('hidden');
    const panel = document.getElementById('bundlePanel');
    if (panel) {
      panel.classList.remove('hidden');
      panel.setAttribute('aria-hidden', 'false');
    }
    renderBundlePanel();
    if (typeof syncScrollLock === 'function') syncScrollLock();
    const path = `/bundle/${slug}`;
    if (opts.push && location.pathname !== path) {
      skipNextPop = true;
      history.pushState({ menesBundle: slug }, '', path);
    }
  }

  function closeShopBundle(opts = {}) {
    document.getElementById('bundleOverlay')?.classList.add('hidden');
    const panel = document.getElementById('bundlePanel');
    if (panel) {
      panel.classList.add('hidden');
      panel.setAttribute('aria-hidden', 'true');
    }
    activeSlug = '';
    if (typeof syncScrollLock === 'function') syncScrollLock();
    if (opts.restore && location.pathname.startsWith('/bundle/')) {
      skipNextPop = true;
      history.pushState({}, '', '/');
    }
    if (typeof applySeo === 'function') applySeo();
  }

  function routeFromLocation() {
    const m = location.pathname.match(/^\/bundle\/([a-z0-9-]+)\/?$/i);
    if (m) openShopBundle(m[1], { push: false });
    else if (activeSlug) closeShopBundle();
  }

  function maybeApplyMemberPromo() {
    const B = api();
    if (!B || !B.CLIENT_DISCOUNT?.autoIfPassport) return;
    if (!(Number(B.CLIENT_DISCOUNT.percent) > 0)) return;
    if (typeof rememberedPassportEmail !== 'function' || !rememberedPassportEmail()) return;
    if (typeof applyPromoCode === 'function') applyPromoCode(B.CLIENT_DISCOUNT.code, { silent: true });
  }

  function initShopBundles() {
    renderShopBundles();
    startDropTimer();
    maybeApplyMemberPromo();
    if (booted) {
      routeFromLocation();
      return;
    }
    booted = true;
    document.getElementById('closeBundle')?.addEventListener('click', () => closeShopBundle({ restore: true }));
    document.getElementById('bundleOverlay')?.addEventListener('click', () => closeShopBundle({ restore: true }));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && activeSlug) closeShopBundle({ restore: true });
    });
    window.addEventListener('popstate', () => {
      if (skipNextPop) { skipNextPop = false; return; }
      routeFromLocation();
    });
    api()?.sorted().forEach((b) => { if (b.published !== false) preloadBundleImages(b); });
    routeFromLocation();
  }

  window.initShopBundles = initShopBundles;
  window.renderShopBundles = renderShopBundles;
  window.openShopBundle = openShopBundle;
  window.closeShopBundle = closeShopBundle;
  window.maybeApplyMemberPromo = maybeApplyMemberPromo;
  window.refreshBundleUi = function refreshBundleUi() {
    renderShopBundles();
    if (activeSlug) renderBundlePanel();
  };
})();
