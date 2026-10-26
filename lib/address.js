'use strict';

const CA_POSTAL_RE = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/;
const CA_POSTAL_FIND = /\b([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\s?\d[ABCEGHJ-NPRSTV-Z]\d)\b/;
const STREET_TYPE = {
  Av: 'Avenue', Ave: 'Avenue', AV: 'Avenue',
  Bd: 'Boulevard', Boul: 'Boulevard', Blvd: 'Boulevard',
  Ch: 'Chemin', Rue: 'Rue', Rt: 'Route', Pl: 'Place',
};
const STATE_TO_CODE = {
  quebec: 'QC', québec: 'QC', ontario: 'ON', 'british columbia': 'BC', 'colombie-britannique': 'BC',
  alberta: 'AB', manitoba: 'MB', saskatchewan: 'SK', 'new brunswick': 'NB', 'nouveau-brunswick': 'NB',
  'nova scotia': 'NS', 'nouvelle-écosse': 'NS', 'prince edward island': 'PE', 'newfoundland and labrador': 'NL',
  'northwest territories': 'NT', yukon: 'YT', nunavut: 'NU',
};

function formatCaPostal(raw) {
  const compact = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (CA_POSTAL_RE.test(compact)) return `${compact.slice(0, 3)} ${compact.slice(3)}`;
  const trimmed = String(raw || '').trim().toUpperCase();
  return trimmed;
}

function extractCaPostal(...texts) {
  for (const text of texts) {
    const m = String(text || '').toUpperCase().match(CA_POSTAL_FIND);
    if (m) return formatCaPostal(m[1]);
  }
  return '';
}

function formatPostal(raw, country) {
  const cc = String(country || '').toUpperCase();
  if (cc === 'CA' || cc === 'CAN') return formatCaPostal(raw);
  if (cc === 'US' || cc === 'USA') {
    const digits = String(raw || '').replace(/\D/g, '');
    if (digits.length === 9) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    if (digits.length === 5) return digits;
  }
  if (cc === 'FR' || cc === 'FRA' || cc === 'BE' || cc === 'BEL') {
    const digits = String(raw || '').replace(/\D/g, '');
    if (digits.length === 5 || digits.length === 4) return digits;
  }
  return String(raw || '').trim();
}

function countryFromCode(code) {
  const c = String(code || '').toUpperCase();
  if (c === 'CAN' || c === 'CA' || c === 'CANADA') return 'CA';
  if (c === 'USA' || c === 'US' || c === 'UNITED STATES') return 'US';
  if (c === 'FRA' || c === 'FR' || c === 'FRANCE') return 'FR';
  if (c === 'BEL' || c === 'BE' || c === 'BELGIUM' || c === 'BELGIQUE') return 'BE';
  if (c === 'CHE' || c === 'CH' || c === 'SWITZERLAND' || c === 'SUISSE') return 'CH';
  if (!c) return '';
  if (c.length === 2) return c;
  if (c.length === 3) return c.slice(0, 2);
  return 'OTHER';
}

function provinceCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^[A-Z]{2}$/i.test(raw)) return raw.toUpperCase();
  return STATE_TO_CODE[raw.toLowerCase()] || '';
}

function suggestion({ line, city, province, postal, country, label }) {
  const street = String(line || '').trim();
  const cc = countryFromCode(country);
  const post = formatPostal(postal, cc);
  const prov = provinceCode(province);
  const cityName = String(city || '').trim();
  const sub = [cityName, prov, post, cc].filter(Boolean).join(', ');
  return {
    line: street,
    city: cityName,
    province: prov,
    postal: post,
    country: cc || 'CA',
    label: label || [street, sub].filter(Boolean).join(' — '),
  };
}

