/**
 * MENES Ambassador program — Netlify Blobs store (separate from boutique store).
 */

const { getBlobStore } = require('./platform');

const BLOB_KEY = 'ambassador-program';

const DEFAULT_LEVELS = [
  { id: 'ambassador', name: 'Ambassador', minSales: 0, commission: 10, order: 1 },
  { id: 'rising', name: 'Rising Ambassador', minSales: 500, commission: 12, order: 2 },
  { id: 'elite', name: 'Ambassador Elite', minSales: 1000, commission: 15, order: 3 },
  { id: 'pro', name: 'Ambassador Pro', minSales: 2000, commission: 17.5, order: 4 },
  { id: 'leader', name: 'Ambassador Leader', minSales: 4000, commission: 20, order: 5 },
];

const DEFAULT_BADGES = [
  { id: 'first_sale', name: 'First Sale', description: 'Première vente attribuée', icon: '✦' },
  { id: 'orders_10', name: '10 Orders', description: '10 commandes attribuées', icon: '◆' },
  { id: 'club_500', name: '$500 Club', description: '500$ de ventes personnelles', icon: '◇' },
  { id: 'club_1000', name: '$1,000 Club', description: '1000$ de ventes personnelles', icon: '★' },
  { id: 'top_seller', name: 'Top Seller', description: '#1 du mois', icon: '▲' },
  { id: 'content_creator', name: 'Content Creator', description: 'Contenu promo approuvé', icon: '◎' },
  { id: 'campaign_champion', name: 'Campaign Champion', description: 'Campagne complétée', icon: '▣' },
  { id: 'streak_7', name: '7 Day Streak', description: '7 jours actifs', icon: '▣' },
  { id: 'streak_30', name: '30 Day Streak', description: '30 jours actifs', icon: '▣' },
  { id: 'leader', name: 'Ambassador Leader', description: 'Rang Leader atteint', icon: '♛' },
  { id: 'early', name: 'Early Member', description: 'Membre fondateur', icon: '◈' },
];

const DEFAULT_CHANNELS = [
  { id: 'general', name: '#general', description: 'Discussion générale', locked: false },
  { id: 'promotion-ideas', name: '#promotion-ideas', description: 'Idées promo', locked: false },
  { id: 'content', name: '#content', description: 'Contenu & créas', locked: false },
  { id: 'sales', name: '#sales', description: 'Ventes & perf', locked: false },
  { id: 'campaigns', name: '#campaigns', description: 'Campagnes', locked: false },
  { id: 'announcements', name: '#announcements', description: 'Annonces MENES', locked: true },
  { id: 'help', name: '#help', description: 'Aide', locked: false },
];

function defaultSettings() {
  return {
    attributionDays: 30,
    pendingDays: 14,
    personalCommission: 10,
    referralLevel1: 2,
    referralLevel2: 1,
    minPayout: 50,
    requireApproval: true,
    shopBaseUrl: 'https://boutiquemenes.netlify.app',
    ambassadorAppUrl: 'https://menesambassador.netlify.app',
    defaultDiscountPercent: 10,
    maxDiscountPercent: 25,
    leaderboard: {
      showNames: true,
      showPhotos: true,
      showSales: false,
      showXp: true,
      showRank: true,
    },
    // Weekly XP contest prizes (CAD) for places 1–3 — on top of commissions
    weeklyXpRewards: {
      enabled: true,
      prizes: [3, 2, 1],
    },
    levels: DEFAULT_LEVELS,
    xpRules: {
      firstSale: 100,
      per100Sales: 50,
      monthly500: 250,
      monthly1000: 500,
      completeCampaign: 200,
      completeTraining: 100,
      approvedContent: 100,
      activeReferral: 100,
      // Engagement
      linkClick: 2,
      linkClickMilestones: { 1: 20, 10: 40, 25: 60, 50: 100, 100: 150, 250: 250, 500: 400 },
      promoCodeUse: 15,
      promoCodeMilestones: { 1: 25, 5: 50, 10: 75, 25: 150, 50: 250 },
      dailyLogin: 15,
      streak7: 75,
      streak30: 200,
      chatMessage: 5,
      chatDailyMax: 5,
      ideaSubmit: 25,
      ideaDailyMax: 3,
      inviteSent: 20,
      teamMemberActive: 10,
      teamActiveDailyMax: 5,
      profileComplete: 40,
    },
  };
}

function defaultProgram() {
  return {
    version: 1,
    settings: defaultSettings(),
    ambassadors: [],
    invites: [],
    commissions: [],
    payouts: [],
    campaigns: [],
    challenges: [],
    badges: DEFAULT_BADGES,
    content: [],
    channels: DEFAULT_CHANNELS,
    messages: [],
    messageReports: [],
    ideas: [],
    ideaComments: [],
    notifications: [],
    attributionClicks: [],
    auditLog: [],
    fraudFlags: [],
    weeklyXpSettlements: [],
  };
}

