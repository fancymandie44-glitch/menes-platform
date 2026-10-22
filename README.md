# MENES platform

Custom multi-store e-commerce (Netlify static + functions + Blobs). Not Shopify.

## Copilot setup

1. Copy `.env.example` and set `ADMIN_PASSWORD` plus `ANTHROPIC_API_KEY` on the **boutiquemenes** Netlify site (never in client JS).
2. Optional: `META_ACCESS_TOKEN` + `META_AD_ACCOUNT_ID` to push campaigns as **PAUSED**. Without them, Autofill still fills the ads form.
3. Optional: `CRON_SECRET` so `/api/health-cron` cannot be triggered from a browser. Netlify scheduled runs send `{ next_run }`.
4. Open the admin console (`/console` or menesadmin). The gold **AI** button is Copilot. Tabs: Site Health, Approvals, Audit Copilot, Fournisseurs, Marketing & ads.

### Env

| Variable | Role |
| --- | --- |
| `ANTHROPIC_API_KEY` | Required for chat / AI autofill |
| `ANTHROPIC_MODEL` | Overrides `COPILOT_MODEL` in `lib/copilot-config.js` |
| `COPILOT_DAILY_BUDGET_CAP` / `COPILOT_TOTAL_BUDGET_CAP` | Hard caps in code |
| `META_*` | Optional paused Meta campaign create |
| `COPILOT_ALERTS=off` | Disable email on critical health |

### Add a tool

1. Append an object to `TOOLS` in `lib/copilot-tools.js`: `name`, `description`, `permission` (`read` / `write` / `spend`), JSON `schema`, `handler({ storeId, input })`.
2. `spend` tools always enqueue an Approvals row unless a human already confirmed.
3. Every call is written to the Copilot audit log (`copilot:audit:{storeId}` blob).
4. `npm test` includes `tests/copilot.test.js` (caps, compliance, admin gate).

Scheduled health: `api/health-cron.js` every 15 minutes (critical) and a full audit around 06:00 UTC, with safe heals (hide OOS, pause dead ads, flag suppliers). Undo is on the audit page.
