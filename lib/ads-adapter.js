'use strict';

const { metaConfigured, COPILOT_DAILY_BUDGET_CAP, COPILOT_TOTAL_BUDGET_CAP } = require('./copilot-config');

function enforceBudgetCaps({ dailyBudget, lifetimeBudget }, existingAds = []) {
  const daily = Number(dailyBudget) || 0;
  const lifetime = Number(lifetimeBudget) || 0;
  if (daily > COPILOT_DAILY_BUDGET_CAP) {
    return { ok: false, error: `Daily budget ${daily} exceeds cap ${COPILOT_DAILY_BUDGET_CAP}` };
  }
  if (lifetime > COPILOT_TOTAL_BUDGET_CAP) {
    return { ok: false, error: `Lifetime budget ${lifetime} exceeds cap ${COPILOT_TOTAL_BUDGET_CAP}` };
  }
  const liveDaily = (existingAds || [])
    .filter((a) => a.status === 'active' || a.status === 'PAUSED')
    .reduce((s, a) => s + (Number(a.dailyBudget) || 0), 0);
  if (liveDaily + daily > COPILOT_TOTAL_BUDGET_CAP) {
    return { ok: false, error: `Store ad budgets would exceed total cap ${COPILOT_TOTAL_BUDGET_CAP}` };
  }
  return { ok: true, daily, lifetime };
}

class AdsAdapter {
  constructor(platform) {
    this.platform = platform;
  }
  async createDraft() {
    throw new Error('Adapter not implemented');
  }
  async getInsights() {
    return { available: false, rows: [], note: 'No live metrics for this platform yet' };
  }
}

class LocalAdsAdapter extends AdsAdapter {
  async createDraft(draft) {
    return {
      provider: this.platform,
      remoteId: null,
      status: 'draft',
      published: false,
      note: 'Saved locally. Connect the ad account to push a paused campaign.',
      draft,
    };
  }
}

class MetaAdsAdapter extends AdsAdapter {
  constructor() {
    super('meta');
  }
  async createDraft(draft) {
    if (!metaConfigured()) {
      return new LocalAdsAdapter('meta').createDraft(draft);
    }
    const token = process.env.META_ACCESS_TOKEN;
    const account = String(process.env.META_AD_ACCOUNT_ID).replace(/^act_/, '');
    const url = `https://graph.facebook.com/v21.0/act_${account}/campaigns`;
    const body = new URLSearchParams({
      name: draft.campaignName || 'MENES draft',
      objective: draft.objective === 'sales' ? 'OUTCOME_SALES' : 'OUTCOME_TRAFFIC',
      status: 'PAUSED',
      special_ad_categories: '[]',
      daily_budget: String(Math.round((Number(draft.dailyBudget) || 5) * 100)),
      access_token: token,
    });
    const res = await fetch(url, { method: 'POST', body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        provider: 'meta',
        remoteId: null,
        status: 'draft',
        published: false,
        note: `Meta API refused the paused campaign (${data.error?.message || res.status}). Form kept as local draft.`,
        draft,
      };
    }
    return {
      provider: 'meta',
      remoteId: data.id || null,
      status: 'PAUSED',
      published: false,
      note: 'Created on Meta as PAUSED. Confirm in Ads Manager before spending.',
      draft,
    };
  }
  async getInsights(remoteId) {
    if (!metaConfigured() || !remoteId) {
      return { available: false, rows: [], note: 'Meta is not connected or the campaign has no remote id' };
    }
    const token = process.env.META_ACCESS_TOKEN;
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(remoteId)}/insights?fields=impressions,clicks,spend,ctr,cpm,actions&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    return { available: res.ok, rows: data.data || [], note: data.error?.message || '' };
  }
}

function getAdsAdapter(platform = 'meta') {
  const p = String(platform || 'meta').toLowerCase();
  if (p === 'meta' || p === 'facebook' || p === 'instagram') return new MetaAdsAdapter();
  return new LocalAdsAdapter(p);
}

module.exports = { enforceBudgetCaps, getAdsAdapter, AdsAdapter, MetaAdsAdapter, LocalAdsAdapter };
