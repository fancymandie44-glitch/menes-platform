const { corsHeaders } = require('../lib/cors');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const IG_APP_ID = '936619743392459';

function parseInstagramUrl(raw) {
  let input = String(raw || '').trim();
  if (!input) return null;
  if (!/^https?:\/\//i.test(input)) input = `https://${input}`;
  let u;
  try { u = new URL(input); } catch { return null; }
  const host = u.hostname.replace(/^www\./i, '').toLowerCase();
  if (host !== 'instagram.com' && host !== 'instagr.am') return null;

  const parts = u.pathname.split('/').filter(Boolean);
  let username = null;
  let kind = null;
  let shortcode = null;

  if (parts[0] === 'p' || parts[0] === 'reel' || parts[0] === 'tv') {
    kind = parts[0];
    shortcode = parts[1] || null;
  } else if (parts[1] === 'p' || parts[1] === 'reel' || parts[1] === 'tv') {
    username = parts[0];
    kind = parts[1];
    shortcode = parts[2] || null;
  }

  if (!shortcode || !/^[A-Za-z0-9_-]+$/.test(shortcode)) return null;
  if (username && !/^[A-Za-z0-9._]+$/.test(username)) username = null;

  const imgIndexRaw = u.searchParams.get('img_index') || u.searchParams.get('imgIndex');
  const imgIndex = imgIndexRaw ? Math.max(1, parseInt(imgIndexRaw, 10) || 1) : null;

  return {
    username,
    kind,
    shortcode,
    imgIndex,
    postUrl: `https://www.instagram.com/${kind}/${shortcode}/`,
    handle: username ? `@${username}` : '',
  };
}

function extractHandleFromText(...texts) {
  for (const t of texts) {
    if (!t) continue;
    const m = String(t).match(/@([A-Za-z0-9._]{2,30})/);
    if (m) return `@${m[1]}`;
    const by = String(t).match(/\(@([A-Za-z0-9._]{2,30})\)/);
    if (by) return `@${by[1]}`;
  }
  return '';
}

function extractCaption(desc = '') {
  const m = String(desc).match(/:\s*"([^"]+)"/);
  if (m) return m[1].trim();
  return '';
}

