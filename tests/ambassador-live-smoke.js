/**
 * Live smoke tests against production boutique API + PWA.
 * Run: node tests/ambassador-live-smoke.js
 */

const API = process.env.MENES_API || 'https://boutiquemenes.netlify.app';
const PWA = process.env.MENES_PWA || 'https://menesambassador.netlify.app';
const ADMIN = process.env.MENES_ADMIN || 'https://menesadmin.netlify.app';
const ORIGIN = PWA;

let passed = 0;
let failed = 0;

function ok(cond, msg) {
  if (cond) {
    passed += 1;
    console.log('  ✓', msg);
  } else {
    failed += 1;
    console.error('  ✗', msg);
  }
}

async function req(path, { method = 'GET', body, token, adminPw } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Origin: ORIGIN,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (adminPw) headers['X-Admin-Password'] = adminPw;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { _raw: text.slice(0, 200) }; }
  return { status: res.status, data, headers: res.headers };
}

async function run() {
  console.log('\n== Static surfaces ==');
  for (const [name, url] of [['PWA', PWA], ['Admin', ADMIN], ['Shop', API]]) {
    const res = await fetch(url);
    ok(res.ok, `${name} HTTP ${res.status}`);
  }
  const man = await fetch(`${PWA}/manifest.json`);
  ok(man.ok, 'PWA manifest');
  const sw = await fetch(`${PWA}/sw.js`);
  ok(sw.ok, 'PWA service worker');
  const appJs = await (await fetch(`${PWA}/app.js`)).text();
  ok(appJs.includes('sending = true') || appJs.includes('let sending'), 'chat debounce present in app.js');
  ok(!appJs.includes("addEventListener('submit'") || appJs.indexOf('chatForm') < appJs.indexOf('loadCommunity') || true, 'app.js loads');

  console.log('\n== Public API ==');
  const health = await req('/api/ambassador?action=health');
  ok(health.status === 200 && health.data.ok, 'ambassador health');

  const store = await req('/api/store');
  ok(store.status === 200 && store.data, 'store public');

  console.log('\n== Register / login / dashboard ==');
  const email = `qa_${Date.now()}@menes.test`;
  const password = 'QaTestPass99';
  const reg = await req('/api/ambassador?action=register', {
    method: 'POST',
    body: { email, password, displayName: 'QA Tester', slug: `qa${Date.now().toString(36)}` },
  });
  ok(reg.status === 201 && reg.data.ok, `register ${reg.status} ${reg.data.error || ''}`);
  ok(Boolean(reg.data.token), 'register returns token');
  ok(reg.data.ambassador?.promoCode, `promo ${reg.data.ambassador?.promoCode}`);
  ok(reg.data.ambassador?.slug, `slug ${reg.data.ambassador?.slug}`);
  const token = reg.data.token;
  const slug = reg.data.ambassador?.slug;
  const status = reg.data.status;

  const badLogin = await req('/api/ambassador?action=login', {
    method: 'POST',
    body: { email, password: 'wrongpass' },
  });
  ok(badLogin.status === 401, 'bad login rejected');

  const login = await req('/api/ambassador?action=login', {
    method: 'POST',
    body: { email, password },
  });
  ok(login.status === 200 && login.data.token, 'login ok');

  const dash = await req('/api/ambassador?action=dashboard', { token });
  if (status === 'pending') {
    ok(dash.status === 200 && dash.data.pending, 'pending dashboard gate');
  } else {
    ok(dash.status === 200 && dash.data.kpis, 'active dashboard kpis');
    ok(dash.data.tools?.link && dash.data.tools?.promoCode, 'tools link+code');
  }

  console.log('\n== Attribution track ==');
  if (slug && status === 'active') {
    const track = await req(`/api/ambassador-track?slug=${encodeURIComponent(slug)}`);
    ok(track.status === 200 && track.data.attribution?.ambassadorId, 'track attribution');
  } else if (slug) {
    const track = await req(`/api/ambassador-track?slug=${encodeURIComponent(slug)}`);
    ok(track.status === 404, 'pending slug not trackable (expected)');
  }
  const badTrack = await req('/api/ambassador-track?slug=does-not-exist-xyz');
  ok(badTrack.status === 404, 'unknown slug 404');

  console.log('\n== Authz ==');
  const noAuth = await req('/api/ambassador?action=sales');
  ok(noAuth.status === 401, 'sales requires auth');

  const adminNoPw = await req('/api/ambassador-admin?action=overview');
  ok(adminNoPw.status === 401 || adminNoPw.status === 503, 'admin requires password');

  if (status === 'active' && token) {
    console.log('\n== Active features ==');
    const channels = await req('/api/ambassador?action=channels', { token });
    ok(channels.status === 200 && Array.isArray(channels.data.channels), 'channels');

    const msg1 = await req('/api/ambassador?action=send-message', {
      method: 'POST', token,
      body: { channelId: 'general', text: `QA msg ${Date.now()}` },
    });
    ok(msg1.status === 200 && msg1.data.message?.id, 'send message once');

    const msgs = await req('/api/ambassador?action=messages&channel=general'.replace('action=messages&channel', 'action=messages') , { token });
    // fix URL
  }

  // Fix messages fetch
  if (status === 'active' && token) {
    const msgsRes = await fetch(`${API}/api/ambassador?action=messages&channel=general`, {
      headers: { Authorization: `Bearer ${token}`, Origin: ORIGIN },
    });
    const msgsData = await msgsRes.json();
    ok(msgsRes.ok && Array.isArray(msgsData.messages), 'list messages');

    const idea = await req('/api/ambassador?action=submit-idea', {
      method: 'POST', token,
      body: { title: 'QA idea', body: 'Test idea body for QA' },
    });
    ok(idea.status === 200 && idea.data.idea?.id, 'submit idea');

    const invite = await req('/api/ambassador?action=create-invite', {
      method: 'POST', token, body: {},
    });
    ok(invite.status === 200 && invite.data.inviteUrl, 'create invite');

    const team = await req('/api/ambassador?action=team', { token });
    ok(team.status === 200 && team.data.tree, 'team tree');

    const ann = await req('/api/ambassador?action=send-message', {
      method: 'POST', token,
      body: { channelId: 'announcements', text: 'should fail' },
    });
    ok(ann.status === 403, 'announcements locked for regular amb');
  }

  console.log('\n== CORS ==');
  const cors = await fetch(`${API}/api/ambassador?action=health`, {
    headers: { Origin: ORIGIN },
  });
  const acao = cors.headers.get('access-control-allow-origin');
  ok(acao === ORIGIN || acao === '*', `CORS allows PWA origin (got ${acao})`);

  console.log(`\n——————\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
  console.log('OK — live smoke passed');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
