/**
 * Commission, attribution, XP, ranks — modular engine.
 * Idempotent: one order → at most one personal commission set (unique orderId+type).
 */

const { uid } = require('./ambassador-data');

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function monthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function findLevel(settings, monthlySales) {
  const levels = [...(settings.levels || [])].sort((a, b) => (b.minSales || 0) - (a.minSales || 0));
  return levels.find((l) => monthlySales >= (l.minSales || 0)) || levels[levels.length - 1] || {
    id: 'ambassador', name: 'Ambassador', minSales: 0, commission: settings.personalCommission || 10,
  };
}

function nextLevel(settings, current) {
  const levels = [...(settings.levels || [])].sort((a, b) => (a.minSales || 0) - (b.minSales || 0));
  const idx = levels.findIndex((l) => l.id === current?.id);
  if (idx < 0) return levels[1] || null;
  return levels[idx + 1] || null;
}

function personalCommissionRate(ambassador, settings) {
  if (typeof ambassador.customCommission === 'number') return ambassador.customCommission;
  const level = (settings.levels || []).find((l) => l.id === ambassador.rankId);
  if (level && typeof level.commission === 'number') return level.commission;
  return Number(settings.personalCommission) || 10;
}

function commissionExists(program, orderId, type, ambassadorId) {
  return (program.commissions || []).some(
    (c) => c.orderId === orderId && c.type === type && c.ambassadorId === ambassadorId && c.status !== 'reversed'
  );
}

function orderCommissionBase(order) {
  // Commission on product subtotal after discount, before tax/shipping
  const sub = Number(order.subtotal);
  if (Number.isFinite(sub) && sub > 0) return money(sub);
  const total = Number(order.total) || 0;
  const tax = Number(order.tax?.amount) || 0;
  const shipping = Number(order.shipping) || 0;
  return money(Math.max(0, total - tax - shipping));
}

function resolveAttribution(program, order, settings) {
  const code = String(order.discountCode || order.promoCode || '').toUpperCase().trim();
  if (code) {
    const byCode = (program.ambassadors || []).find(
      (a) => a.status === 'active' && String(a.promoCode || '').toUpperCase() === code
    );
    if (byCode) {
      return {
        ambassadorId: byCode.id,
        method: 'promo_code',
        promoCode: code,
        campaignId: order.campaignId || null,
      };
    }
  }

  if (order.ambassadorId) {
    const byId = (program.ambassadors || []).find((a) => a.id === order.ambassadorId && a.status === 'active');
    if (byId) {
      return {
        ambassadorId: byId.id,
        method: order.attributionMethod || 'ambassador_link',
        promoCode: order.promoCode || byId.promoCode,
        campaignId: order.campaignId || null,
      };
    }
  }

  // Cookie / session attribution stored on order by checkout
  if (order.attribution?.ambassadorId) {
    const byAttr = (program.ambassadors || []).find(
      (a) => a.id === order.attribution.ambassadorId && a.status === 'active'
    );
    if (byAttr) {
      const clickedAt = order.attribution.clickedAt ? new Date(order.attribution.clickedAt).getTime() : 0;
      const windowMs = (Number(settings.attributionDays) || 30) * 86400000;
      if (!clickedAt || Date.now() - clickedAt <= windowMs) {
        return {
          ambassadorId: byAttr.id,
          method: order.attribution.method || 'ambassador_link',
          promoCode: order.attribution.promoCode || byAttr.promoCode,
          campaignId: order.attribution.campaignId || null,
        };
      }
    }
  }

  return null;
}

function isSelfReferral(ambassador, order) {
  const email = String(order.customer?.email || '').trim().toLowerCase();
  if (!email) return false;
  if (String(ambassador.email || '').toLowerCase() === email) return true;
  return false;
}

function ensureStats(a) {
  if (!a.stats) {
    a.stats = {
      personalSales: 0,
      personalOrders: 0,
      personalCommission: 0,
      teamBonus: 0,
      totalEarned: 0,
      monthlySales: {},
      conversionClicks: 0,
      promoCodeUses: 0,
      chatMessages: 0,
      ideasSubmitted: 0,
      invitesSent: 0,
      loginDays: 0,
      streakDays: 0,
    };
  }
  if (!a.stats.monthlySales) a.stats.monthlySales = {};
  if (!Number.isFinite(a.stats.conversionClicks)) a.stats.conversionClicks = 0;
  if (!Number.isFinite(a.stats.promoCodeUses)) a.stats.promoCodeUses = 0;
  if (!Number.isFinite(a.stats.chatMessages)) a.stats.chatMessages = 0;
  if (!Number.isFinite(a.stats.ideasSubmitted)) a.stats.ideasSubmitted = 0;
  if (!Number.isFinite(a.stats.invitesSent)) a.stats.invitesSent = 0;
  if (!Number.isFinite(a.stats.loginDays)) a.stats.loginDays = 0;
  if (!Number.isFinite(a.stats.streakDays)) a.stats.streakDays = 0;
  if (!Number.isFinite(a.stats.weeklyXpBonus)) a.stats.weeklyXpBonus = 0;
  return a.stats;
}

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

/** ISO week key in America/Toronto (e.g. 2026-W33). Weeks start Monday. */
function weekKey(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(d).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
  );
  const local = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const dow = local.getUTCDay() || 7; // Mon=1 … Sun=7
  local.setUTCDate(local.getUTCDate() + 4 - dow); // Thursday of this week
  const year = local.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const weekNo = Math.ceil((((local - yearStart) / 86400000) + 1) / 7);
  return `${year}-W${String(weekNo).padStart(2, '0')}`;
}