function uniqUrls(list) {
  const seen = new Set();
  const out = [];
  for (const u of list) {
    const clean = String(u || '')
      .replace(/\\u0026/g, '&')
      .replace(/\\\//g, '/')
      .replace(/&amp;/g, '&')
      .trim();
    if (!clean || !/^https?:\/\//i.test(clean)) continue;
    if (/\/s150x150\//i.test(clean) || /\/s50x50\//i.test(clean) || /\/s320x320\//i.test(clean)) continue;
    if (/profile_pic|avatar|favicon|rsrc\.php/i.test(clean)) continue;
    const key = clean.split('?')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

async function downloadAsDataUrl(imageUrl) {
  if (!imageUrl) return '';
  if (imageUrl.startsWith('data:image/')) return imageUrl;
  const res = await fetch(imageUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent': UA,
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: 'https://www.instagram.com/',
    },
  });
  if (!res.ok) return '';
  const type = (res.headers.get('content-type') || 'image/jpeg').toLowerCase();
  if (!type.startsWith('image/')) return '';
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > 3_500_000) return '';
  return `data:${type.split(';')[0]};base64,${buf.toString('base64')}`;
}

async function tryMicrolink(postUrl) {
  const key = process.env.MICROLINK_API_KEY || '';
  const endpoint = new URL('https://api.microlink.io/');
  endpoint.searchParams.set('url', postUrl);
  endpoint.searchParams.set('palette', 'false');
  endpoint.searchParams.set('audio', 'false');
  endpoint.searchParams.set('video', 'false');
  endpoint.searchParams.set('iframe', 'false');
  const headers = { 'User-Agent': UA, Accept: 'application/json' };
  if (key) headers['x-api-key'] = key;

  const res = await fetch(endpoint.toString(), { headers });
  if (!res.ok) throw new Error(`Microlink HTTP ${res.status}`);
  const json = await res.json();
  if (json.status !== 'success' || !json.data) throw new Error('Microlink sans données');

  const data = json.data;
  return {
    imageUrl: data.image?.url || data.logo?.url || '',
    handle: extractHandleFromText(data.title, data.description, data.author),
    caption: extractCaption(data.description || '') || '',
  };
}

async function tryOEmbed(postUrl) {
  const token = process.env.META_OEMBED_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN || '';
  if (!token) return null;
  const endpoint = `https://graph.facebook.com/v19.0/instagram_oembed?url=${encodeURIComponent(postUrl)}&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(endpoint, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const data = await res.json();
  return {
    imageUrl: data.thumbnail_url || '',
    handle: data.author_name ? `@${String(data.author_name).replace(/^@/, '')}` : '',
    caption: data.title || '',
  };
}

/** Instagram web GraphQL — best source for carousel children */
async function tryInstagramGraphql(shortcode) {
  const variables = JSON.stringify({
    shortcode,
    fetch_tagged_user_count: null,
    hoisted_comment_id: null,
    hoisted_reply_id: null,
  });
  const body = new URLSearchParams({
    variables,
    doc_id: '10015901848480474',
    lsd: 'AVqbxe3J_YA',
  });
  const res = await fetch('https://www.instagram.com/graphql/query', {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-IG-App-ID': IG_APP_ID,
      'X-FB-LSD': 'AVqbxe3J_YA',
      'X-ASBD-ID': '129477',
      'Sec-Fetch-Site': 'same-origin',
      Referer: 'https://www.instagram.com/',
    },
    body: body.toString(),
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const media = json?.data?.xdt_shortcode_media;
  if (!media) return null;

  const urls = [];
  const edges = media.edge_sidecar_to_children?.edges;
  if (Array.isArray(edges) && edges.length) {
    for (const edge of edges) {
      const node = edge?.node;
      if (!node) continue;
      const url = node.display_url
        || node.display_resources?.[node.display_resources.length - 1]?.src
        || '';
      if (url) urls.push(url);
    }
  } else if (media.display_url) {
    urls.push(media.display_url);
  }

  const owner = media.owner?.username ? `@${media.owner.username}` : '';
  const caption = media.edge_media_to_caption?.edges?.[0]?.node?.text || '';
  return {
    urls: uniqUrls(urls),
    handle: owner,
    caption,
    isCarousel: Boolean(edges?.length > 1),
  };
}

/**
 * Microlink respects Instagram ?img_index=N for OG image on many carousels.
 * Fetch a specific 1-based slide this way.
 */
async function fetchSlideByImgIndex(parsed, imgIndex1Based) {
  const n = Math.max(1, Math.min(20, Number(imgIndex1Based) || 1));
  const withIndex = `${parsed.postUrl}?img_index=${n}`;
  try {
    const ml = await tryMicrolink(withIndex);
    if (ml.imageUrl) return { ...ml, imgIndex: n, source: 'microlink-img-index' };
  } catch (_) { /* continue */ }
  try {
    const oe = await tryOEmbed(withIndex);
    if (oe?.imageUrl) return { ...oe, imgIndex: n, source: 'oembed-img-index' };
  } catch (_) { /* continue */ }
  return null;
}

exports.handler = async (event) => {
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const authCheck = require('../lib/admin-auth').checkAdminAuth(event);
  if (!authCheck.ok) {
    return { statusCode: authCheck.status, headers, body: JSON.stringify({ error: authCheck.error }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const parsed = parseInstagramUrl(body.url);
    if (!parsed) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Lien Instagram invalide. Exemple : https://www.instagram.com/p/XXXX/' }),
      };
    }

    let handle = parsed.handle;
    let caption = '';
    let image = '';
    let source = '';
    let slideUrls = [];
    let isCarousel = false;

    // 1-based slide number from client or URL
    const slideNum1 = Number.isFinite(Number(body.slideIndex))
      ? Math.max(1, Number(body.slideIndex) + 1)
      : (Number.isFinite(Number(body.imgIndex))
        ? Math.max(1, Number(body.imgIndex))
        : (parsed.imgIndex || 1));

    // A) GraphQL carousel children (when Instagram allows it)
    try {
      const gq = await tryInstagramGraphql(parsed.shortcode);
      if (gq?.urls?.length) {
        slideUrls = gq.urls;
        handle = handle || gq.handle;
        caption = caption || gq.caption;
        isCarousel = gq.isCarousel || gq.urls.length > 1;
        source = 'graphql';
      }
    } catch (err) {
      console.warn('ig graphql failed', err.message);
    }

    // B) If client asked for a specific slide and we don't have that CDN URL yet,
    //    fetch via ?img_index=N (works even when only OG is available)
    const needIndexedFetch = !slideUrls.length
      || slideNum1 > slideUrls.length
      || body.forceImgIndex
      || (!isCarousel && (body.slideIndex != null || body.imgIndex != null || parsed.imgIndex));

    if (needIndexedFetch || body.slideIndex != null || body.imgIndex != null || parsed.imgIndex) {
      const indexed = await fetchSlideByImgIndex(parsed, slideNum1);
      if (indexed?.imageUrl) {
        handle = handle || indexed.handle;
        caption = caption || indexed.caption;
        // Put selected slide URL in list at correct index slot for picker
        if (!slideUrls.length) {
          // Build a virtual list so UI can show numbers; only selected has a preview URL
          slideUrls = Array.from({ length: Math.max(slideNum1, 8) }, () => '');
        }
        while (slideUrls.length < slideNum1) slideUrls.push('');
        slideUrls[slideNum1 - 1] = indexed.imageUrl;
        source = indexed.source || source || 'img-index';
      }
    }

    // C) Fallback microlink / oembed for first slide
    if (!slideUrls.some(Boolean)) {
      try {
        const ml = await tryMicrolink(parsed.postUrl);
        handle = handle || ml.handle;
        caption = caption || ml.caption;
        if (ml.imageUrl) {
          slideUrls = [ml.imageUrl];
          source = source || 'microlink';
        }
      } catch (err) {
        console.warn('microlink failed', err.message);
      }
    }
    if (!slideUrls.some(Boolean) || !handle) {
      try {
        const oe = await tryOEmbed(parsed.postUrl);
        if (oe) {
          handle = handle || oe.handle;
          caption = caption || oe.caption;
          if (oe.imageUrl && !slideUrls.some(Boolean)) {
            slideUrls = [oe.imageUrl];
            source = source || 'oembed';
          }
        }
      } catch (_) { /* continue */ }
    }

    // Resolve pick
    let pick0 = Math.max(0, slideNum1 - 1);
    if (body.slideUrl) {
      const idx = slideUrls.indexOf(body.slideUrl);
      if (idx >= 0) pick0 = idx;
    }
    const pickUrl = slideUrls[pick0] || slideUrls.find(Boolean) || '';
    if (pickUrl) {
      image = await downloadAsDataUrl(pickUrl);
    }

    // For UI: if we only have one real URL but post is likely a carousel, expose numbered slots
    const knownCount = slideUrls.filter(Boolean).length;
    const slots = isCarousel && knownCount > 1
      ? slideUrls
      : (knownCount > 1 ? slideUrls : Array.from({ length: 10 }, (_, i) => slideUrls[i] || ''));

    const slides = slots.map((url, index) => ({
      index,
      url: url || '',
      selected: index === pick0,
      hasPreview: Boolean(url),
    }));

    if (!handle && !image) {
      return {
        statusCode: 422,
        headers,
        body: JSON.stringify({
          error: 'Impossible de lire ce post. Réessaie, ou ajoute la photo à la main.',
          postUrl: parsed.postUrl,
          handle: '',
          image: '',
          caption: '',
          slides: [],
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        postUrl: parsed.postUrl,
        handle: handle || '',
        caption: caption || '',
        image: image || '',
        shortcode: parsed.shortcode,
        partial: !image,
        source,
        slides,
        slideIndex: pick0,
        imgIndex: pick0 + 1,
        isCarousel: isCarousel || knownCount > 1,
        // Always allow picking slide # via img_index even if only 1 preview loaded
        needsSlidePick: true,
        slidePickerMode: isCarousel && knownCount > 1 ? 'previews' : 'numbers',
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Erreur Instagram' }) };
  }
};
