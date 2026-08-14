/**
 * Server-side order pricing — never trust client totals.
 */
const PROVINCE_TAX = {
  CA: {
    QC: { rate: 0.14975, label: 'TPS+TVQ' },
    ON: { rate: 0.13, label: 'TVH' },
    AB: { rate: 0.05, label: 'TPS' },
    BC: { rate: 0.12, label: 'TPS+TVP' },
    MB: { rate: 0.12, label: 'TPS+TVP' },
    SK: { rate: 0.11, label: 'TPS+TVP' },
    NS: { rate: 0.15, label: 'TVH' },
    NB: { rate: 0.15, label: 'TVH' },
    NL: { rate: 0.15, label: 'TVH' },
    PE: { rate: 0.15, label: 'TVH' },
    NT: { rate: 0.05, label: 'TPS' },
    NU: { rate: 0.05, label: 'TPS' },
    YT: { rate: 0.05, label: 'TPS' },
  },
};

function productOptions(p) {
  if (Array.isArray(p.options) && p.options.length) {
    return p.options.filter((o) => o && o.name && Array.isArray(o.values) && o.values.length);
  }
  if (Array.isArray(p.sizes) && p.sizes.length) {
    return [{ name: 'Taille', values: p.sizes }];
  }
  return [];
}

function variantKeyFromMap(optsMap) {
  return Object.keys(optsMap || {}).sort().map((k) => `${k}=${optsMap[k]}`).join('|');
}

function parseLineVariant(line, product) {
  if (line?.variant && typeof line.variant === 'object' && Object.keys(line.variant).length) {
    return line.variant;
  }
  const opts = productOptions(product);
  const size = String(line?.size || line?.variantStr || '').trim();
  if (!opts.length) return {};
  // "Vert / M" → map by option order
  const parts = size.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
  const map = {};
  opts.forEach((o, i) => {
    if (parts[i] && o.values.map(String).includes(parts[i])) map[o.name] = parts[i];
    else if (o.values.map(String).includes(size)) map[o.name] = size;
  });
  return map;
}

function findVariantStock(product, variantMap) {
  const list = Array.isArray(product?.variants) ? product.variants : [];
  if (!list.length) {
    const s = Number(product?.stock);
    if (!Number.isFinite(s) || s <= 0) return Infinity;
    return s;
  }
  const key = variantKeyFromMap(variantMap);
  const hit = list.find((v) => (v.key || variantKeyFromMap(v.options || {})) === key)
    || list.find((v) => {
      const opts = v.options || {};
      return Object.keys(variantMap || {}).every((k) => opts[k] === variantMap[k]);
    });
  if (!hit) return 0;
  return Math.max(0, Number(hit.stock) || 0);
}

function findDiscount(store, code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return null;
  if (c === 'VIP10' || c === 'WELCOME10') return null;
  return (store.discounts || []).find((d) => d.active !== false && String(d.code || '').toUpperCase() === c) || null;
}

function discountAmount(disc, subtotal) {
  if (!disc) return 0;
  const min = Number(disc.minCart) || 0;
  if (subtotal < min) return 0;
  if (disc.type === 'fixed') return Math.min(subtotal, Number(disc.value) || 0);
  return Math.round(subtotal * ((Number(disc.value) || 0) / 100) * 100) / 100;
}