function previousWeekKey(d = new Date()) {
  return weekKey(new Date(d.getTime() - 7 * 86400000));
}

function ensureXpState(a) {
  if (!a.xpKeys || typeof a.xpKeys !== 'object') a.xpKeys = {};
  if (!a.xpDaily || typeof a.xpDaily !== 'object') a.xpDaily = {};
  if (!a.weeklyXp || typeof a.weeklyXp !== 'object') a.weeklyXp = {};
  if (!Array.isArray(a.xpLog)) a.xpLog = [];
  return a;
}

/**
 * Grant XP with optional one-shot key and daily caps (anti-farm).
 * Returns { granted, amount, reason } or { granted: false }.
 */
function grantXp(ambassador, amount, reason, program, opts = {}) {
  if (!ambassador) return { granted: false };
  ensureXpState(ambassador);
  const n = Math.max(0, Math.round(Number(amount) || 0));
  if (!n) return { granted: false };

  const key = opts.key ? String(opts.key).slice(0, 80) : null;
  if (key && ambassador.xpKeys[key]) return { granted: false, reason: 'already', key };

  const dailyBucket = opts.dailyKey ? String(opts.dailyKey).slice(0, 40) : null;
  const dailyMax = Number.isFinite(Number(opts.dailyMax)) ? Number(opts.dailyMax) : null;
  const today = dayKey();
  if (dailyBucket) {
    if (!ambassador.xpDaily[today] || typeof ambassador.xpDaily[today] !== 'object') {
      ambassador.xpDaily[today] = {};
    }
    const used = Number(ambassador.xpDaily[today][dailyBucket] || 0);
    if (dailyMax != null && used >= dailyMax) {
      return { granted: false, reason: 'daily_cap', dailyKey: dailyBucket };
    }
    ambassador.xpDaily[today][dailyBucket] = used + 1;
  }

  // prune old daily buckets (keep ~14 days)
  const keys = Object.keys(ambassador.xpDaily || {});
  if (keys.length > 20) {
    keys.sort().slice(0, keys.length - 14).forEach((k) => { delete ambassador.xpDaily[k]; });
  }

  if (key) ambassador.xpKeys[key] = new Date().toISOString();

  ambassador.xp = (ambassador.xp || 0) + n;
  if (opts.skipWeekly !== true) {
    const wk = weekKey();
    ambassador.weeklyXp[wk] = (Number(ambassador.weeklyXp[wk]) || 0) + n;
    // Keep ~12 weeks of weekly buckets
    const wks = Object.keys(ambassador.weeklyXp || {}).sort();
    if (wks.length > 16) {
      wks.slice(0, wks.length - 12).forEach((k) => { delete ambassador.weeklyXp[k]; });
    }
  }
  const entry = {
    amount: n,
    reason: reason || 'Progression',
    at: new Date().toISOString(),
    key: key || null,
  };
  ambassador.xpLog.unshift(entry);
  if (ambassador.xpLog.length > 80) ambassador.xpLog.length = 80;

  if (program && opts.notify !== false) {
    pushNotification(program, {
      ambassadorId: ambassador.id,
      type: 'xp',
      title: `+${n} XP`,
      body: reason || 'Progression',
      data: { xp: n, key },
    });
  }
  return { granted: true, amount: n, reason: entry.reason, key };
}

/** Back-compat wrapper */
function addXp(ambassador, amount, reason, program, opts) {
  return grantXp(ambassador, amount, reason, program, opts || {});
}

function grantMilestoneXp(ambassador, count, milestones, prefix, label, program, extraOpts = {}) {
  const map = milestones && typeof milestones === 'object' ? milestones : {};
  const n = Number(count) || 0;
  let total = 0;
  for (const [threshold, xp] of Object.entries(map)) {
    const t = Number(threshold);
    if (!Number.isFinite(t) || n < t) continue;
    const r = grantXp(
      ambassador,
      xp,
      `${label} · palier ${t}`,
      program,
      { key: `${prefix}:${t}`, ...extraOpts }
    );
    if (r.granted) total += r.amount;
  }
  return total;
}

function awardLinkClickXp(ambassador, program) {
  const rules = program.settings?.xpRules || {};
  const stats = ensureStats(ambassador);
  stats.conversionClicks = (stats.conversionClicks || 0) + 1;
  // small XP per click with daily cap (anti-refresh farm)
  grantXp(ambassador, rules.linkClick || 2, 'Clic sur ton lien', program, {
    dailyKey: 'link_click',
    dailyMax: 20,
    notify: false,
  });
  grantMilestoneXp(
    ambassador,
    stats.conversionClicks,
    rules.linkClickMilestones,
    'clicks',
    'Clics lien',
    program
  );
  return stats.conversionClicks;
}

function awardPromoCodeUseXp(ambassador, program, orderId) {
  const rules = program.settings?.xpRules || {};
  const stats = ensureStats(ambassador);
  stats.promoCodeUses = (stats.promoCodeUses || 0) + 1;
  grantXp(ambassador, rules.promoCodeUse || 15, 'Code promo utilisé', program, {
    key: orderId ? `promo:${orderId}` : null,
  });
  grantMilestoneXp(
    ambassador,
    stats.promoCodeUses,
    rules.promoCodeMilestones,
    'promo_uses',
    'Usages code',
    program
  );
  return stats.promoCodeUses;
}

