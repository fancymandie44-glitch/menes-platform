'use strict';

const https = require('https');
const { URL } = require('url');

const BOUTIQUE_ORIGIN = 'https://www.mymenes.com';
const DROP_REQ = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'forwarded',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-for',
  'x-nf-client-connection-ip',
  'x-nf-request-id',
]);
const DROP_RES = new Set([
  'connection',
  'transfer-encoding',
  'content-encoding',
  'content-length',
  'keep-alive',
]);

function headerMap(event) {
  const out = {};
  const src = event.headers || {};
  for (const [key, value] of Object.entries(src)) {
    if (value == null) continue;
    const lower = key.toLowerCase();
    if (DROP_REQ.has(lower)) continue;
    out[lower] = Array.isArray(value) ? String(value[0]) : String(value);
  }
  return out;
}

function boutiquePath(event) {
  let path = String(event.path || '/');
  const fnPrefix = '/.netlify/functions/store-proxy';
  if (path.startsWith(fnPrefix)) path = path.slice(fnPrefix.length) || '/';
  if (path.startsWith('/store-api')) path = path.slice('/store-api'.length) || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  return path;
}

function queryString(event) {
  if (event.rawQuery) return String(event.rawQuery);
  const params = event.multiValueQueryStringParameters || event.queryStringParameters;
  if (!params) return '';
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((v) => usp.append(key, v));
    else if (value != null) usp.append(key, String(value));
  }
  return usp.toString();
}

function requestBody(event) {
  if (event.body == null || event.body === '') return undefined;
  if (event.isBase64Encoded) return Buffer.from(event.body, 'base64');
  return Buffer.from(String(event.body), 'utf8');
}

function proxy(url, { method, headers, body }) {
  const u = new URL(url);
  const reqHeaders = { ...headers, host: u.host };
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method,
        headers: reqHeaders,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 502,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('proxy timeout')));
    if (body && body.length) req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  if ((event.httpMethod || 'GET') === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': event.headers?.origin || 'https://menesadmin.netlify.app' } };
  }
  const path = boutiquePath(event);
  if (!path.startsWith('/api/')) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Not found' }),
    };
  }
  const qs = queryString(event);
  const url = `${BOUTIQUE_ORIGIN}${path}${qs ? `?${qs}` : ''}`;
  try {
    const upstream = await proxy(url, {
      method: event.httpMethod || 'GET',
      headers: headerMap(event),
      body: requestBody(event),
    });
    const headers = {};
    const multiValueHeaders = {};
    for (const [key, value] of Object.entries(upstream.headers || {})) {
      const lower = key.toLowerCase();
      if (DROP_RES.has(lower)) continue;
      if (lower === 'set-cookie') {
        const cookies = (Array.isArray(value) ? value : [value]).map((raw) => {
          const parts = String(raw)
            .split(';')
            .map((p) => p.trim())
            .filter(Boolean)
            .filter((p) => !/^domain=/i.test(p));
          if (!parts.some((p) => /^path=/i.test(p))) parts.splice(1, 0, 'Path=/');
          return parts.join('; ');
        });
        headers['Set-Cookie'] = cookies[0];
        multiValueHeaders['Set-Cookie'] = cookies;
        continue;
      }
      headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
    }
    const contentType = String(headers['content-type'] || headers['Content-Type'] || '');
    const binary = contentType && !/json|text|xml|javascript|svg/i.test(contentType);
    return {
      statusCode: upstream.statusCode,
      headers,
      multiValueHeaders: Object.keys(multiValueHeaders).length ? multiValueHeaders : undefined,
      body: binary ? upstream.body.toString('base64') : upstream.body.toString('utf8'),
      isBase64Encoded: binary,
    };
  } catch {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Proxy boutique indisponible' }),
    };
  }
};
