'use strict';

/** Ship-from: Canada Post / UPS neighbourhood in RDP, Montréal. */
const ORIGIN = {
  line: '7701 Boulevard Maurice-Duplessis',
  city: 'Montréal',
  province: 'QC',
  postal: 'H1E 1M0',
  country: 'CA',
  lat: 45.6324,
  lon: -73.5828,
  label: 'Poste Canada · 7701 boul. Maurice-Duplessis, Montréal QC H1E 1M0',
};

function fsa(postal) {
  return String(postal || '').toUpperCase().replace(/\s+/g, '').slice(0, 3);
}

function itemWeightKg(item) {
  const name = String(item?.name || item?.id || '').toLowerCase();
  const qty = Math.max(1, Number(item?.qty) || 1);
  let unit = 0.45;
  if (/grillz|jewelry|bijou/.test(name)) unit = 0.25;
  if (/hoodie|hooded|crewneck|veste|jacket/.test(name)) unit = 0.7;
  if (/tee|t-shirt|tshirt|chaussette|sock/.test(name)) unit = 0.25;
  return unit * qty;
}

function parcelWeightKg(items) {
  const list = Array.isArray(items) ? items : [];
  const w = list.reduce((s, i) => s + itemWeightKg(i), 0);
  return Math.max(0.4, Math.round((w || 0.5) * 100) / 100);
}

function isMontrealMetro(province, postal, city) {
  const fs = fsa(postal);
  if (/^H[1-4H9]/.test(fs) || /^J[34]/.test(fs) || fs === 'H8B' || fs === 'H8N') return true;
  const c = String(city || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (c && /montreal|laval|longueuil|brossard|boucherville|terrebonne|repentigny|anjou|riviere-des-prairies|rdp/.test(c)) {
    return String(province || '').toUpperCase() === 'QC' || !province;
  }
  return false;
}

function extraWeightSurcharge(kg) {
  if (kg <= 0.7) return 0;
  return Math.round((kg - 0.7) * 6 * 100) / 100;
}

/**
 * Published-style rates from H1E 1M0 (Expedited / UPS Ground neighbourhood).
 * Free shipping applies to Canada only, at the store threshold.
 */
function quoteShipping({
  country = 'CA',
  province = '',
  postal = '',
  city = '',
  subtotal = 0,
  items = [],
  freeThreshold = 150,
} = {}) {
  const cc = String(country || 'CA').trim().toUpperCase();
  const dest = cc === 'OTHER' || cc.length !== 2 ? 'XX' : cc;
  const weight = parcelWeightKg(items);
  const extra = extraWeightSurcharge(weight);
  const threshold = Number(freeThreshold) || 150;
  const goods = Number(subtotal) || 0;

  let amount = 0;
  let zone = 'international';
  let carrier = 'Postes Canada / UPS';
  let eta = '';

  if (dest === 'CA') {
    carrier = 'Postes Canada (Expedited) · départ Montréal-Est';
    if (String(province || '').toUpperCase() === 'QC') {
      if (isMontrealMetro(province, postal, city)) {
        zone = 'local';
        amount = 9.95;
        eta = '2–4 jours ouvrables';
      } else {
        zone = 'quebec';
        amount = 12.95;
        eta = '3–5 jours ouvrables';
      }
    } else if (String(province || '').toUpperCase() === 'ON') {
      zone = 'ontario';
      amount = 15.95;
      eta = '4–7 jours ouvrables';
    } else {
      zone = 'canada';
      amount = 19.95;
      eta = '5–10 jours ouvrables';
    }
    if (goods >= threshold) {
      return {
        amount: 0,
        original: Math.round((amount + extra) * 100) / 100,
        free: true,
        zone,
        carrier,
        eta,
        origin: ORIGIN,
        weight,
        label: 'Livraison gratuite (Canada · 150$+)',
      };
    }
    amount = Math.round((amount + extra) * 100) / 100;
    return {
      amount,
      original: amount,
      free: false,
      zone,
      carrier,
      eta,
      origin: ORIGIN,
      weight,
      label: `${carrier} · ${amount.toFixed(2)}$ CAD`,
    };
  }

  if (dest === 'US') {
    amount = Math.round((28 + extra) * 100) / 100;
    zone = 'us';
    carrier = 'UPS / Postes Canada (É.-U.) · départ Montréal-Est';
    eta = '5–10 jours ouvrables';
  } else if (['FR', 'BE', 'LU', 'MC'].includes(dest)) {
    amount = Math.round((34 + extra) * 100) / 100;
    zone = 'france';
    carrier = 'Postes Canada international · départ Montréal-Est';
    eta = '7–14 jours ouvrables';
  } else if (['GB', 'DE', 'ES', 'IT', 'NL', 'CH', 'IE', 'PT', 'AT', 'SE', 'DK', 'NO'].includes(dest)) {
    amount = Math.round((38 + extra) * 100) / 100;
    zone = 'europe';
    carrier = 'Postes Canada international · départ Montréal-Est';
    eta = '8–16 jours ouvrables';
  } else {
    amount = Math.round((44 + extra) * 100) / 100;
    zone = 'world';
    carrier = 'Postes Canada international · départ Montréal-Est';
    eta = '10–21 jours ouvrables';
  }

  return {
    amount,
    original: amount,
    free: false,
    zone,
    carrier,
    eta,
    origin: ORIGIN,
    weight,
    label: `${carrier} · ${amount.toFixed(2)}$ CAD`,
  };
}

module.exports = {
  ORIGIN,
  fsa,
  parcelWeightKg,
  quoteShipping,
};
