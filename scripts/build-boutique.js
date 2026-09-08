#!/usr/bin/env node
/**
 * Assemble the public boutique into dist/ for Netlify.
 * Git deploys publish "dist" — this folder is gitignored, so a build
 * command must recreate it or the live site 404s.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const STATIC_FILES = [
  'index.html',
  'shop.css',
  'shop.js',
  'config.js',
  'paiement.html',
  'paiement.js',
  'livraison.html',
  'retours.html',
  'confidentialite.html',
  '_redirects',
  'robots.txt',
  'package.json',
  'console.html',
  'console.js',
  'console.css',
];

const STATIC_DIRS = ['data', 'api', 'lib'];

function copyFile(rel) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) return false;
  const dest = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

function copyDir(rel) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) return false;
  fs.cpSync(src, path.join(DIST, rel), { recursive: true });
  return true;
}

function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  const copied = [];
  for (const file of STATIC_FILES) {
    if (copyFile(file)) copied.push(file);
  }
  for (const dir of STATIC_DIRS) {
    if (copyDir(dir)) copied.push(dir + '/');
  }

  const indexPath = path.join(DIST, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error('build-boutique: dist/index.html missing — boutique would 404');
  }

  console.log('Boutique dist ready:', DIST);
  console.log('Copied:', copied.join(', '));
}

main();
