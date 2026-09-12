// Same-origin proxy function. /api is reserved for Netlify Functions on this
// static site, so the console calls /store-api/api/* which store-proxy forwards
// to www.mymenes.com/api/*. Session cookie stays host-only on menesadmin.
window.MENES_CONFIG = {
  API_BASE: '/store-api',
};
