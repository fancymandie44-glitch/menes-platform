/**
 * Storefront tracking — pixels only after consent. CAPI token never lives here.
 */
(function () {
  const KEY = 'menes_consent_v1';
  let pixelsReady = false;

  function consent() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
  }

  function saveConsent(next) {
    localStorage.setItem(KEY, JSON.stringify(next));
  }

  function allowed() {
    const c = consent();
    return c && (c.marketing === true || c.analytics === true);
  }

  function eventId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `e_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function trackingCfg() {
    return (typeof storeData !== 'undefined' && storeData?.site?.tracking) || {};
  }

  function loadPixels() {
    if (pixelsReady || !allowed()) return;
    const t = trackingCfg();
    const c = consent() || {};
    if (c.marketing && t.metaPixelId && !window.fbq) {
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://connect.facebook.net/en_US/fbevents.js';
      document.head.appendChild(s);
      window.fbq = window.fbq || function () { (window.fbq.q = window.fbq.q || []).push(arguments); };
      window.fbq('init', t.metaPixelId);
    }
    if (c.marketing && t.tiktokPixelId && !window.ttq) {
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://analytics.tiktok.com/i18n/pixel/events.js';
      document.head.appendChild(s);
      window.ttq = window.ttq || { track() {}, page() {}, load() {} };
      try { window.ttq.load && window.ttq.load(t.tiktokPixelId); } catch {}
    }
    if (c.analytics && t.ga4MeasurementId && !window.gtag) {
      const s = document.createElement('script');
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(t.ga4MeasurementId)}`;
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', t.ga4MeasurementId, { anonymize_ip: true });
    }
    pixelsReady = true;
  }

  function itemsFromCart() {
    const cart = (typeof window.cart !== 'undefined' && window.cart) || [];
    return cart.map((c) => ({ id: c.id, name: c.name, price: c.price, qty: c.qty }));
  }

  async function track(name, extra) {
    const c = consent() || {};
    if (!allowed()) return;
    const id = eventId();
    const payload = Object.assign({
      event: name,
      eventId: id,
      url: location.href,
      currency: 'CAD',
      consent: c.marketing === true || c.analytics === true,
      items: extra?.items || itemsFromCart(),
      value: extra?.value,
      transactionId: extra?.transactionId,
      search: extra?.search,
    }, extra || {});
    loadPixels();
    try {
      if (c.marketing && window.fbq) window.fbq('track', name === 'PageView' ? 'PageView' : name, { value: payload.value, currency: 'CAD', contents: payload.items }, { eventID: id });
      if (c.marketing && window.ttq && window.ttq.track) window.ttq.track(name === 'Purchase' ? 'CompletePayment' : name, { value: payload.value, currency: 'CAD' }, { event_id: id });
      if (c.analytics && window.gtag) window.gtag('event', name.toLowerCase(), { transaction_id: payload.transactionId, value: payload.value, currency: 'CAD', event_id: id });
    } catch {}
    try {
      const api = (typeof shopApi === 'function') ? shopApi('/api/track') : '/api/track';
      await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } catch {}
  }

  function renderBar() {
    const bar = document.getElementById('consentBar');
    if (!bar) return;
    if (consent()) {
      bar.classList.add('hidden');
      loadPixels();
      return;
    }
    const fr = document.documentElement.lang === 'fr';
    bar.classList.remove('hidden');
    bar.innerHTML = `<p>${fr
      ? 'MENES utilise des témoins nécessaires au panier. Les pixels pub (Meta, TikTok, Google) restent éteints tant que tu n’acceptes pas.'
      : 'MENES uses essential cookies for the cart. Ad pixels (Meta, TikTok, Google) stay off until you accept.'}</p>
      <div class="consent-actions">
        <button type="button" id="consentReject" class="btn-outline-sm">${fr ? 'Essentiel seulement' : 'Essential only'}</button>
        <button type="button" id="consentAccept" class="btn-checkout">${fr ? 'Accepter le suivi' : 'Accept tracking'}</button>
      </div>`;
    bar.querySelector('#consentAccept')?.addEventListener('click', () => {
      saveConsent({ necessary: true, analytics: true, marketing: true, at: Date.now() });
      bar.classList.add('hidden');
      loadPixels();
      track('PageView');
    });
    bar.querySelector('#consentReject')?.addEventListener('click', () => {
      saveConsent({ necessary: true, analytics: false, marketing: false, at: Date.now() });
      bar.classList.add('hidden');
    });
  }

  window.menesTrack = track;
  window.menesConsent = { get: consent, save: saveConsent };
  document.addEventListener('DOMContentLoaded', () => {
    renderBar();
    if (allowed()) {
      loadPixels();
      track('PageView');
    }
  });
})();
