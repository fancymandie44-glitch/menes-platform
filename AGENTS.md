# AGENTS.md

## Cursor Cloud specific instructions

MENES is a framework-less "mini-Shopify" e-commerce platform: vanilla JS/HTML/CSS storefronts plus Netlify Functions (`api/*.js`, shared logic in `lib/*.js`). There is no build step and no bundler for the frontend. See `ARCHITECTURE.txt` and `GUIDE-COMPLET.txt` for a product overview.

### Running locally

- Start the local dev server with `node server.js` (see `server.js`). It listens on port **8888** and serves every static frontend from the repo root.
- Routes: storefront at `/` (`index.html`), admin console at `/console` (aliased to `console.html`, also `/admin` and `/platform`), legacy storefront at `/store/index.html`.
- Do NOT rely on the Windows `*.bat` files (`START-PLATFORM.bat`, etc.) — they are Windows-only helpers. Use `node server.js` directly.

### Local vs. production data/API differences (non-obvious)

- `server.js` is a lightweight local stand-in, NOT the real serverless backend. It only implements `GET/POST /api/store` (persisted to the flat file `data/store.json` via `lib/store-data.js`) and stubs `/api/pay` + `/api/create-checkout` (they return "paiements actifs sur Netlify. En local: commande par email."). Multi-tenant/platform endpoints (`api/platform.js`) and real payments are NOT served locally.
- The real backend (`api/store.js`, `api/platform.js`, `api/pay.js`) uses **Netlify Blobs** for storage and only runs under `netlify dev` / on Netlify. To exercise that path locally you'd need the Netlify CLI (not in `package.json`) plus `NETLIFY_SITE_ID` + `NETLIFY_BLOBS_TOKEN`. This is not required to browse/test the storefront.
- Admin writes require the header `X-Admin-Password` (default `menes2026`, overridable via `ADMIN_PASSWORD`).

### Payments / external services (all optional)

- Payment providers (Stripe, PayPal, Square, Coinbase Commerce) are keyed off env vars and gracefully report "not configured" when absent, so none block running or testing. See `lib/payments.js`.

### Lint / test / build

- There is no lint config, no test suite, and no frontend build (confirmed: `package.json` has no `scripts`). Production deploy is handled by Netlify per `netlify.toml` (publishes `dist/`, functions bundled with esbuild); `dist/` is assembled by `DEPLOY-BOUTIQUE.bat` and is gitignored — do not commit it.
