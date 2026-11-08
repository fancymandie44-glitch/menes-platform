'use strict';

/** Live MENES boxer SKU. Catalog is stored in Netlify Blobs; this is the source of truth for upserts. */
const COLORS = ['Red', 'Grey'];
const SIZES = ['S', 'M', 'L', 'XL'];
const UNITS_PER_VARIANT = 5;
const PRICE = 49.99;
const RETIRED_IDS = ['menes-grey-boxer', 'menes-red-boxer'];

function variantKey(options) {
  return Object.keys(options).sort().map((k) => `${k}=${options[k]}`).join('|');
}

function colorSizeVariants() {
  const variants = [];
  for (const color of COLORS) {
    for (const size of SIZES) {
      const options = { Color: color, Size: size };
      variants.push({
        key: variantKey(options),
        label: `${color} / ${size}`,
        options,
        stock: UNITS_PER_VARIANT,
      });
    }
  }
  return variants;
}

const BOXER = {
  id: 'menes-boxer',
  name: 'MENES Boxer',
  sku: 'MENES-BOXER',
  category: 'vetements',
  price: PRICE,
  comparePrice: 0,
  description: 'Performance boxer with MENES waistband. Choose Red (RZD) or Grey, sizes S–XL.',
  options: [
    { name: 'Color', values: COLORS.slice() },
    { name: 'Size', values: SIZES.slice() },
  ],
  sizes: SIZES.slice(),
  tags: ['boxer', 'grey', 'red', 'rzd', 'underwear'],
  stock: COLORS.length * SIZES.length * UNITS_PER_VARIANT,
  variants: colorSizeVariants(),
  images: [
    { url: '/images/products/boxers/red.jpg', label: 'Red' },
    { url: '/images/products/boxers/grey.jpg', label: 'Grey' },
    { url: '/images/products/boxers/red-worn.jpg', label: 'Red look' },
    { url: '/images/products/boxers/grey-worn.jpg', label: 'Grey look' },
  ],
  image: '/images/products/boxers/red.jpg',
  videoUrl: '',
  active: true,
  featured: true,
  preorder: false,
  preorderNote: '',
};

const BOXERS = [BOXER];

function upsertInto(store) {
  const next = { ...(store || {}), products: Array.isArray(store?.products) ? store.products.slice() : [] };
  next.products = next.products.filter((p) => p && !RETIRED_IDS.includes(p.id));
  const idx = next.products.findIndex((p) => p && p.id === BOXER.id);
  if (idx >= 0) next.products[idx] = { ...next.products[idx], ...BOXER };
  else next.products.push(BOXER);
  return next;
}

module.exports = {
  BOXER,
  BOXERS,
  COLORS,
  SIZES,
  UNITS_PER_VARIANT,
  UNITS_PER_SIZE: UNITS_PER_VARIANT,
  PRICE,
  RETIRED_IDS,
  upsertInto,
};
