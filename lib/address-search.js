'use strict';

function fold(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(str) {
  return fold(str).split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t));
}

const STOP = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'st', 'ste', 'saint', 'sainte',
  'avenue', 'ave', 'av', 'rue', 'boulevard', 'boul', 'blvd', 'chemin', 'ch',
  'street', 'road', 'rd', 'drive', 'dr', 'way', 'place', 'pl', 'lane', 'ln',
  'montreal', 'laval', 'longueuil', 'paris', 'lyon', 'quebec', 'toronto',
  'ottawa', 'vancouver', 'californie', 'canada', 'france', 'belgique',
]);

const STREET_WORDS = new Set([
  'avenue', 'ave', 'av', 'rue', 'boulevard', 'boul', 'blvd', 'chemin', 'ch',
  'street', 'road', 'rd', 'drive', 'dr', 'way', 'place', 'pl', 'lane', 'ln',
  'crescent', 'court', 'terrace', 'rang', 'route',
]);

function parseQuery(q) {
  const raw = String(q || '').trim();
  const house = (raw.match(/\b(\d+[a-zA-Z]?)\b/) || [])[1] || '';
  const rest = fold(raw.replace(house, ' '));
  const parts = rest.split(/\s+/).filter(Boolean);
  const street = parts.filter((t) => !STREET_WORDS.has(t) && !STOP.has(t) && t !== house.toLowerCase());
  return { raw, house, streetTokens: street };
}

const PROVINCE = {
  quebec: 'QC', québec: 'QC', ontario: 'ON', 'british columbia': 'BC', 'colombie-britannique': 'BC',
  alberta: 'AB', manitoba: 'MB', saskatchewan: 'SK', 'new brunswick': 'NB', 'nouveau-brunswick': 'NB',
  'nova scotia': 'NS', 'nouvelle-ecosse': 'NS', 'prince edward island': 'PE',
  'newfoundland and labrador': 'NL', 'northwest territories': 'NT', yukon: 'YT', nunavut: 'NU',
};

function provinceCode(state, iso) {
  if (iso && /^[A-Z]{2}$/.test(iso)) return iso;
  const key = fold(state);
  return PROVINCE[key] || (String(state || '').length <= 3 ? String(state || '').toUpperCase() : '');
}

function normalizePhoton(f) {
  const p = f?.properties || {};
  const street = p.street || (p.osm_key === 'highway' ? p.name : '');
  const line = [p.housenumber, street || p.name].filter(Boolean).join(' ');
  return {
    line: line || p.name || '',
    housenumber: p.housenumber || '',
    street: street || p.name || '',
    city: p.city || p.town || p.village || p.district || '',
    province: provinceCode(p.state, (p.county && /^[A-Z]{2}$/.test(p.county) ? p.county : '')),
    postal: String(p.postcode || '').toUpperCase(),
    country: String(p.countrycode || '').toUpperCase(),
    kind: p.type || p.osm_value || '',
    lat: f.geometry?.coordinates?.[1],
    lon: f.geometry?.coordinates?.[0],
    source: 'photon',
  };
}

function normalizeNominatim(x) {
  const a = x?.address || {};
  const house = a.house_number || '';
  const street = a.road || a.pedestrian || a.residential || x.name || '';
  const iso = String(a['ISO3166-2-lvl4'] || '').split('-')[1] || '';
  return {
    line: [house, street].filter(Boolean).join(' ') || x.display_name || '',
    housenumber: house,
    street,
    city: a.city || a.town || a.village || a.municipality || a.suburb || '',
    province: provinceCode(a.state, iso),
    postal: String(a.postcode || '').toUpperCase(),
    country: String(a.country_code || '').toUpperCase(),
    kind: x.addresstype || x.type || '',
    lat: Number(x.lat),
    lon: Number(x.lon),
    source: 'nominatim',
  };
}

function normalizeBan(f) {
  const p = f?.properties || {};
  return {
    line: p.name || p.label || '',
    housenumber: p.housenumber || '',
    street: p.street || p.name || '',
    city: p.city || '',
    province: '',
    postal: String(p.postcode || ''),
    country: 'FR',
    kind: p.type || '',
    lat: f.geometry?.coordinates?.[1],
    lon: f.geometry?.coordinates?.[0],
    source: 'ban',
  };
}