function awardDailyLoginXp(ambassador, program) {
  const rules = program.settings?.xpRules || {};
  const stats = ensureStats(ambassador);
  const today = dayKey();
  const yesterday = dayKey(new Date(Date.now() - 86400000));
  const last = ambassador.lastLoginDay || null;

  const loginXp = grantXp(ambassador, rules.dailyLogin || 15, 'Connexion du jour', program, {
    key: `login:${today}`,
  });

  if (loginXp.granted) {
    stats.loginDays = (stats.loginDays || 0) + 1;
    if (last === yesterday) stats.streakDays = (stats.streakDays || 0) + 1;
    else stats.streakDays = 1;
    ambassador.lastLoginDay = today;
    ambassador.streakDays = stats.streakDays;

    if (stats.streakDays >= 7) {
      grantXp(ambassador, rules.streak7 || 75, 'Série 7 jours', program, { key: 'streak:7' });
      awardBadge(ambassador, 'streak_7', program);
    }
    if (stats.streakDays >= 30) {
      grantXp(ambassador, rules.streak30 || 200, 'Série 30 jours', program, { key: 'streak:30' });
      awardBadge(ambassador, 'streak_30', program);
    }
  }

  // Reward parent if team member is active today
  if (ambassador.referredBy && loginXp.granted) {
    const parent = (program.ambassadors || []).find(
      (a) => a.id === ambassador.referredBy && a.status === 'active'
    );
    if (parent) {
      grantXp(parent, rules.teamMemberActive || 10, `Équipe active · ${ambassador.displayName || 'membre'}`, program, {
        key: `team_active:${today}:${ambassador.id}`,
        dailyKey: 'team_active',
        dailyMax: rules.teamActiveDailyMax || 5,
      });
    }
  }

  return loginXp;
}

function awardChatXp(ambassador, program) {
  const rules = program.settings?.xpRules || {};
  const stats = ensureStats(ambassador);
  stats.chatMessages = (stats.chatMessages || 0) + 1;
  return grantXp(ambassador, rules.chatMessage || 5, 'Message dans le chat', program, {
    dailyKey: 'chat',
    dailyMax: rules.chatDailyMax || 5,
  });
}

function awardIdeaSubmitXp(ambassador, program, ideaId) {
  const rules = program.settings?.xpRules || {};
  const stats = ensureStats(ambassador);
  stats.ideasSubmitted = (stats.ideasSubmitted || 0) + 1;
  return grantXp(ambassador, rules.ideaSubmit || 25, 'Idée promo soumise', program, {
    key: ideaId ? `idea:${ideaId}` : null,
    dailyKey: 'idea',
    dailyMax: rules.ideaDailyMax || 3,
  });
}

function awardInviteSentXp(ambassador, program, inviteId) {
  const rules = program.settings?.xpRules || {};
  const stats = ensureStats(ambassador);
  stats.invitesSent = (stats.invitesSent || 0) + 1;
  return grantXp(ambassador, rules.inviteSent || 20, 'Invitation ambassadeur envoyée', program, {
    key: inviteId ? `invite:${inviteId}` : `invite:${Date.now()}`,
  });
}

function awardProfileCompleteXp(ambassador, program, extraOpts = {}) {
  const rules = program.settings?.xpRules || {};
  const hasPhoto = Boolean(ambassador.photoUrl);
  const hasBio = Boolean(String(ambassador.bio || '').trim().length >= 12);
  if (!hasPhoto || !hasBio) return { granted: false };
  return grantXp(ambassador, rules.profileComplete || 40, 'Profil complété', program, {
    key: 'profile:complete',
    ...extraOpts,
  });
}

function xpGuide(settings) {
  const r = settings?.xpRules || {};
  return [
    { action: 'Connexion quotidienne', xp: r.dailyLogin || 15 },
    { action: 'Clic sur ton lien (max 20/jour)', xp: r.linkClick || 2 },
    { action: 'Paliers de clics (1, 10, 25, 50…)', xp: 'bonus' },
    { action: 'Code promo utilisé sur une commande', xp: r.promoCodeUse || 15 },
    { action: 'Vente (par 100$)', xp: r.per100Sales || 50 },
    { action: 'Message chat (max 5/jour)', xp: r.chatMessage || 5 },
    { action: 'Idée promo soumise (max 3/jour)', xp: r.ideaSubmit || 25 },
    { action: 'Idée approuvée', xp: r.approvedContent || 100 },
    { action: 'Invitation ambassadeur', xp: r.inviteSent || 20 },
    { action: 'Filleul inscrit / activé', xp: r.activeReferral || 100 },
    { action: 'Membre d’équipe actif aujourd’hui', xp: r.teamMemberActive || 10 },
    { action: 'Profil complété (photo + bio)', xp: r.profileComplete || 40 },
    { action: 'Série 7 / 30 jours', xp: `${r.streak7 || 75} / ${r.streak30 || 200}` },
    { action: 'Top 3 XP de la semaine', xp: '3$ / 2$ / 1$' },
  ];
}

/**
 * Rebuild XP from real activity (fixes onboarding-farm inflation).
 * Does not notify; writes a clean xpLog.
 */
