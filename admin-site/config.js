// Same-origin proxy. /api is reserved for Netlify Functions on this site, so the
// console calls /store-api/api/* which rewrites to boutiquemenes.netlify.app/api/*.
// Session cookie stays host-only on menesadmin (SameSite=Lax).
window.MENES_CONFIG = {
  API_BASE: '/store-api',
};