function streetOverlap(queryTokens, candidateStreet) {
  const cand = tokens(candidateStreet);
  if (!queryTokens.length || !cand.length) return 0;
  let hit = 0;
  for (const t of queryTokens) {
    if (cand.some((c) => c === t || c.startsWith(t) || t.startsWith(c))) hit += 1;
  }
  return hit / queryTokens.length;
}

function scoreCandidate(parsed, rec, countryBias) {
  if (!rec || !rec.line) return -Infinity;
  let score = 0;
  const overlap = streetOverlap(parsed.streetTokens, rec.street || rec.line);
  score += overlap * 80;
  if (parsed.house && String(rec.housenumber) === String(parsed.house)) score += 30;
  if (parsed.house && rec.housenumber && String(rec.housenumber) !== String(parsed.house)) score -= 40;
  if (parsed.house && overlap < 0.5 && rec.housenumber) score -= 80;
  if (countryBias && rec.country && rec.country !== countryBias && countryBias !== 'OTHER') score -= 40;
  if (rec.postal) score += 12;
  if (rec.kind === 'house' || rec.kind === 'housenumber') score += 8;
  if (overlap >= 0.75 && parsed.house && !rec.housenumber) {
    rec.housenumber = parsed.house;
    rec.line = `${parsed.house} ${rec.street || rec.line}`.trim();
    score += 25;
  }
  return score;
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const r of list) {
    const key = fold(`${r.line}|${r.city}|${r.postal}`);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', ...headers },
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

async function searchPhoton(q, country) {
  const bias = country === 'CA' || !country
    ? '&lat=45.6324&lon=-73.5828'
    : country === 'FR' ? '&lat=48.8566&lon=2.3522' : '';
  const lang = country === 'US' || country === 'GB' ? 'en' : 'fr';
  const data = await fetchJson(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=10&lang=${lang}${bias}`);
  return (data?.features || []).map(normalizePhoton);
}

async function searchNominatim(q, country) {
  const cc = country && country !== 'OTHER' ? `&countrycodes=${encodeURIComponent(country.toLowerCase())}` : '';
  const data = await fetchJson(
    `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=8&q=${encodeURIComponent(q)}${cc}`,
    { 'User-Agent': 'MENES-boutique/1.0 (https://www.mymenes.com; mymenes2022@gmail.com)' },
  );
  return Array.isArray(data) ? data.map(normalizeNominatim) : [];
}

async function searchBan(q) {
  const data = await fetchJson(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=8`);
  return (data?.features || []).map(normalizeBan);
}

async function searchAddresses(q, country = 'CA') {
  const query = String(q || '').trim();
  if (query.length < 3) return [];
  const parsed = parseQuery(query);
  const cc = String(country || 'CA').toUpperCase();
  const jobs = [];
  if (cc === 'FR') jobs.push(searchBan(query));
  jobs.push(searchPhoton(query, cc));
  if (cc !== 'FR') jobs.push(searchNominatim(query, cc));

  const chunks = await Promise.all(jobs.map((p) => p.catch(() => [])));
  const merged = dedupe(chunks.flat());
  const ranked = merged
    .map((rec) => ({ rec, score: scoreCandidate(parsed, rec, cc) }))
    .filter((x) => x.score > 5)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.rec);

  const realHouse = ranked.filter((r) => r.housenumber && r.kind !== 'street' && r.kind !== 'residential');
  const cleaned = ranked.filter((r) => {
    if (r.kind !== 'street' && r.kind !== 'residential') return true;
    const street = fold(r.street);
    return !realHouse.some((h) => fold(h.street) === street && h.postal && h.postal !== r.postal);
  });

  return dedupe(cleaned).slice(0, 6);
}

module.exports = {
  fold,
  parseQuery,
  scoreCandidate,
  normalizePhoton,
  normalizeBan,
  searchAddresses,
};