function recalculateAmbassadorXp(ambassador, program) {
  const rules = program.settings?.xpRules || {};
  ensureStats(ambassador);
  ensureXpState(ambassador);
  ambassador.xpKeys = {};
  ambassador.xpDaily = {};
  ambassador.weeklyXp = {};
  ambassador.xpLog = [];
  ambassador.xp = 0;

  const quiet = { notify: false };

  if (ambassador.onboardingComplete) {
    grantXp(ambassador, rules.completeTraining || 100, 'Onboarding terminé', program, {
      key: 'onboarding:complete',
      ...quiet,
    });
  }

  awardProfileCompleteXp(ambassador, program, quiet);

  const stats = ensureStats(ambassador);
  const clicks = Number(stats.conversionClicks) || 0;
  if (clicks > 0) {
    const dailyClicks = Math.min(clicks, 20);
    grantXp(ambassador, dailyClicks * (rules.linkClick || 2), `Clics lien (${dailyClicks})`, program, {
      key: 'recalc:link_clicks',
      ...quiet,
    });
    grantMilestoneXp(
      ambassador,
      clicks,
      rules.linkClickMilestones,
      'clicks',
      'Clics lien',
      program,
      quiet
    );
  }

  const promoUses = Number(stats.promoCodeUses) || 0;
  if (promoUses > 0) {
    grantXp(ambassador, promoUses * (rules.promoCodeUse || 15), `Codes utilisés (${promoUses})`, program, {
      key: 'recalc:promo_uses',
      ...quiet,
    });
    grantMilestoneXp(
      ambassador,
      promoUses,
      rules.promoCodeMilestones,
      'promo_uses',
      'Usages code',
      program,
      quiet
    );
  }

  const orders = Number(stats.personalOrders) || 0;
  const sales = Number(stats.personalSales) || 0;
  if (orders >= 1) {
    grantXp(ambassador, rules.firstSale || 100, 'Première vente', program, { key: 'sale:first', ...quiet });
  }
  const blocks = Math.floor(sales / 100);
  if (blocks > 0) {
    grantXp(ambassador, blocks * (rules.per100Sales || 50), `Ventes ${sales}$`, program, {
      key: 'recalc:sales_blocks',
      ...quiet,
    });
  }

  const chat = Math.min(Number(stats.chatMessages) || 0, 40);
  if (chat > 0) {
    grantXp(ambassador, chat * (rules.chatMessage || 5), `Messages chat (${chat})`, program, {
      key: 'recalc:chat',
      ...quiet,
    });
  }

  const ideas = Math.min(Number(stats.ideasSubmitted) || 0, 20);
  if (ideas > 0) {
    grantXp(ambassador, ideas * (rules.ideaSubmit || 25), `Idées soumises (${ideas})`, program, {
      key: 'recalc:ideas',
      ...quiet,
    });
  }

  const invites = Math.min(Number(stats.invitesSent) || 0, 30);
  if (invites > 0) {
    grantXp(ambassador, invites * (rules.inviteSent || 20), `Invitations (${invites})`, program, {
      key: 'recalc:invites',
      ...quiet,
    });
  }

  const logins = Math.min(Number(stats.loginDays) || 0, 60);
  if (logins > 0) {
    grantXp(ambassador, logins * (rules.dailyLogin || 15), `Connexions (${logins}j)`, program, {
      key: 'recalc:logins',
      ...quiet,
    });
  }

  const streak = Number(stats.streakDays || ambassador.streakDays) || 0;
  if (streak >= 7) {
    grantXp(ambassador, rules.streak7 || 75, 'Série 7 jours', program, { key: 'streak:7', ...quiet });
  }
  if (streak >= 30) {
    grantXp(ambassador, rules.streak30 || 200, 'Série 30 jours', program, { key: 'streak:30', ...quiet });
  }

  // Active referrals (people you brought who are active)
  const kids = (program.ambassadors || []).filter(
    (a) => a.referredBy === ambassador.id && a.status === 'active'
  );
  for (const kid of kids) {
    grantXp(
      ambassador,
      rules.activeReferral || 100,
      `Filleul actif · ${kid.displayName || kid.slug || kid.id}`,
      program,
      { key: `referral_active:${kid.id}`, ...quiet }
    );
  }

  // Approved ideas bonus
  const approvedIdeas = (program.ideas || []).filter(
    (i) => i.ambassadorId === ambassador.id && (i.status === 'approved' || i.status === 'implemented')
  );
  for (const idea of approvedIdeas) {
    grantXp(ambassador, rules.approvedContent || 100, 'Idée approuvée', program, {
      key: `idea_approved:${idea.id}`,
      ...quiet,
    });
  }

  return {
    id: ambassador.id,
    displayName: ambassador.displayName,
    xp: ambassador.xp || 0,
    referrals: kids.length,
  };
}

function recalculateAllXp(program) {
  const results = [];
  for (const amb of program.ambassadors || []) {
    results.push(recalculateAmbassadorXp(amb, program));
  }
  results.sort((a, b) => (b.xp || 0) - (a.xp || 0));
  return results;
}

function pushNotification(program, n) {
  if (!Array.isArray(program.notifications)) program.notifications = [];
  const notification = {
    id: uid('notif'),
    read: false,
    createdAt: new Date().toISOString(),
    ...n,
  };
  program.notifications.unshift(notification);
  if (program.notifications.length > 2000) program.notifications.length = 2000;
  if (notification.ambassadorId && notification.type !== 'community') {
    if (!Array.isArray(program._pendingWebPush)) program._pendingWebPush = [];
    program._pendingWebPush.push(notification);
  }
}