async function readProgram() {
  try {
    const store = await getBlobStore();
    const data = await store.get(BLOB_KEY, { type: 'json' });
    if (data && typeof data === 'object') {
      return normalizeProgram(data);
    }
  } catch {}
  return defaultProgram();
}

async function writeProgram(data) {
  const normalized = normalizeProgram(data);
  const pending = Array.isArray(normalized._pendingWebPush) ? normalized._pendingWebPush.slice() : [];
  delete normalized._pendingWebPush;
  const store = await getBlobStore();
  await store.setJSON(BLOB_KEY, normalized);
  if (pending.length) {
    try {
      const { flushPendingWebPush } = require('./ambassador-push');
      await flushPendingWebPush(normalized, pending);
    } catch {
      /* push delivery must not block saves */
    }
  }
}

function normalizeProgram(raw) {
  const base = defaultProgram();
  const data = { ...base, ...raw };
  data.settings = { ...base.settings, ...(raw.settings || {}) };
  data.settings.levels = Array.isArray(raw.settings?.levels) && raw.settings.levels.length
    ? raw.settings.levels
    : base.settings.levels;
  data.settings.leaderboard = { ...base.settings.leaderboard, ...(raw.settings?.leaderboard || {}) };
  data.settings.xpRules = { ...base.settings.xpRules, ...(raw.settings?.xpRules || {}) };
  data.settings.weeklyXpRewards = {
    ...base.settings.weeklyXpRewards,
    ...(raw.settings?.weeklyXpRewards || {}),
  };
  if (!Array.isArray(data.settings.weeklyXpRewards.prizes) || !data.settings.weeklyXpRewards.prizes.length) {
    data.settings.weeklyXpRewards.prizes = [3, 2, 1];
  }
  for (const key of [
    'ambassadors', 'invites', 'commissions', 'payouts', 'campaigns', 'challenges',
    'badges', 'content', 'channels', 'messages', 'messageReports', 'ideas',
    'ideaComments', 'notifications', 'attributionClicks', 'auditLog', 'fraudFlags',
    'weeklyXpSettlements',
  ]) {
    if (!Array.isArray(data[key])) data[key] = base[key];
  }
  return data;
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function slugify(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

function pushAudit(program, entry) {
  if (!Array.isArray(program.auditLog)) program.auditLog = [];
  program.auditLog.unshift({
    id: uid('audit'),
    at: new Date().toISOString(),
    ...entry,
  });
  if (program.auditLog.length > 500) program.auditLog.length = 500;
}

/** Build discount rows from active ambassadors (for boutique checkout). */
function ambassadorDiscountRows(program) {
  const settings = program?.settings || {};
  const defaultPct = Number(settings.defaultDiscountPercent) || 10;
  return (program?.ambassadors || [])
    .filter((a) => a && a.status === 'active' && a.promoCode)
    .map((a) => ({
      code: String(a.promoCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32),
      type: 'percent',
      value: Number(a.discountPercent ?? defaultPct) || defaultPct,
      active: true,
      minCart: Number(a.minOrder || 0) || 0,
      ambassadorId: a.id,
      source: 'ambassador',
    }))
    .filter((d) => d.code.length >= 3);
}

/**
 * Merge ambassador promo codes into a boutique store object (in-memory).
 * Does not write blobs — caller decides persistence.
 */
function mergeAmbassadorDiscounts(store, program) {
  const base = store && typeof store === 'object' ? store : {};
  const discounts = Array.isArray(base.discounts) ? base.discounts.map((d) => ({ ...d })) : [];
  const byCode = new Map(
    discounts
      .filter((d) => d && d.code)
      .map((d) => [String(d.code).toUpperCase(), d])
  );

  for (const row of ambassadorDiscountRows(program)) {
    const existing = byCode.get(row.code);
    if (existing) {
      Object.assign(existing, {
        type: existing.type || 'percent',
        value: Number(row.value),
        active: true,
        minCart: Number(existing.minCart) || Number(row.minCart) || 0,
        ambassadorId: row.ambassadorId,
        source: 'ambassador',
      });
    } else {
      discounts.push({ ...row });
      byCode.set(row.code, row);
    }
  }

  return { ...base, discounts };
}

module.exports = {
  BLOB_KEY,
  DEFAULT_LEVELS,
  DEFAULT_BADGES,
  DEFAULT_CHANNELS,
  defaultSettings,
  defaultProgram,
  readProgram,
  writeProgram,
  normalizeProgram,
  uid,
  slugify,
  pushAudit,
  ambassadorDiscountRows,
  mergeAmbassadorDiscounts,
};
