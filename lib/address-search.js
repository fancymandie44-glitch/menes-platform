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

const STREET_TYPE = {
  av: 'Avenue', ave: 'Avenue', avenue: 'Avenue',
  boul: 'Boulevard', blvd: 'Boulevard', boulevard: 'Boulevard',
  rue: 'Rue', ch: 'Chemin', chemin: 'Chemin',
  st: 'Street', rd: 'Road', dr: 'Drive',
};

const ISO2 = {
  CAN: 'CA', USA: 'US', FRA: 'FR', BEL: 'BE', GBR: 'GB', DEU: 'DE',
  ITA: 'IT', ESP: 'ES', CHE: 'CH', MEX: 'MX', AUS: 'AU',
};

const ISO3 = { CA: 'CAN', US: 'USA', FR: 'FRA', GB: 'GBR', BE: 'BEL' };

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

function iso2(country) {
  const c = String(country || '').toUpperCase();
  if (c.length === 2) return c;
  return ISO2[c] || c.slice(0, 2);
}

function prettyCity(city, country) {
  const raw = String(city || '').trim();
  if (iso2(country) === 'CA' && fold(raw) === 'montreal') return 'Montréal';
  return raw;
}

function prettyStreet(preType, name, fallback) {
  const named = String(name || '').trim();
  const pre = STREET_TYPE[fold(preType)] || String(preType || '').trim();
  if (named && pre) return `${pre} ${named}`;
  if (named) return named;
  return String(fallback || '').trim();
}