function awardBadge(ambassador, badgeId, program) {
  if (!Array.isArray(ambassador.badges)) ambassador.badges = [];
  if (ambassador.badges.some((b) => b.id === badgeId)) return;
  const def = (program.badges || []).find((b) => b.id === badgeId);
  ambassador.badges.push({
    id: badgeId,
    name: def?.name || badgeId,
    earnedAt: new Date().toISOString(),
  });
  pushNotification(program, {
    ambassadorId: ambassador.id,
    type: 'badge',
    title: 'Nouveau badge',
    body: def?.name || badgeId,
    data: { badgeId },
  });
}

function updateRank(ambassador, settings, program) {
  const stats = ensureStats(ambassador);
  const monthly = Number(stats.monthlySales[monthKey()] || 0);
  const level = findLevel(settings, monthly);
  const prev = ambassador.rankId;
  ambassador.rankId = level.id;
  if (prev && prev !== level.id) {
    pushNotification(program, {
      ambassadorId: ambassador.id,
      type: 'rank',
      title: 'Nouveau rang',
      body: `Tu es maintenant ${level.name}`,
      data: { rankId: level.id },
    });
    if (level.id === 'leader') awardBadge(ambassador, 'leader', program);
    // Sync role for leader/elite
    if (level.id === 'leader') ambassador.role = 'AMBASSADOR_LEADER';
    else if (level.id === 'elite' || level.id === 'pro') ambassador.role = 'AMBASSADOR_ELITE';
  }
  return { level, monthly, next: nextLevel(settings, level) };
}

function createCommission(program, {
  ambassadorId, orderId, type, rate, baseAmount, amount, method, promoCode, campaignId, parentCommissionId,
}) {
  const pendingDays = Number.isFinite(Number(program.settings?.pendingDays))
    ? Number(program.settings.pendingDays)
    : 14;
  const availableAt = new Date(Date.now() + pendingDays * 86400000).toISOString();
  const c = {
    id: uid('com'),
    ambassadorId,
    orderId,
    type, // personal | referral_l1 | referral_l2 | campaign_bonus
    rate,
    baseAmount: money(baseAmount),
    amount: money(amount),
    status: 'pending',
    attributionMethod: method || null,
    promoCode: promoCode || null,
    campaignId: campaignId || null,
    parentCommissionId: parentCommissionId || null,
    createdAt: new Date().toISOString(),
    availableAt,
    approvedAt: null,
    paidAt: null,
    reversedAt: null,
  };
  program.commissions.unshift(c);
  return c;
}

/**
 * Process a paid order into commissions. Idempotent.
 * Returns { created, skipped, reason, commissions }
 */