function mapArcGisCandidate(candidate) {
  const a = candidate?.attributes || {};
  const stType = STREET_TYPE[a.StPreType] || a.StPreType || STREET_TYPE[a.StType] || a.StType || '';
  const streetName = a.StName || a.StreetName || '';
  const composed = [a.AddNum || a.AddressNumber, stType, streetName].filter(Boolean).join(' ').trim();
  const line = composed
    || a.StAddr
    || String(a.Address || a.Match_addr || candidate.address || '').split(',')[0].trim();
  const postalBits = `${a.Postal || ''}${a.PostalExt || ''}`;
  const postal = extractCaPostal(postalBits, a.Postal, candidate.address, a.LongLabel, a.Match_addr, a.Place_addr)
    || formatPostal(postalBits, 'CA');
  return suggestion({
    line,
    city: a.City || a.Subregion || a.Nbrhd || '',
    province: a.RegionAbbr || a.Region || a.Subregion,
    postal,
    country: a.CountryCode || a.Country || '',
    label: candidate.address || a.LongLabel || a.Match_addr,
  });
}

function mapBanFeature(feature) {
  const p = feature?.properties || {};
  return suggestion({
    line: p.name || [p.housenumber, p.street].filter(Boolean).join(' '),
    city: p.city || p.municipality || '',
    province: '',
    postal: p.postcode || '',
    country: 'FR',
    label: p.label,
  });
}

function mapNominatim(hit) {
  const a = hit?.address || {};
  const line = [a.house_number, a.road || a.pedestrian || a.residential || a.suburb]
    .filter(Boolean)
    .join(' ')
    .trim() || String(hit.display_name || '').split(',')[0];
  return suggestion({
    line,
    city: a.city || a.town || a.village || a.municipality || a.hamlet || '',
    province: a.state_code || a.state,
    postal: a.postcode || '',
    country: a.country_code || a.country,
    label: hit.display_name,
  });
}

function uniqueSuggestions(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!item?.line) continue;
    const key = `${item.line}|${item.city}|${item.postal}|${item.country}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.slice(0, 6);
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', ...headers },
  });
  if (!res.ok) throw new Error(`address lookup ${res.status}`);
  return res.json();
}

async function searchArcGis(q, country) {
  const params = new URLSearchParams({
    f: 'json',
    SingleLine: q,
    maxLocations: '6',
    outFields: '*',
    maxSuggestions: '6',
  });
  const cc = String(country || '').toUpperCase();
  if (cc && cc !== 'OTHER') params.set('countryCode', cc === 'CA' ? 'CAN' : cc);
  const data = await fetchJson(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?${params}`);
  return (data.candidates || [])
    .filter((c) => (c.score || 0) >= 75)
    .map(mapArcGisCandidate)
    .filter((s) => s.line);
}

async function searchBan(q) {
  const params = new URLSearchParams({ q, limit: '6' });
  const data = await fetchJson(`https://api-adresse.data.gouv.fr/search/?${params}`);
  return (data.features || []).map(mapBanFeature).filter((s) => s.line);
}

async function searchNominatim(q, country) {
  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '5',
  });
  const cc = String(country || '').toLowerCase();
  if (cc && cc !== 'other') params.set('countrycodes', cc);
  const data = await fetchJson(`https://nominatim.openstreetmap.org/search?${params}`, {
    'User-Agent': 'MENES-boutique/1.0 (contact@mymenes.com)',
  });
  return (Array.isArray(data) ? data : []).map(mapNominatim).filter((s) => s.line);
}

async function searchAddress(q, country) {
  const query = String(q || '').trim();
  if (query.length < 3) return [];
  const cc = String(country || 'CA').toUpperCase();
  const buckets = [];
  try {
    buckets.push(await searchArcGis(query, cc));
  } catch (e) {
    console.error('address arcgis', e.message);
  }
  if (cc === 'FR') {
    try {
      buckets.push(await searchBan(query));
    } catch (e) {
      console.error('address ban', e.message);
    }
  }
  const first = uniqueSuggestions(buckets.flat());
  if (first.some((s) => s.postal)) return first;
  try {
    buckets.push(await searchNominatim(query, cc));
  } catch (e) {
    console.error('address nominatim', e.message);
  }
  return uniqueSuggestions(buckets.flat());
}

module.exports = {
  formatCaPostal,
  formatPostal,
  countryFromCode,
  provinceCode,
  suggestion,
  extractCaPostal,
  mapArcGisCandidate,
  mapBanFeature,
  mapNominatim,
  uniqueSuggestions,
  searchAddress,
};
