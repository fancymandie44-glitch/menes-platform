'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function run() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const shop = fs.readFileSync(path.join(ROOT, 'shop.js'), 'utf8');
  const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');

  assert(html.includes('href="https://www.mymenes.com/"'), 'canonical must be www.mymenes.com');
  assert(html.includes('og:url" content="https://www.mymenes.com/"'), 'og:url must be www.mymenes.com');
  assert(!html.includes('boutiquemenes.netlify.app'), 'homepage must not advertise the Netlify origin');
  assert(/Luxury Streetwear/.test(html), 'Luxury positioning stays in metadata');
  assert(html.includes('id="design"'), 'atelier / design section is present');
  assert(html.includes('@menes_vs1'), 'community CTA uses @menes_vs1');
  assert(!html.includes('menes_jewelry'), 'homepage must not link the old jewelry IG');
  assert(shop.includes("IG_HANDLE = '@menes_vs1'"), 'shop IG default is @menes_vs1');
  assert(!/coming soon/i.test(html), 'homepage HTML must not say coming soon');
  assert(!/Ils portent MENES/.test(html), 'default homepage language should not mix FR gallery title');
  assert(!/Toutes les tailles/.test(html), 'size filter default must be English before i18n');
  assert(!/Rejoins la liste VIP/.test(html), 'VIP leftover French must not sit in EN HTML');

  assert(!/cachedStoreScore\(cached\) > cachedStoreScore\(data\)/.test(shop), 'shop must not prefer stale localStorage over the live API');
  assert(html.includes('menes_store_cache_v'), 'homepage must drop the old catalog cache once');
  assert(shop.includes('MIN_PUBLIC_REVIEWS = 3'), 'reviews stay hidden until 3 approved');
  assert(!/everywhere —/.test(shop), 'Why manifesto must not use emdash');
  assert(shop.includes("MENES_VALUES"), '21 value chips exist');
  assert((shop.match(/'Brotherhood'/) || []).length >= 1, 'Brotherhood value exists');
  assert(shop.includes('function guardContrast'), 'theme contrast guard exists');
  assert(shop.includes('function setVisitorAppearance'), 'shop visitors can toggle light/dark');
  assert(shop.includes("THEME_KEY = 'menes_appearance'"), 'appearance is persisted locally');
  const css = fs.readFileSync(path.join(ROOT, 'shop.css'), 'utf8');
  assert(html.includes('id="cartScroll"'), 'cart uses a single mobile scroll region');
  assert(/body\.scroll-locked \.sticky-atc/.test(css), 'sticky add-to-cart hides when the cart is open');
  assert(/z-index:\s*410/.test(css), 'cart panel sits above the sticky add bar');
  assert(/z-index:\s*520/.test(css), 'checkout modal sits above the cart sheet');
  assert(/touch-action:\s*pan-y pinch-zoom/.test(css), 'cart allows scroll and pinch-zoom');
  assert(!/html\.scroll-locked,\s*body\.scroll-locked \{[^}]*touch-action:\s*none/.test(css), 'page lock must not kill pinch-zoom');
  assert(!/\.cart-upsells-list \{[^}]*max-height:\s*220px/.test(css), 'upsells must not nest a second mobile scroller');
  assert(shop.includes('function fitSheetsToVisualViewport'), 'cart follows the iOS visual viewport while zooming');
  assert(shop.includes('function openCheckout'), 'checkout is a dedicated step after the cart');
  assert(shop.includes('openCart();'), 'adding a product opens the cart');
  assert(html.includes('id="checkoutBackCart"'), 'checkout can return to the cart');
  assert(html.includes('data-method="stripe"'), 'card checkout defaults to Stripe');
  assert(html.includes('id="payMethod" value="stripe"'), 'pay form posts Stripe by default');
  assert(/user-scalable=yes/.test(html), 'viewport allows pinch-zoom');
  assert(html.includes('id="themeToggle"'), 'nav has a dark/light toggle');
  assert(shop.includes('function displayOptionName'), 'option labels localize to English');
  assert(shop.includes("taille: 'Size'"), 'Taille option reads as Size in English');
  assert(shop.includes("LANG_KEY = 'menes_lang_v3'"), 'language key reset defaults visitors to English');
  assert(shop.includes('DEFAULT_SITE_FR'), 'French copy pack exists');
  assert((shop.match(/q: '/g) || []).length >= 16, 'FAQ should include EN + FR questions');
  assert(shop.includes('toggle(\'guarantee\', false)'), 'SSL guarantee block is forced off');
  assert(!/Customer photo<br>soon/.test(shop), 'gallery placeholders must not say coming soon');

  const keepers = [
    'images/community/hat-outdoor.jpg',
    'images/community/street-point.jpg',
    'images/community/field-duo.jpg',
    'images/community/hoodie-look.jpg',
    'images/atelier/hat-orange-detail.jpg',
    'images/atelier/socks-lineup.jpg',
  ];
  for (const rel of keepers) {
    const full = path.join(ROOT, rel);
    assert(fs.existsSync(full) && fs.statSync(full).size > 1000, `missing keeper ${rel}`);
  }
  assert(!fs.existsSync(path.join(ROOT, 'images/community/gym-selfie.jpg')), 'gym selfie must stay discarded');

  assert(robots.includes('Sitemap: https://www.mymenes.com/sitemap.xml'), 'robots sitemap uses production domain');

  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/build-boutique.js')], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert(result.status === 0, `build failed: ${result.stderr || result.stdout}`);
  const distHtml = fs.readFileSync(path.join(ROOT, 'dist/index.html'), 'utf8');
  assert(distHtml.includes('https://www.mymenes.com/'), 'built homepage keeps production canonical');
  assert(fs.existsSync(path.join(ROOT, 'dist/images/community/hat-outdoor.jpg')), 'build copies community photos');
  assert(fs.existsSync(path.join(ROOT, 'dist/images/atelier/socks-lineup.jpg')), 'build copies atelier photos');

  console.log('ok: storefront content, i18n defaults, canonical, community photos');
}

run();