function formatCaPostal(postal, ext) {
  const a = String(postal || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const b = String(ext || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (a.length === 6) return `${a.slice(0, 3)} ${a.slice(3)}`;
  if (a.length === 3 && b.length === 3) return `${a} ${b}`;
  if (a.length === 3 && !b) return a;
  return [postal, ext].filter(Boolean).join(' ').toUpperCase().trim();
}

function normalizePhoton(f) {
  const p = f?.properties || {};
  const street = p.street || (p.osm_key === 'highway' ? p.name : '');
  const line = [p.housenumber, street || p.name].filter(Boolean).join(' ');
  return {
    line: line || p.name || '',
    housenumber: p.housenumber || '',
    street: street || p.name || '',
    city: prettyCity(p.city || p.town || p.village || p.district || '', p.countrycode),
    province: provinceCode(p.state, (p.county && /^[A-Z]{2}$/.test(p.county) ? p.county : '')),
    postal: formatCaPostal(p.postcode),
    country: iso2(p.countrycode),
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
    city: prettyCity(a.city || a.town || a.village || a.municipality || a.suburb || '', a.country_code),
    province: provinceCode(a.state, iso),
    postal: formatCaPostal(a.postcode),
    country: iso2(a.country_code),
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

function normalizeArcGIS(c) {
  const a = c?.attributes || {};
  const loc = c?.location || {};
  const house = String(a.AddNum || '').trim();
  const street = prettyStreet(a.StPreType, a.StName, a.StAddr || a.ShortLabel);
  const line = [house, street].filter(Boolean).join(' ') || a.ShortLabel || a.Match_addr || '';
  const country = iso2(a.Country);
  const kind = a.Addr_type === 'PointAddress' || house
    ? 'house'
    : (a.Addr_type === 'StreetName' ? 'street' : (a.Addr_type || ''));
  return {
    line,
    housenumber: house,
    street,
    city: prettyCity(a.City || a.Zone || '', country),
    province: a.RegionAbbr || provinceCode(a.Region),
    postal: formatCaPostal(a.Postal, a.PostalExt),
    country,
    kind,
    lat: loc.y ?? a.Y,
    lon: loc.x ?? a.X,
    source: 'arcgis',
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

function houseRelation(queryHouse, recHouse) {
  const q = String(queryHouse || '');
  const r = String(recHouse || '');
  if (!q || !r) return 'none';
  if (q === r) return 'exact';
  if (r.startsWith(q) && q.length >= 3) return 'prefix';
  return 'mismatch';
}

function scoreCandidate(parsed, rec, countryBias) {
  if (!rec || !rec.line) return -Infinity;
  let score = 0;
  const overlap = streetOverlap(parsed.streetTokens, rec.street || rec.line);
  score += overlap * 80;
  const rel = houseRelation(parsed.house, rec.housenumber);
  if (rel === 'exact') score += 30;
  else if (rel === 'prefix') score += 22;
  else if (rel === 'mismatch') score -= 40;
  if (parsed.house && overlap < 0.5 && rec.housenumber) score -= 80;
  if (countryBias && rec.country && rec.country !== countryBias && countryBias !== 'OTHER') score -= 40;
  const compact = String(rec.postal || '').replace(/\s+/g, '');
  if (compact.length >= 6) score += 16;
  else if (compact) score += 8;
  if (rec.source === 'arcgis') score += 14;
  if (rec.kind === 'house' || rec.kind === 'housenumber' || rec.kind === 'PointAddress') score += 8;
  return score;
}

function postalRank(r) {
  const p = String(r.postal || '').replace(/\s+/g, '');
  let n = p.length;
  if (r.source === 'arcgis') n += 10;
  if (r.housenumber) n += 3;
  return n;
}

function dedupe(list) {
  const seen = new Map();
  const out = [];
  for (const r of list) {
    const key = fold(`${r.housenumber || ''}|${r.street || r.line}|${r.city}`);
    if (!key) continue;
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, r);
      out.push(r);
      continue;
    }
    if (postalRank(r) > postalRank(prev)) {
      const idx = out.indexOf(prev);
      seen.set(key, r);
      if (idx >= 0) out[idx] = r;
    }
  }
  return out;
}

function completeHousePrefix(parsed, list) {
  if (!parsed.house || parsed.house.length < 3) return list;
  const matches = list.filter((r) => houseRelation(parsed.house, r.housenumber) === 'prefix'
    && streetOverlap(parsed.streetTokens, r.street || r.line) >= 0.75);
  if (!matches.length) return list;
  const rest = list.filter((r) => !matches.includes(r));
  return [...matches, ...rest];
}

async function fetchJson(url, headers = {}, timeoutMs = 4000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', ...headers },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return res.json().catch(() => null);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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

async function searchArcGIS(q, country) {
  const params = new URLSearchParams({
    f: 'json',
    SingleLine: q,
    maxLocations: '8',
    outFields: 'AddNum,StPreType,StName,StAddr,ShortLabel,Match_addr,City,Zone,RegionAbbr,Region,Postal,PostalExt,Country,Addr_type',
    forStorage: 'false',
  });
  const cc3 = ISO3[country];
  if (cc3) params.set('countryCode', cc3);
  if (country === 'CA' || !country) params.set('location', '-73.5828,45.6324');
  const data = await fetchJson(
    `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?${params}`,
  );
  return (data?.candidates || []).map(normalizeArcGIS).filter((r) => r.line);
}

async function enrichWithArcGIS(rec, country) {
  if (!rec?.housenumber || !rec.street) return [];
  const q = `${rec.housenumber} ${rec.street} ${rec.city || ''}`.trim();
  return searchArcGIS(q, country);
}

function rankList(parsed, list, cc) {
  return dedupe(list)
    .map((rec) => ({ rec, score: scoreCandidate(parsed, rec, cc) }))
    .filter((x) => x.score > 5)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.rec);
}

async function searchAddresses(q, country = 'CA') {
  const query = String(q || '').trim();
  if (query.length < 3) return [];
  const parsed = parseQuery(query);
  const cc = String(country || 'CA').toUpperCase();
  const jobs = [];
  if (cc === 'FR') jobs.push(searchBan(query));
  else jobs.push(searchArcGIS(query, cc));
  jobs.push(searchPhoton(query, cc));
  if (cc !== 'FR') jobs.push(searchNominatim(query, cc));

  const chunks = await Promise.all(jobs.map((p) => p.catch(() => [])));
  let ranked = rankList(parsed, chunks.flat(), cc);
  ranked = completeHousePrefix(parsed, ranked);

  const needsPostal = ranked.find((r) => (
    r.housenumber
    && r.source !== 'arcgis'
    && streetOverlap(parsed.streetTokens, r.street || r.line) >= 0.75
    && (houseRelation(parsed.house, r.housenumber) === 'exact'
      || houseRelation(parsed.house, r.housenumber) === 'prefix')
  ));
  if (needsPostal && cc !== 'FR') {
    const extra = await enrichWithArcGIS(needsPostal, cc).catch(() => []);
    ranked = completeHousePrefix(parsed, rankList(parsed, extra.concat(ranked), cc));
  }

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
  normalizeArcGIS,
  formatCaPostal,
  houseRelation,
  searchAddresses,
};
