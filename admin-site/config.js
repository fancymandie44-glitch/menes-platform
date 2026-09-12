// Call the proxy function directly. /api is reserved for Functions and
// /store-api is swallowed by the SPA fallback on this site.
// store-proxy forwards /api/* to www.mymenes.com so the session cookie stays on menesadmin.
window.MENES_CONFIG = {
  API_BASE: '/.netlify/functions/store-proxy',
};