function buildTrustedOrder(store, raw) {
  const customer = {
    name: String(raw?.customer?.name || '').trim().slice(0, 120),
    email: String(raw?.customer?.email || '').trim().toLowerCase().slice(0, 160),
    phone: String(raw?.customer?.phone || '').trim().slice(0, 40),
    address: String(raw?.customer?.address || '').trim().slice(0, 200),
    city: String(raw?.customer?.city || '').trim().slice(0, 80),
    province: String(raw?.customer?.province || '').trim().slice(0, 40),
    postal: String(raw?.customer?.postal || '').trim().slice(0, 20),
    country: String(raw?.customer?.country || 'CA').trim().slice(0, 8).toUpperCase(),
  };

  if (!customer.name || !customer.email || !customer.phone || !customer.address) {
    return { error: 'Informations client incomplètes' };
  }

  const products = store.products || [];
  const rawItems = Array.isArray(raw?.items) ? raw.items : [];
  if (!rawItems.length) return { error: 'Panier vide' };

  const items = [];
  for (const line of rawItems.slice(0, 40)) {
    const product = products.find((p) => p.id === line.id || p.id === line.productId);
    if (!product || product.active === false) {
      return { error: `Produit introuvable: ${line.name || line.id}` };
    }
    const qty = Math.max(1, Math.min(20, parseInt(line.qty, 10) || 1));
    const opts = productOptions(product);
    const variantMap = parseLineVariant(line, product);
    let size = String(line.size || line.variantStr || '').trim();
    if (opts.length) {
      const label = Object.values(variantMap).join(' / ');
      if (label) size = label;
      else {
        const values = opts[0].values.map(String);
        if (!size || !values.includes(size)) size = values[0];
      }
      const left = findVariantStock(product, variantMap);
      if (Number.isFinite(left) && left <= 0) {
        return { error: `Rupture de stock: ${product.name}${size ? ` (${size})` : ''}` };
      }
      if (Number.isFinite(left) && qty > left) {
        return { error: `Stock insuffisant pour ${product.name}${size ? ` (${size})` : ''} (max ${left})` };
      }
    } else {
      size = size || '—';
    }
    items.push({
      id: product.id,
      name: product.name,
      price: Number(product.price) || 0,
      qty,
      size,
      variant: variantMap,
      preorder: !!product.preorder,
      preorderNote: product.preorder ? String(product.preorderNote || '').slice(0, 160) : '',
      image: product.image || product.images?.[0]?.url || '',
    });
  }

  const subtotal = Math.round(items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;
  const threshold = Number(store.site?.freeShippingThreshold) || 150;
  const shipping = subtotal >= threshold || customer.country !== 'CA' ? 0 : 0; // boutique: free shipping messaging; keep 0 unless later fee added
  const disc = findDiscount(store, raw?.discountCode || raw?.promo || raw?.discount?.code);
  const discount = discountAmount(disc, subtotal);

  let tax = { amount: 0, label: '', rate: 0 };
  if (customer.country === 'CA') {
    const rule = PROVINCE_TAX.CA[customer.province] || PROVINCE_TAX.CA.QC;
    const taxable = Math.max(0, subtotal - discount + shipping);
    tax = {
      amount: Math.round(taxable * rule.rate * 100) / 100,
      label: rule.label,
      rate: rule.rate,
    };
  }

  const total = Math.round((subtotal - discount + shipping + tax.amount) * 100) / 100;
  const id = String(raw?.id || '').trim().slice(0, 40) || `M${Date.now().toString(36).toUpperCase()}`;

  // Ambassador attribution (client-provided; commission engine validates server-side)
  let attribution = null;
  if (raw?.attribution && typeof raw.attribution === 'object') {
    attribution = {
      ambassadorId: String(raw.attribution.ambassadorId || '').slice(0, 64) || null,
      slug: String(raw.attribution.slug || '').slice(0, 40) || null,
      promoCode: String(raw.attribution.promoCode || '').slice(0, 40) || null,
      method: String(raw.attribution.method || 'ambassador_link').slice(0, 40),
      campaignId: raw.attribution.campaignId ? String(raw.attribution.campaignId).slice(0, 64) : null,
      clickedAt: raw.attribution.clickedAt || null,
      expiresAt: raw.attribution.expiresAt || null,
    };
  }
  const ambassadorId = String(raw?.ambassadorId || attribution?.ambassadorId || '').slice(0, 64) || null;

  // If discount belongs to an ambassador, keep ambassadorId for attribution
  const discountAmbassadorId = disc?.ambassadorId ? String(disc.ambassadorId).slice(0, 64) : null;

  return {
    order: {
      id,
      customer,
      items,
      subtotal,
      shipping,
      discount,
      discountCode: disc?.code || '',
      tax,
      total,
      status: 'pending',
      date: new Date().toISOString(),
      currency: 'CAD',
      attribution,
      ambassadorId: ambassadorId || discountAmbassadorId || null,
      attributionMethod: attribution?.method || (discountAmbassadorId ? 'promo_code' : null),
      campaignId: attribution?.campaignId || null,
    },
  };
}

module.exports = { buildTrustedOrder, findDiscount, discountAmount };
