'use strict';

const { readSiteStore, writeSiteStore, readPlatform } = require('./platform');
const { wrapUntrusted, maskEmail, redactDeep } = require('./copilot-redact');
const { validateSchema } = require('./copilot-validate');
const { appendAudit } = require('./copilot-store');
const { runHealthCheck, storefrontOrigin, productUrl } = require('./health-monitor');
const { applyAutoFix } = require('./self-heal');
const { enqueueApproval } = require('./copilot-store');
const { checkAdCompliance } = require('./ads-compliance');
const { enforceBudgetCaps, getAdsAdapter } = require('./ads-adapter');
const { COPILOT_DAILY_BUDGET_CAP, COPILOT_TOTAL_BUDGET_CAP } = require('./copilot-config');

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function publicProduct(p, origin) {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    stock: p.stock,
    active: p.active !== false,
    category: p.category,
    description: String(p.description || '').slice(0, 600),
    image: p.image || p.images?.[0] || '',
    url: productUrl(origin, p),
  };
}

const TOOLS = [
  {
    name: 'list_products',
    description: 'List products for the active store (id, name, price, stock, active).',
    permission: 'read',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', maxLength: 80 },
        limit: { type: 'integer', minimum: 1, maximum: 40 },
      },
    },
    async handler({ storeId, input, origin }) {
      const store = await readSiteStore(storeId);
      const q = String(input.query || '').toLowerCase();
      let list = (store.products || []).map((p) => publicProduct(p, origin));
      if (q) list = list.filter((p) => `${p.name} ${p.id}`.toLowerCase().includes(q));
      return { products: list.slice(0, input.limit || 20) };
    },
  },
  {
    name: 'get_product',
    description: 'Get one product by id or name.',
    permission: 'read',
    schema: {
      type: 'object',
      required: ['idOrName'],
      properties: { idOrName: { type: 'string', minLength: 1, maxLength: 120 } },
    },
    async handler({ storeId, input, origin }) {
      const store = await readSiteStore(storeId);
      const q = String(input.idOrName).toLowerCase();
      const p = (store.products || []).find((x) => x.id === input.idOrName
        || String(x.name || '').toLowerCase().includes(q));
      if (!p) return { error: 'Product not found' };
      return { product: publicProduct(p, origin) };
    },
  },
  {
    name: 'store_overview',
    description: 'Counts for products, orders, ads, suppliers. No customer personal data.',
    permission: 'read',
    schema: { type: 'object', properties: {} },
    async handler({ storeId }) {
      const store = await readSiteStore(storeId);
      const orders = store.orders || [];
      return {
        name: store.site?.name,
        products: (store.products || []).length,
        activeProducts: (store.products || []).filter((p) => p.active !== false).length,
        orders: orders.length,
        paidOrders: orders.filter((o) => ['paid', 'processing', 'shipped', 'delivered'].includes(o.status)).length,
        ads: (store.ads || []).length,
        suppliers: (store.suppliers || []).length,
      };
    },
  },
  {
    name: 'orders_pulse',
    description: 'Recent order pulse with masked emails only.',
    permission: 'read',
    schema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 20 } } },
    async handler({ storeId, input }) {
      const store = await readSiteStore(storeId);
      const rows = (store.orders || []).slice(- (input.limit || 8)).reverse().map((o) => ({
        id: o.id,
        total: o.total,
        status: o.status,
        date: o.date,
        email: maskEmail(o.customer?.email),
        items: (o.items || []).length,
      }));
      return { orders: rows };
    },
  },
  {
    name: 'run_health_check',
    description: 'Run storefront, catalog, supplier, and ads health checks. mode=critical is faster.',
    permission: 'read',
    schema: {
      type: 'object',
      properties: { mode: { type: 'string', enum: ['critical', 'full'] } },
    },
    async handler({ storeId, input }) {
      return runHealthCheck({ storeId, mode: input.mode || 'critical' });
    },
  },
  {
    name: 'list_ads',
    description: 'List saved ad drafts and their status.',
    permission: 'read',
    schema: { type: 'object', properties: {} },
    async handler({ storeId }) {
      const store = await readSiteStore(storeId);
      return { ads: (store.ads || []).slice(0, 30) };
    },
  },
  {
    name: 'list_suppliers',
    description: 'List suppliers and link status.',
    permission: 'read',
    schema: { type: 'object', properties: {} },
    async handler({ storeId }) {
      const store = await readSiteStore(storeId);
      return { suppliers: store.suppliers || [] };
    },
  },
  {
    name: 'check_ad_compliance',
    description: 'Check ad copy against Meta-style policy and English-only brand rules.',
    permission: 'read',
    schema: { type: 'object', required: ['draft'], properties: { draft: { type: 'object' } } },
    async handler({ input }) {
      return checkAdCompliance(input.draft);
    },
  },
  {
    name: 'ad_performance',
    description: 'Read campaign metrics if a remote id exists; otherwise recommend from local status.',
    permission: 'read',
    schema: {
      type: 'object',
      properties: { adId: { type: 'string' }, platform: { type: 'string' } },
    },
    async handler({ storeId, input }) {
      const store = await readSiteStore(storeId);
      const ad = (store.ads || []).find((a) => a.id === input.adId) || (store.ads || [])[0];
      if (!ad) return { recommendations: ['No ads yet. Draft one from a product.'] };
      const adapter = getAdsAdapter(input.platform || ad.platform || 'meta');
      const insights = await adapter.getInsights(ad.remoteId);
      const recs = [];
      if (ad.status === 'draft') recs.push('Review the draft, then confirm to push PAUSED to Meta.');
      if (ad.status === 'paused') recs.push('Paused — do not scale until creative and landing page pass health.');
      if (insights.rows?.[0]) {
        const row = insights.rows[0];
        const ctr = Number(row.ctr || 0);
        if (ctr && ctr < 0.5) recs.push('CTR is weak — swap headline/primary text (variation B or C).');
        if (Number(row.spend || 0) > 20 && Number(row.clicks || 0) < 5) recs.push('Pause: spend without clicks.');
      }
      return { ad: redactDeep(ad), insights, recommendations: recs };
    },
  },
  {
    name: 'save_ad_draft',
    description: 'Save an ad draft locally. Never publishes. Daily budget is capped in code.',
    permission: 'write',
    schema: {
      type: 'object',
      required: ['draft'],
      properties: {
        draft: { type: 'object' },
        confirmSpend: { type: 'boolean' },
      },
    },
    async handler({ storeId, input }) {
      const draft = input.draft || {};
      const store = await readSiteStore(storeId);
      const cap = enforceBudgetCaps(draft, store.ads);
      if (!cap.ok) return cap;
      const compliance = checkAdCompliance(draft);
      if (!compliance.ok) return { ok: false, error: 'Compliance failed', compliance };
      const ad = {
        id: uid('ad'),
        platform: draft.platform || 'meta',
        status: 'draft',
        createdAt: new Date().toISOString(),
        ...draft,
        dailyBudget: cap.daily,
        lifetimeBudget: cap.lifetime,
      };
      store.ads = Array.isArray(store.ads) ? store.ads : [];
      store.ads.unshift(ad);
      await writeSiteStore(storeId, store);
      return { ok: true, ad, compliance, caps: { daily: COPILOT_DAILY_BUDGET_CAP, total: COPILOT_TOTAL_BUDGET_CAP } };
    },
  },
  {
    name: 'create_paused_campaign',
    description: 'Push a PAUSED/DRAFT campaign via the ads adapter. Requires confirmSpend=true. Never sets ACTIVE.',
    permission: 'spend',
    schema: {
      type: 'object',
      required: ['adId', 'confirmSpend'],
      properties: {
        adId: { type: 'string' },
        confirmSpend: { type: 'boolean' },
        platform: { type: 'string' },
      },
    },
    async handler({ storeId, input }) {
      if (input.confirmSpend !== true) {
        return { ok: false, error: 'confirmSpend must be true', needsApproval: true };
      }
      const store = await readSiteStore(storeId);
      const ad = (store.ads || []).find((a) => a.id === input.adId);
      if (!ad) return { ok: false, error: 'Ad not found' };
      const cap = enforceBudgetCaps(ad, store.ads);
      if (!cap.ok) return cap;
      const adapter = getAdsAdapter(input.platform || ad.platform);
      const result = await adapter.createDraft(ad);
      ad.remoteId = result.remoteId;
      ad.status = result.status || 'PAUSED';
      ad.providerNote = result.note;
      await writeSiteStore(storeId, store);
      return { ok: true, result };
    },
  },
  {
    name: 'hide_product',
    description: 'Low-risk: hide an out-of-stock product. Reversible.',
    permission: 'write',
    schema: {
      type: 'object',
      required: ['productId'],
      properties: { productId: { type: 'string' } },
    },
    async handler({ storeId, input }) {
      return applyAutoFix(storeId, { type: 'hide_product', productId: input.productId });
    },
  },
  {
    name: 'pause_ad',
    description: 'Low-risk: pause an ad that points to a dead page. Reversible.',
    permission: 'write',
    schema: {
      type: 'object',
      required: ['adId'],
      properties: { adId: { type: 'string' } },
    },
    async handler({ storeId, input }) {
      return applyAutoFix(storeId, { type: 'pause_ad', adId: input.adId });
    },
  },
  {
    name: 'flag_supplier',
    description: 'Low-risk: flag a dead supplier link. Reversible.',
    permission: 'write',
    schema: {
      type: 'object',
      required: ['supplierId'],
      properties: { supplierId: { type: 'string' } },
    },
    async handler({ storeId, input }) {
      return applyAutoFix(storeId, { type: 'flag_supplier', supplierId: input.supplierId });
    },
  },
  {
    name: 'propose_risky_change',
    description: 'Queue a risky change (price, publish, spend) for the merchant approval inbox. Does not apply it.',
    permission: 'write',
    schema: {
      type: 'object',
      required: ['type', 'title'],
      properties: {
        type: { type: 'string' },
        title: { type: 'string' },
        payload: { type: 'object' },
      },
    },
    async handler({ storeId, input }) {
      return applyAutoFix(storeId, { type: input.type, title: input.title, ...(input.payload || {}) }, { approved: false });
    },
  },
];

