'use strict';

const { setLambdaEvent, getBlobStore, resolveSiteId } = require('../lib/platform');
const { corsHeaders } = require('../lib/cors');

const ID_RE = /^[a-zA-Z0-9_-]{8,80}$/;

function mediaKeys(siteId, id) {
  const sid = String(siteId || 'menes');
  return [
    `media:${sid}:${id}`,
    `media:${id}`,
    `media:menes:${id}`,
    `file:${sid}:${id}`,
    `asset:${id}`,
    id,
  ];
}

function sniffType(bytes) {
  if (!bytes || bytes.length < 12) return '';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'image/webp';
  return '';
}

function fromDataUrl(text) {
  const m = String(text || '').match(/^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) return null;
  return { contentType: m[1], body: m[2].replace(/\s+/g, '') };
}

async function readEntry(store, key) {
  const buf = await store.get(key, { type: 'arrayBuffer' });
  if (!buf || (buf.byteLength !== undefined && buf.byteLength === 0)) return null;
  const bytes = Buffer.from(buf);
  const head = bytes.subarray(0, 32).toString('utf8');
  if (head.startsWith('data:')) {
    const parsed = fromDataUrl(bytes.toString('utf8'));
    if (parsed) return parsed;
  }
  if (head.startsWith('{')) {
    try {
      const json = JSON.parse(bytes.toString('utf8'));
      if (json.dataUrl) {
        const parsed = fromDataUrl(json.dataUrl);
        if (parsed) return parsed;
      }
      if (json.base64 || json.data) {
        return {
          contentType: json.contentType || json.type || 'image/jpeg',
          body: String(json.base64 || json.data).replace(/^data:[^;]+;base64,/, ''),
        };
      }
    } catch {}
  }
  let metaType = '';
  try {
    const meta = await store.getMetadata(key);
    metaType = meta?.metadata?.contentType || meta?.metadata?.type || '';
  } catch {}
  return {
    contentType: metaType || sniffType(bytes) || 'image/jpeg',
    body: bytes.toString('base64'),
  };
}

async function findMedia(store, siteId, id) {
  for (const key of mediaKeys(siteId, id)) {
    try {
      const entry = await readEntry(store, key);
      if (entry) return entry;
    } catch {}
  }
  try {
    const listed = await store.list({ prefix: 'media:' });
    const hit = (listed.blobs || []).find((b) => {
      const k = String(b.key || '');
      return k === id || k.endsWith(`:${id}`);
    });
    if (hit) return readEntry(store, hit.key);
  } catch {}
  return null;
}

exports.handler = async (event) => {
  setLambdaEvent(event);
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  const params = event.queryStringParameters || {};
  const id = String(params.id || '').trim();
  if (!ID_RE.test(id)) {
    return { statusCode: 400, headers, body: 'invalid id' };
  }

  const host = event.headers['x-forwarded-host'] || event.headers.host || '';
  const siteId = await resolveSiteId(host, params.site);

  try {
    const store = await getBlobStore();
    const entry = await findMedia(store, siteId, id);
    if (!entry) {
      return { statusCode: 404, headers, body: 'not found' };
    }
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': entry.contentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
      body: entry.body,
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('api/media', err);
    return { statusCode: 500, headers, body: 'media error' };
  }
};

exports.mediaKeys = mediaKeys;
