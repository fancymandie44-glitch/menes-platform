const fs = require('fs');
const path = require('path');

const DEFAULT_STORE = {
  site: {
    name: 'MENES',
    tagline: 'Luxe streetwear · Sur mesure',
    heroTitle: 'VOTRE STYLE. VOTRE MARQUE.',
    heroSubtitle: 'Vêtements sur mesure. Qualité premium, prix direct.',
    instagram: 'https://www.instagram.com/menes_jewelry',
    email: 'mymenes2022@gmail.com',
    currency: 'CAD',
  },
  products: [
    {
      id: 'hoodie-noir',
      name: 'Hoodie MENES Noir',
      category: 'vetements',
      price: 85,
      description: 'Hoodie oversize premium, logo brodé.',
      sizes: ['S', 'M', 'L', 'XL'],
      image: '',
      active: true,
    },
    {
      id: 'tshirt-logo',
      name: 'T-Shirt Logo MENES',
      category: 'vetements',
      price: 45,
      description: 'Coton 100%, impression haute qualité.',
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      image: '',
      active: true,
    },
  ],
  orders: [],
};

function getStorePath(root) {
  return path.join(root, 'data', 'store.json');
}

function readStoreFile(root) {
  try {
    const raw = fs.readFileSync(getStorePath(root), 'utf8');
    return JSON.parse(raw);
  } catch {
    return DEFAULT_STORE;
  }
}

function writeStoreFile(root, data) {
  fs.writeFileSync(getStorePath(root), JSON.stringify(data, null, 2), 'utf8');
}

module.exports = { DEFAULT_STORE, readStoreFile, writeStoreFile };