const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

function anthropicTools() {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.schema || { type: 'object', properties: {} },
  }));
}

async function runTool(name, rawInput, ctx) {
  const tool = TOOL_MAP.get(name);
  if (!tool) return { error: `Unknown tool ${name}` };
  const input = validateSchema(tool.schema || { type: 'object', properties: {} }, rawInput || {});
  if (tool.permission === 'spend' && !ctx.humanConfirm) {
    const queued = await enqueueApproval(ctx.storeId, {
      type: name,
      title: `Spend: ${name}`,
      payload: { type: 'create_meta_campaign', ...input },
      permission: 'spend',
    });
    await appendAudit(ctx.storeId, { tool: name, permission: 'spend', actor: ctx.actor, result: 'queued', approvalId: queued.id });
    return { queued: true, approval: queued, note: 'Waiting for merchant approval. Nothing was spent.' };
  }
  const platform = await readPlatform();
  const site = (platform.sites || []).find((s) => s.id === ctx.storeId) || {};
  const origin = storefrontOrigin(site);
  const started = Date.now();
  let result;
  try {
    result = await tool.handler({ ...ctx, input, origin, site, platform });
  } catch (err) {
    result = { error: err.message };
  }
  await appendAudit(ctx.storeId, {
    tool: name,
    permission: tool.permission,
    actor: ctx.actor || 'copilot',
    payload: redactDeep(input),
    result: result?.error ? 'error' : 'ok',
    ms: Date.now() - started,
  });
  return result;
}

function toolResultForModel(name, result) {
  return wrapUntrusted(`tool:${name}`, result);
}

module.exports = { TOOLS, TOOL_MAP, anthropicTools, runTool, toolResultForModel };