function processPaidOrder(program, order, opts = {}) {
  const settings = program.settings || {};
  const result = { created: [], skipped: false, reason: null, fraud: null };

  if (!order?.id) {
    result.skipped = true;
    result.reason = 'no_order';
    return result;
  }

  const attr = opts.forceAttribution || resolveAttribution(program, order, settings);
  if (!attr) {
    result.skipped = true;
    result.reason = 'no_attribution';
    return result;
  }

  const ambassador = (program.ambassadors || []).find((a) => a.id === attr.ambassadorId);
  if (!ambassador || ambassador.status !== 'active') {
    result.skipped = true;
    result.reason = 'ambassador_inactive';
    return result;
  }

  if (isSelfReferral(ambassador, order)) {
    result.skipped = true;
    result.reason = 'self_referral';
    result.fraud = {
      id: uid('fraud'),
      type: 'self_referral',
      status: 'needs_review',
      ambassadorId: ambassador.id,
      orderId: order.id,
      createdAt: new Date().toISOString(),
      note: 'Ambassadeur et client partagent le même email',
    };
    if (!Array.isArray(program.fraudFlags)) program.fraudFlags = [];
    program.fraudFlags.unshift(result.fraud);
    return result;
  }

  if (commissionExists(program, order.id, 'personal', ambassador.id)) {
    result.skipped = true;
    result.reason = 'already_processed';
    return result;
  }

  const base = orderCommissionBase(order);
  if (base <= 0) {
    result.skipped = true;
    result.reason = 'zero_base';
    return result;
  }

  const rate = personalCommissionRate(ambassador, settings);
  const amount = money(base * (rate / 100));
  const personal = createCommission(program, {
    ambassadorId: ambassador.id,
    orderId: order.id,
    type: 'personal',
    rate,
    baseAmount: base,
    amount,
    method: attr.method,
    promoCode: attr.promoCode,
    campaignId: attr.campaignId,
  });
  result.created.push(personal);

  // Attach attribution on order object (caller persists store)
  order.ambassadorId = ambassador.id;
  order.attributionMethod = attr.method;
  order.promoCode = attr.promoCode || order.discountCode || null;
  order.campaignId = attr.campaignId || null;
  order.commissionStatus = 'pending';
  order.commissionAmount = amount;
  order.commissionCreatedAt = personal.createdAt;
  order.commissionAvailableAt = personal.availableAt;

  const stats = ensureStats(ambassador);
  stats.personalSales = money(stats.personalSales + base);
  stats.personalOrders = (stats.personalOrders || 0) + 1;
  stats.personalCommission = money(stats.personalCommission + amount);
  stats.totalEarned = money(stats.totalEarned + amount);
  const mk = monthKey();
  stats.monthlySales[mk] = money((stats.monthlySales[mk] || 0) + base);

  const wasFirst = stats.personalOrders === 1;
  if (wasFirst) {
    addXp(ambassador, settings.xpRules?.firstSale || 100, 'Première vente', program, { key: 'sale:first' });
    awardBadge(ambassador, 'first_sale', program);
  }
  const blocks = Math.floor(base / 100);
  if (blocks > 0) {
    addXp(ambassador, blocks * (settings.xpRules?.per100Sales || 50), `Vente ${base}$`, program, {
      key: `sale:${order.id}:blocks`,
    });
  }
  if (stats.personalOrders >= 10) awardBadge(ambassador, 'orders_10', program);
  if (stats.personalSales >= 500) awardBadge(ambassador, 'club_500', program);
  if (stats.personalSales >= 1000) awardBadge(ambassador, 'club_1000', program);

  const monthly = stats.monthlySales[mk] || 0;
  if (monthly >= 500) {
    addXp(ambassador, settings.xpRules?.monthly500 || 250, '500$ ce mois', program, { key: `monthly500:${mk}` });
  }
  if (monthly >= 1000) {
    addXp(ambassador, settings.xpRules?.monthly1000 || 500, '1000$ ce mois', program, { key: `monthly1000:${mk}` });
  }

  // Extra XP when the order used their promo code
  if (attr.method === 'promo_code' || String(order.discountCode || '').toUpperCase() === String(ambassador.promoCode || '').toUpperCase()) {
    awardPromoCodeUseXp(ambassador, program, order.id);
  }

  updateRank(ambassador, settings, program);

  pushNotification(program, {
    ambassadorId: ambassador.id,
    type: 'sale',
    title: 'Nouvelle vente',
    body: `Commande #${order.id} · Commission ${amount.toFixed(2)}$`,
    data: { orderId: order.id, amount },
  });

  // Referral L1 / L2 — only on real product sales
  if (ambassador.referredBy) {
    const l1 = (program.ambassadors || []).find((a) => a.id === ambassador.referredBy && a.status === 'active');
    if (l1 && !commissionExists(program, order.id, 'referral_l1', l1.id)) {
      const r1 = Number(settings.referralLevel1) || 0;
      if (r1 > 0) {
        const a1 = money(base * (r1 / 100));
        const c1 = createCommission(program, {
          ambassadorId: l1.id,
          orderId: order.id,
          type: 'referral_l1',
          rate: r1,
          baseAmount: base,
          amount: a1,
          method: 'referral',
          parentCommissionId: personal.id,
        });
        result.created.push(c1);
        const s1 = ensureStats(l1);
        s1.teamBonus = money((s1.teamBonus || 0) + a1);
        s1.totalEarned = money((s1.totalEarned || 0) + a1);
        pushNotification(program, {
          ambassadorId: l1.id,
          type: 'commission',
          title: 'Bonus équipe L1',
          body: `+${a1.toFixed(2)}$ sur une vente de ton équipe`,
          data: { orderId: order.id, amount: a1 },
        });

        if (l1.referredBy) {
          const l2 = (program.ambassadors || []).find((a) => a.id === l1.referredBy && a.status === 'active');
          if (l2 && !commissionExists(program, order.id, 'referral_l2', l2.id)) {
            const r2 = Number(settings.referralLevel2) || 0;
            if (r2 > 0) {
              const a2 = money(base * (r2 / 100));
              const c2 = createCommission(program, {
                ambassadorId: l2.id,
                orderId: order.id,
                type: 'referral_l2',
                rate: r2,
                baseAmount: base,
                amount: a2,
                method: 'referral',
                parentCommissionId: personal.id,
              });
              result.created.push(c2);
              const s2 = ensureStats(l2);
              s2.teamBonus = money((s2.teamBonus || 0) + a2);
              s2.totalEarned = money((s2.totalEarned || 0) + a2);
              pushNotification(program, {
                ambassadorId: l2.id,
                type: 'commission',
                title: 'Bonus équipe L2',
                body: `+${a2.toFixed(2)}$ (niveau 2)`,
                data: { orderId: order.id, amount: a2 },
              });
            }
          }
        }
      }
    }
  }

  return result;
}

function matureCommissions(program, now = Date.now()) {
  let matured = 0;
  for (const c of program.commissions || []) {
    if (c.status === 'pending' && c.availableAt && new Date(c.availableAt).getTime() <= now) {
      c.status = 'available';
      c.approvedAt = new Date().toISOString();
      matured += 1;
      pushNotification(program, {
        ambassadorId: c.ambassadorId,
        type: 'commission',
        title: 'Commission disponible',
        body: `${Number(c.amount).toFixed(2)}$ est maintenant disponible`,
        data: { commissionId: c.id },
      });
    }
  }
  return matured;
}

