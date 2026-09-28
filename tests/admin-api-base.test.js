'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const adminConfig = fs.readFileSync(path.join(root, 'admin-site', 'config.js'), 'utf8');
const toml = fs.readFileSync(path.join(root, 'admin-site', 'netlify.toml'), 'utf8');
const bat = fs.readFileSync(path.join(root, 'admin-site', 'DEPLOY-ADMIN.bat'), 'utf8');
const consoleJs = fs.readFileSync(path.join(root, 'console.js'), 'utf8');
const cors = fs.readFileSync(path.join(root, 'lib', 'cors.js'), 'utf8');

assert.match(adminConfig, /API_BASE:\s*'https:\/\/www\.mymenes\.com'/);
assert.match(toml, /https:\/\/www\.mymenes\.com/);
assert.match(bat, /admin-site\\config\.js/);
assert.doesNotMatch(bat, /copy \/Y config\.js/);
assert.match(consoleJs, /www\.mymenes\.com/);
assert.doesNotMatch(consoleJs, /Vérifie que boutiquemenes\.netlify\.app est en ligne/);
assert.match(cors, /https:\/\/menesadmin\.netlify\.app/);
assert.match(cors, /https:\/\/www\.mymenes\.com/);

console.log('ok: admin API points at www.mymenes.com');
