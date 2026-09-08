const http = require('http');
const fs = require('fs');
const path = require('path');
const { readStoreFile, writeStoreFile } = require('./lib/store-data');
const { publicStore } = require('./lib/public-catalog');
const { passwordsMatch } = require('./lib/admin-auth');
const { cleanEmail, isEmail, findPassport, upsertPassportFromPaidOrders, clientView, tokenMatches } = require('./lib/passport');

const root = __dirname;
const port = 8888;
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '').trim();

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
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

  if (urlPath === '/api/store') {
    if (req.method === 'GET') return sendJson(res, 200, publicStore(readStoreFile(root)));
    if (req.method === 'POST') {
      if (!ADMIN_PASSWORD) return sendJson(res, 503, { error: 'ADMIN_PASSWORD non configuré sur le serveur' });
      const body = await readBody(req);
      if (!passwordsMatch(req.headers['x-admin-password'] || '', ADMIN_PASSWORD)) return sendJson(res, 401, { error: 'Mot de passe incorrect' });
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

  const filePath = path.join(root, urlPath === '/' ? 'index.html' : urlPath.slice(1));
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
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