function reverseCommissionsForOrder(program, orderId, reason = 'refund') {
  const reversed = [];
  for (const c of program.commissions || []) {
    if (c.orderId === orderId && c.status !== 'reversed' && c.status !== 'paid') {
      c.status = 'reversed';
      c.reversedAt = new Date().toISOString();
      c.reverseReason = reason;
      reversed.push(c);
      const amb = (program.ambassadors || []).find((a) => a.id === c.ambassadorId);
      if (amb) {
        const stats = ensureStats(amb);
        if (c.type === 'personal') {
          stats.personalCommission = money(Math.max(0, (stats.personalCommission || 0) - c.amount));
          stats.personalSales = money(Math.max(0, (stats.personalSales || 0) - c.baseAmount));
          stats.personalOrders = Math.max(0, (stats.personalOrders || 0) - 1);
        } else if (c.type === 'weekly_xp_bonus') {
          stats.weeklyXpBonus = money(Math.max(0, (stats.weeklyXpBonus || 0) - c.amount));
        } else {
          stats.teamBonus = money(Math.max(0, (stats.teamBonus || 0) - c.amount));
        }
        stats.totalEarned = money(Math.max(0, (stats.totalEarned || 0) - c.amount));
        pushNotification(program, {
          ambassadorId: amb.id,
          type: 'commission',
          title: 'Commission annulée',
          body: `Commande #${orderId} · ${reason}`,
          data: { orderId, commissionId: c.id },
        });
      }
    }
  }
  return reversed;
}

function buildTeamTree(program, rootId, depth = 3) {
  const ambassadors = program.ambassadors || [];
  function children(id, d) {
    if (d <= 0) return [];
    return ambassadors
      .filter((a) => a.referredBy === id && a.status !== 'rejected')
      .map((a) => ({
        id: a.id,
        displayName: a.displayName,
        slug: a.slug,
        rankId: a.rankId,
        status: a.status,
        photoUrl: a.photoUrl || '',
        xp: a.xp || 0,
        personalSales: a.stats?.personalSales || 0,
        personalOrders: a.stats?.personalOrders || 0,
        children: children(a.id, d - 1),
      }));
  }
  const root = ambassadors.find((a) => a.id === rootId);
  if (!root) return null;
  return {
    id: root.id,
    displayName: root.displayName,
    slug: root.slug,
    rankId: root.rankId,
    status: root.status,
    photoUrl: root.photoUrl || '',
    xp: root.xp || 0,
    personalSales: root.stats?.personalSales || 0,
    children: children(rootId, depth),
  };
}

function teamStats(program, rootId) {
  const tree = buildTeamTree(program, rootId, 10);
  let direct = 0;
  let active = 0;
  let sales = 0;
  let orders = 0;
  let xp = 0;
  function walk(nodes, isDirect) {
    for (const n of nodes || []) {
      if (isDirect) direct += 1;
      if (n.status === 'active') active += 1;
      sales += Number(n.personalSales) || 0;
      orders += Number(n.personalOrders) || 0;
      xp += Number(n.xp) || 0;
      walk(n.children, false);
    }
  }
  if (tree) walk(tree.children, true);
  return { direct, active, sales: money(sales), orders, xp };
}

function leaderboard(program, limit = 20, opts = {}) {
  const cfg = program.settings?.leaderboard || {};
  // Ambassadors never see $ on the public board — admin only via includeSales
  const includeSales = opts.includeSales === true;
  const byLifetime = opts.by === 'lifetime' || includeSales;
  const week = opts.weekKey || weekKey();
  const list = (program.ambassadors || [])
    .filter((a) => a.status === 'active')
    .map((a) => {
      const weekly = Number(a.weeklyXp?.[week] || 0);
      const row = {
        id: a.id,
        rankId: a.rankId,
        xp: byLifetime ? (a.xp || 0) : weekly,
        weeklyXp: weekly,
        lifetimeXp: a.xp || 0,
      };
      if (cfg.showNames !== false) row.displayName = a.displayName;
      if (cfg.showPhotos !== false) row.photoUrl = a.photoUrl || '';
      if (includeSales) {
        row.sales = a.stats?.personalSales || 0;
        row.orders = a.stats?.personalOrders || 0;
        row.monthlySales = a.stats?.monthlySales?.[monthKey()] || 0;
      }
      if (cfg.showXp === false) {
        delete row.xp;
        delete row.weeklyXp;
        delete row.lifetimeXp;
      }
      return row;
    })
    .sort((a, b) => {
      if (includeSales) {
        return (b.monthlySales ?? b.sales ?? 0) - (a.monthlySales ?? a.sales ?? 0)
          || (b.lifetimeXp || b.xp || 0) - (a.lifetimeXp || a.xp || 0);
      }
      return (b.xp || 0) - (a.xp || 0) || (b.lifetimeXp || 0) - (a.lifetimeXp || 0);
    })
    .slice(0, limit);

  return list.map((row, i) => ({ ...row, place: i + 1 }));
}

/**
 * Settle weekly XP contest for past weeks: 1st=$3, 2nd=$2, 3rd=$1 (configurable).
 * Idempotent per week. Credits available commission (payout-ready bonus).
 */
function settleWeeklyXpRewards(program, now = new Date()) {
  const rewards = program.settings?.weeklyXpRewards || { enabled: true, prizes: [3, 2, 1] };
  if (rewards.enabled === false) return { settled: [] };

  const prizes = Array.isArray(rewards.prizes) && rewards.prizes.length
    ? rewards.prizes.map((n) => money(n)).filter((n) => n > 0)
    : [3, 2, 1];

  if (!Array.isArray(program.weeklyXpSettlements)) program.weeklyXpSettlements = [];
  const settledKeys = new Set(program.weeklyXpSettlements.map((s) => s.weekKey));
  const current = weekKey(now);
  const weeks = new Set([previousWeekKey(now)]);
  for (const a of program.ambassadors || []) {
    for (const wk of Object.keys(a.weeklyXp || {})) {
      if (wk < current) weeks.add(wk);
    }
  }

  const settled = [];
  for (const wk of [...weeks].sort()) {
    if (settledKeys.has(wk) || wk >= current) continue;
    const entry = settleOneWeeklyXpWeek(program, wk, prizes);
    settled.push(entry);
  }
  return { settled };
}

