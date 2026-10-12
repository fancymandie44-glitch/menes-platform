'use strict';

function slugifyProduct(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function productSlug(p) {
  if (!p) return '';
  return slugifyProduct(p.slug || p.id || p.name);
}

function productPath(p) {
  const slug = productSlug(p);
  return slug ? `/produit/${encodeURIComponent(slug)}` : '/';
}

function slugFromPathname(pathname) {
  const path = String(pathname || '').replace(/\/+$/, '') || '/';
  const m = path.match(/^\/(produit|product)\/([^/]+)$/i);
  return m ? decodeURIComponent(m[2]).toLowerCase() : '';
}

function isColorOptionName(name) {
  return /couleur|color|colour|teinte/i.test(String(name || ''));
}

function isSizeOptionName(name) {
  return /^(taille|size)$/i.test(String(name || '').trim());
}

function normalizeHex(h) {
  let s = String(h || '').trim();
  if (!s) return '';
  if (!s.startsWith('#')) s = `#${s}`;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  return '';
}

function parseSwatches(raw) {
  const out = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    Object.entries(raw).forEach(([k, v]) => {
      const hex = normalizeHex(v);
      if (k && hex) out[String(k).trim()] = hex;
    });
    return out;
  }
  String(raw || '').split(',').forEach((part) => {
    const m = String(part).match(/^\s*(.+?)\s*:\s*(#[0-9a-fA-F]{3,8})\s*$/);
    if (m) {
      const hex = normalizeHex(m[2]);
      if (hex) out[m[1].trim()] = hex;
    }
  });
  return out;
}

const NAME_HEX = {
  noir: '#111111', black: '#111111', onyx: '#161616',
  blanc: '#f4f1ea', white: '#f4f1ea',
  beige: '#d6c4a8', cream: '#efe6d6',
  vert: '#3f5c3a', olive: '#6b7c3a', green: '#3f5c3a',
  orange: '#c45a1c', gold: '#c9a84c',
  gris: '#7a756c', gray: '#7a756c', grey: '#7a756c',
  bleu: '#2c3d5a', blue: '#2c3d5a',
  rouge: '#8b1e1e', red: '#8b1e1e',
};

function swatchHex(name, swatches) {
  const key = String(name || '').trim();
  if (swatches && swatches[key]) return swatches[key];
  const k = key.toLowerCase();
  if (NAME_HEX[k]) return NAME_HEX[k];
  const word = k.split(/\s+/)[0];
  return NAME_HEX[word] || '';
}

function normalizeImages(p) {
  if (Array.isArray(p?.images) && p.images.length) {
    return p.images.map((im) => (typeof im === 'string' ? { url: im, label: '' } : im)).filter((im) => im && im.url);
  }
  if (p?.image) return [{ url: p.image, label: '' }];
  return [];
}

function imagesForColor(product, colorName) {
  const all = normalizeImages(product);
  const color = String(colorName || '').trim().toLowerCase();
  if (!color) return all;
  const matched = all.filter((im) => {
    const lab = String(im.label || '').trim().toLowerCase();
    if (!lab) return false;
    return lab === color || lab.includes(color) || color.includes(lab);
  });
  return matched.length ? matched : all;
}

function findProductBySlug(products, slug) {
  const want = slugifyProduct(slug);
  if (!want) return null;
  return (products || []).find((p) => productSlug(p) === want || slugifyProduct(p.id) === want) || null;
}

const api = {
  slugifyProduct,
  productSlug,
  productPath,
  slugFromPathname,
  isColorOptionName,
  isSizeOptionName,
  parseSwatches,
  swatchHex,
  normalizeImages,
  imagesForColor,
  findProductBySlug,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.MENES_PDP = api;
}
