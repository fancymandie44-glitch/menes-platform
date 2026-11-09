'use strict';

const PRICE = 99.99;

const CAMO_HAT = {
  id: 'menes-camo-trucker-hat',
  name: 'MENES Camo Trucker Hat',
  sku: 'MENES-CAMO-HAT',
  category: 'accessoires',
  price: PRICE,
  comparePrice: 0,
  description: 'Camo trucker with embroidered MENES mark and snapback.',
  options: [],
  sizes: [],
  tags: ['hat', 'camo', 'trucker', 'holiday'],
  stock: 5,
  variants: [],
  images: [
    { url: '/images/products/hats/camo.jpg?v=1', label: 'Camo' },
  ],
  image: '/images/products/hats/camo.jpg?v=1',
  videoUrl: '',
  active: true,
  featured: true,
  preorder: false,
  preorderNote: '',
};

function upsertInto(store) {
  const next = { ...(store || {}), products: Array.isArray(store?.products) ? store.products.slice() : [] };
  const idx = next.products.findIndex((p) => p && p.id === CAMO_HAT.id);
  if (idx >= 0) {
    const prev = next.products[idx];
    const stock = Number.isFinite(Number(prev.stock)) ? prev.stock : CAMO_HAT.stock;
    next.products[idx] = { ...prev, ...CAMO_HAT, stock };
  } else {
    next.products.push(CAMO_HAT);
  }
  return next;
}

module.exports = { CAMO_HAT, PRICE, upsertInto };