function settleOneWeeklyXpWeek(program, wk, prizes) {
  const ranked = (program.ambassadors || [])
    .filter((a) => a.status === 'active')
    .map((a) => ({
      id: a.id,
      displayName: a.displayName,
      weeklyXp: Number(a.weeklyXp?.[wk] || 0),
    }))
    .filter((a) => a.weeklyXp > 0)
    .sort((a, b) => b.weeklyXp - a.weeklyXp || String(a.id).localeCompare(String(b.id)));

  const winners = [];
  const created = [];
  for (let i = 0; i < prizes.length; i += 1) {
    const ambRow = ranked[i];
    if (!ambRow) break;
    const amount = prizes[i];
    if (!(amount > 0)) continue;
    const amb = (program.ambassadors || []).find((a) => a.id === ambRow.id);
    if (!amb) continue;

    const orderId = `weekly_xp_${wk}`;
    if (commissionExists(program, orderId, 'weekly_xp_bonus', amb.id)) {
      winners.push({
        place: i + 1,
        ambassadorId: amb.id,
        displayName: amb.displayName,
        weeklyXp: ambRow.weeklyXp,
        amount,
        skipped: true,
      });
      continue;
    }

    const nowIso = new Date().toISOString();
    const c = {
      id: uid('com'),
      ambassadorId: amb.id,
      orderId,
      type: 'weekly_xp_bonus',
      rate: 0,
      baseAmount: 0,
      amount: money(amount),
      status: 'available',
      attributionMethod: 'weekly_xp',
      promoCode: null,
      campaignId: null,
      parentCommissionId: null,
      weekKey: wk,
      place: i + 1,
      createdAt: nowIso,
      availableAt: nowIso,
      approvedAt: nowIso,
      paidAt: null,
      reversedAt: null,
    };
    program.commissions.unshift(c);
    created.push(c);

    const stats = ensureStats(amb);
    stats.weeklyXpBonus = money((stats.weeklyXpBonus || 0) + amount);
    stats.totalEarned = money((stats.totalEarned || 0) + amount);

    pushNotification(program, {
      ambassadorId: amb.id,
      type: 'commission',
      title: `Top ${i + 1} XP de la semaine`,
      body: `Récompense +${amount.toFixed(2)}$ (semaine ${wk}) · ${ambRow.weeklyXp} XP`,
      data: { weekKey: wk, place: i + 1, amount, commissionId: c.id, view: 'sales' },
    });

    winners.push({
      place: i + 1,
      ambassadorId: amb.id,
      displayName: amb.displayName,
      weeklyXp: ambRow.weeklyXp,
      amount,
      commissionId: c.id,
    });
  }

  const settlement = {
    weekKey: wk,
    settledAt: new Date().toISOString(),
    prizes,
    winners,
    createdCount: created.length,
  };
  program.weeklyXpSettlements.unshift(settlement);
  if (program.weeklyXpSettlements.length > 52) program.weeklyXpSettlements.length = 52;
  return settlement;
}

function weeklyXpContestInfo(program, now = new Date()) {
  const rewards = program.settings?.weeklyXpRewards || { enabled: true, prizes: [3, 2, 1] };
  const week = weekKey(now);
  const board = leaderboard(program, 10, { weekKey: week });
  const last = (program.weeklyXpSettlements || [])[0] || null;
  return {
    enabled: rewards.enabled !== false,
    weekKey: week,
    prizes: rewards.prizes || [3, 2, 1],
    leaderboard: board,
    lastSettlement: last
      ? {
          weekKey: last.weekKey,
          settledAt: last.settledAt,
          winners: last.winners || [],
        }
      : null,
  };
}

function sanitizeOrderForAmbassador(order, commission) {
  return {
    id: order.id,
    status: order.status,
    paidAt: order.paidAt,
    items: (order.items || []).map((i) => ({
      name: i.name,
      qty: i.qty,
      size: i.size || null,
    })),
    subtotal: order.subtotal,
    total: order.total,
    commissionAmount: commission?.amount ?? order.commissionAmount,
    commissionStatus: commission?.status ?? order.commissionStatus,
    attributionMethod: order.attributionMethod,
    createdAt: order.date || order.createdAt,
  };
}

module.exports = {
  money,
  monthKey,
  dayKey,
  weekKey,
  previousWeekKey,
  findLevel,
  nextLevel,
  personalCommissionRate,
  resolveAttribution,
  processPaidOrder,
  matureCommissions,
  reverseCommissionsForOrder,
  buildTeamTree,
  teamStats,
  leaderboard,
  settleWeeklyXpRewards,
  weeklyXpContestInfo,
  updateRank,
  addXp,
  grantXp,
  awardBadge,
  pushNotification,
  ensureStats,
  ensureXpState,
  sanitizeOrderForAmbassador,
  orderCommissionBase,
  awardLinkClickXp,
  awardPromoCodeUseXp,
  awardDailyLoginXp,
  awardChatXp,
  awardIdeaSubmitXp,
  awardInviteSentXp,
  awardProfileCompleteXp,
  xpGuide,
  recalculateAmbassadorXp,
  recalculateAllXp,
};
