const http = require('http');
const fs = require('fs');
const path = require('path');
const { readStoreFile, writeStoreFile } = require('./lib/store-data');
const { publicStore } = require('./lib/public-catalog');
const {
  checkAdminAuth,
  createLoginSession,
  clearSessionCookieHeader,
} = require('./lib/admin-auth');
const { DEFAULT_PLATFORM } = require('./lib/platform');
const { cleanEmail, isEmail, findPassport, upsertPassportFromPaidOrders, clientView, tokenMatches } = require('./lib/passport');

const root = __dirname;
const port = Number(process.env.PORT) || 8888;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res, code, data, extraHeaders = {}) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': reqOrigin(extraHeaders),
    ...extraHeaders,
  });
  res.end(JSON.stringify(data));
}

function reqOrigin(extraHeaders) {
  return extraHeaders['Access-Control-Allow-Origin'] || '*';
}

function asEvent(req, { body, url } = {}) {
  const headers = { ...req.headers };
  if (req.headers.cookie) headers.cookie = req.headers.cookie;
  return {
    httpMethod: req.method,
    headers,
    body: body || '',
    queryStringParameters: Object.fromEntries(url.searchParams),
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => resolve(body));
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  let urlPath = decodeURIComponent(url.pathname);

  if (urlPath === '/api/auth') {
    const body = req.method === 'POST' ? await readBody(req) : '';
    const event = asEvent(req, { body, url });
    const action = String(url.searchParams.get('action') || '').toLowerCase();
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    if (req.method === 'GET' && (action === 'me' || !action)) {
      const auth = checkAdminAuth(event);
      return sendJson(res, 200, { ok: true, authenticated: Boolean(auth.ok) });
    }
    if (req.method === 'POST' && action === 'login') {
      let payload = {};
      try { payload = JSON.parse(body || '{}'); } catch {
        return sendJson(res, 400, { error: 'Requête invalide' });
      }
      const result = createLoginSession(event, payload.password);
      if (!result.ok) return sendJson(res, result.status, { ok: false, error: result.error });
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': result.cookie });
    }
    if (req.method === 'POST' && action === 'logout') {
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookieHeader(event) });
    }
    return sendJson(res, 400, { error: 'Action invalide' });
  }

  if (urlPath === '/api/platform') {
    const event = asEvent(req, { url });
    if (req.method === 'GET') {
      const auth = checkAdminAuth(event);
      if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
      return sendJson(res, 200, DEFAULT_PLATFORM);
    }
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  if (urlPath === '/api/store') {
    if (req.method === 'GET') {
      const event = asEvent(req, { url });
      const admin = url.searchParams.get('admin') === '1' || url.searchParams.get('full') === '1';
      const store = readStoreFile(root);
      if (admin && checkAdminAuth(event).ok) return sendJson(res, 200, store);
      return sendJson(res, 200, publicStore(store));
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const event = asEvent(req, { body, url });
      const auth = checkAdminAuth(event);
      if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });
      writeStoreFile(root, JSON.parse(body));
      return sendJson(res, 200, { ok: true });
    }
  }

  if (urlPath === '/api/passport') {
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const body = req.method === 'POST' ? JSON.parse((await readBody(req)) || '{}') : {};
    const q = Object.fromEntries(url.searchParams);
    const email = cleanEmail(body.email || q.email);
    const token = String(body.token || q.token || '');
    if (!isEmail(email)) return sendJson(res, 400, { error: 'Email invalide' });
    const store = readStoreFile(root);
    let passport = findPassport(store, email);
    let created = false;
    if (!passport) {
      const result = upsertPassportFromPaidOrders(store, email);
      if (result?.passport) {
        passport = result.passport;
        created = Boolean(result.created);
        writeStoreFile(root, store);
      }
    }
    if (!passport) return sendJson(res, 404, { ok: false, exists: false });
    const full = tokenMatches(passport, token);
    return sendJson(res, 200, { ok: true, exists: true, created, full, passport: clientView(passport, { full }) });
  }

  if (urlPath === '/api/health') {
    return sendJson(res, 200, { ok: true, service: 'menes' });
  }

  if ((urlPath === '/api/pay' || urlPath === '/api/create-checkout') && req.method === 'POST') {
    return sendJson(res, 200, { error: 'Paiements en ligne actifs sur Netlify. En local: commande par email.' });
  }

  if (urlPath === '/admin' || urlPath === '/admin/') urlPath = '/console.html';
  if (urlPath === '/console' || urlPath === '/console/') urlPath = '/console.html';
  if (urlPath === '/platform' || urlPath === '/platform/') urlPath = '/console.html';
  if (urlPath === '/paiement' || urlPath === '/paiement/') urlPath = '/paiement.html';

  const filePath = path.join(root, urlPath === '/' ? 'index.html' : urlPath.slice(1));
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      const spa = !path.extname(urlPath);
      if (spa) {
        return fs.readFile(path.join(root, 'index.html'), (e2, html) => {
          if (e2) {
            res.writeHead(404);
            return res.end('Not found');
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
        });
      }
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => {
  console.log('');
  console.log('  MENES Platform');
  console.log('  Boutique: http://localhost:' + port + '/');
  console.log('  Console:  http://localhost:' + port + '/console');
  console.log('');
});
