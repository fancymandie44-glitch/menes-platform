'use strict';

/** Live MENES boxer SKUs. Catalog is stored in Netlify Blobs; this is the source of truth for upserts. */
const SIZES = ['S', 'M', 'L', 'XL'];
const UNITS_PER_SIZE = 5;
const PRICE = 49.99;

function sizeVariants() {
  return SIZES.map((size) => ({
    key: `Size=${size}`,
    label: size,
    options: { Size: size },
    stock: UNITS_PER_SIZE,
  }));
}

const BOXERS = [
  {
    id: 'menes-grey-boxer',
    name: 'MENES Grey Boxer',
    sku: 'MENES-BOXER-GREY',
    category: 'vetements',
    price: PRICE,
    comparePrice: 0,
    description: 'Performance boxer with MENES waistband, GREY mark down the leg, and contrast grey trim. Sizes S–XL.',
    options: [{ name: 'Size', values: SIZES.slice() }],
    sizes: SIZES.slice(),
    tags: ['boxer', 'grey', 'underwear'],
    stock: SIZES.length * UNITS_PER_SIZE,
    variants: sizeVariants(),
    images: [
      { url: '/images/products/boxers/grey.jpg', label: 'Grey' },
      { url: '/images/products/boxers/grey-worn.jpg', label: 'On body' },
    ],
    image: '/images/products/boxers/grey.jpg',
    videoUrl: '',
    active: true,
    featured: true,
    preorder: false,
    preorderNote: '',
  },
  {
    id: 'menes-red-boxer',
    name: 'MENES Red Boxer',
    sku: 'MENES-BOXER-RED',
    category: 'vetements',
    price: PRICE,
    comparePrice: 0,
    description: 'Performance boxer with MENES waistband, RZD mark down the leg, and contrast red trim. Sizes S–XL.',
    options: [{ name: 'Size', values: SIZES.slice() }],
    sizes: SIZES.slice(),
    tags: ['boxer', 'red', 'rzd', 'underwear'],
    stock: SIZES.length * UNITS_PER_SIZE,
    variants: sizeVariants(),
    images: [
      { url: '/images/products/boxers/red.jpg', label: 'Red' },
      { url: '/images/products/boxers/red-worn.jpg', label: 'On body' },
    ],
    image: '/images/products/boxers/red.jpg',
    videoUrl: '',
    active: true,
    featured: true,
    preorder: false,
    preorderNote: '',
  },
];

function upsertInto(store) {
  const next = { ...(store || {}), products: Array.isArray(store?.products) ? store.products.slice() : [] };
  for (const product of BOXERS) {
    const idx = next.products.findIndex((p) => p && p.id === product.id);
    if (idx >= 0) next.products[idx] = { ...next.products[idx], ...product };
    else next.products.push(product);
  }
  return next;
}

module.exports = { BOXERS, SIZES, UNITS_PER_SIZE, PRICE, upsertInto };
