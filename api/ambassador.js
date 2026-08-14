/**
 * Public + ambassador API — MENES Ambassador PWA backend.
 * Actions via ?action= or body.action
 */

const { setLambdaEvent, readSiteStore, writeSiteStore, resolveSiteId } = require('../lib/platform');
const { corsHeaders } = require('../lib/cors');
const {
  readProgram, writeProgram, uid, slugify, pushAudit,
} = require('../lib/ambassador-data');
const {
  hashPassword, verifyPassword, signToken, requireAmbassador, publicAmbassador,
  defaultNotificationPrefs, normalizeRole, ROLES,
} = require('../lib/ambassador-auth');
const {
  matureCommissions, leaderboard, buildTeamTree, teamStats, updateRank,
  ensureStats, sanitizeOrderForAmbassador, findLevel, nextLevel, monthKey,
  pushNotification, addXp, awardBadge,
  awardDailyLoginXp, awardChatXp, awardIdeaSubmitXp, awardInviteSentXp,
  awardProfileCompleteXp, xpGuide, ensureXpState,
  settleWeeklyXpRewards, weeklyXpContestInfo, weekKey,
} = require('../lib/ambassador-engine');
const { sendAmbassadorWelcome, sendAmbassadorInvite } = require('../lib/ambassador-email');
const {
  pushConfigured, getPublicKey, upsertSubscription, removeSubscription, notifyCommunityMessage,
} = require('../lib/ambassador-push');

function json(headers, status, body) {
  return { statusCode: status, headers, body: JSON.stringify(body) };
}

function parseBody(event) {
  try { return JSON.parse(event.body || '{}'); } catch { return {}; }
}

function actionOf(event, body) {
  return String(event.queryStringParameters?.action || body.action || '').trim();
}

function uniqueSlug(program, base, excludeId) {
  let slug = slugify(base) || `amb-${Date.now().toString(36)}`;
  let n = 0;
  while (program.ambassadors.some((a) => a.slug === slug && a.id !== excludeId)) {
    n += 1;
    slug = `${slugify(base)}-${n}`;
  }
  return slug;
}

function uniquePromo(program, base, excludeId) {
  let code = String(base || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'MENES';
  if (!/\d$/.test(code)) code = `${code}10`;
  let n = 0;
  let candidate = code;
  while (program.ambassadors.some((a) => String(a.promoCode).toUpperCase() === candidate && a.id !== excludeId)) {
    n += 1;
    candidate = `${code}${n}`;
  }
  return candidate;
}

async function syncPromoToStore(ambassador, settings, { previousCode } = {}) {
  try {
    const siteId = 'menes';
    const store = await readSiteStore(siteId);
    if (!Array.isArray(store.discounts)) store.discounts = [];
    const code = String(ambassador.promoCode || '').toUpperCase();
    const prev = String(previousCode || '').toUpperCase();

    // Deactivate previous ambassador code if renamed
    if (prev && prev !== code) {
      store.discounts.forEach((d) => {
        if (String(d.code || '').toUpperCase() === prev && d.ambassadorId === ambassador.id) {
          d.active = false;
          d.replacedBy = code;
        }
      });
    }

    // Also deactivate any other store discounts still tied to this ambassador with a different code
    store.discounts.forEach((d) => {
      if (d.ambassadorId === ambassador.id && String(d.code || '').toUpperCase() !== code) {
        d.active = false;
      }
    });

    const existing = store.discounts.find((d) => String(d.code || '').toUpperCase() === code);
    const discount = {
      code,
      type: 'percent',
      value: Number(ambassador.discountPercent ?? settings.defaultDiscountPercent ?? 10),
      active: ambassador.status === 'active',
      minCart: Number(ambassador.minOrder || 0),
      ambassadorId: ambassador.id,
      source: 'ambassador',
    };
    if (existing) Object.assign(existing, discount);
    else store.discounts.push(discount);
    await writeSiteStore(siteId, store);
  } catch (e) {
    console.error('syncPromoToStore', e.message);
  }
}

function dashboardPayload(program, amb) {
  matureCommissions(program);
  settleWeeklyXpRewards(program);
  const stats = ensureStats(amb);
  const settings = program.settings;
  const monthly = Number(stats.monthlySales[monthKey()] || 0);
  const level = findLevel(settings, monthly);
  const nxt = nextLevel(settings, level);
  const remaining = nxt ? Math.max(0, (nxt.minSales || 0) - monthly) : 0;
  const progress = nxt
    ? Math.min(100, Math.round((monthly / (nxt.minSales || 1)) * 100))
    : 100;

  const myCommissions = (program.commissions || []).filter((c) => c.ambassadorId === amb.id);
  const pending = myCommissions.filter((c) => c.status === 'pending').reduce((s, c) => s + c.amount, 0);
  const available = myCommissions.filter((c) => c.status === 'available').reduce((s, c) => s + c.amount, 0);
  const paid = myCommissions.filter((c) => c.status === 'paid').reduce((s, c) => s + c.amount, 0);

  const team = teamStats(program, amb.id);
  const notifs = (program.notifications || [])
    .filter((n) => n.ambassadorId === amb.id)
    .slice(0, 20);

  const activeChallenges = (program.challenges || []).filter((ch) => {
    const now = Date.now();
    const start = ch.startAt ? new Date(ch.startAt).getTime() : 0;
    const end = ch.endAt ? new Date(ch.endAt).getTime() : Infinity;
    return ch.active !== false && now >= start && now <= end;
  });

  const weeklyContest = weeklyXpContestInfo(program);
  const thisWeekXp = Number(amb.weeklyXp?.[weekKey()] || 0);

  return {
    ambassador: publicAmbassador(amb, { private: true }),
    rank: {
      current: level,
      next: nxt,
      monthlySales: monthly,
      remaining,
      progress,
    },
    kpis: {
      personalSales: stats.personalSales || 0,
      orders: stats.personalOrders || 0,
      personalCommission: stats.personalCommission || 0,
      teamBonus: stats.teamBonus || 0,
      weeklyXpBonus: stats.weeklyXpBonus || 0,
      totalEarned: stats.totalEarned || 0,
      pendingCommission: Math.round(pending * 100) / 100,
      availableCommission: Math.round(available * 100) / 100,
      paidCommission: Math.round(paid * 100) / 100,
    },
    tools: {
      link: `${settings.shopBaseUrl || 'https://boutiquemenes.netlify.app'}/${amb.slug}`,
      slug: amb.slug,
      promoCode: amb.promoCode,
      inviteLink: `${settings.ambassadorAppUrl || 'https://menesambassador.netlify.app'}/join?ref=${amb.slug}`,
    },
    team,
    leaderboard: weeklyContest.leaderboard,
    weeklyXpContest: weeklyContest,
    thisWeekXp,
    notifications: notifs,
    challenges: activeChallenges,
    badges: amb.badges || [],
    xpGuide: xpGuide(settings),
    recentXp: (amb.xpLog || []).slice(0, 12),
    engagement: {
      clicks: stats.conversionClicks || 0,
      promoUses: stats.promoCodeUses || 0,
      chatMessages: stats.chatMessages || 0,
      ideas: stats.ideasSubmitted || 0,
      invites: stats.invitesSent || 0,
      loginDays: stats.loginDays || 0,
      streakDays: stats.streakDays || amb.streakDays || 0,
    },
  };
}

exports.handler = async (event) => {
  setLambdaEvent(event);
  const headers = corsHeaders(event);
  headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Admin-Password, X-Site-Id, Authorization, X-Ambassador-Token';

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  try {
    const body = parseBody(event);
    const action = actionOf(event, body);
    const program = await readProgram();

    // ——— Public ———
    if (action === 'health' || !action && event.httpMethod === 'GET') {
      return json(headers, 200, {
        ok: true,
        service: 'menes-ambassador',
        version: program.version,
        push: pushConfigured(),
      });
    }

    if (action === 'push-public-key' && event.httpMethod === 'GET') {
      if (!pushConfigured()) {
        return json(headers, 503, { error: 'Push non configuré (VAPID manquant)' });
      }
      return json(headers, 200, { ok: true, publicKey: getPublicKey() });
    }

    if (action === 'resolve-slug' && event.httpMethod === 'GET') {
      const slug = slugify(event.queryStringParameters?.slug || '');
      const amb = program.ambassadors.find((a) => a.slug === slug && a.status === 'active');
      if (!amb) return json(headers, 404, { error: 'Ambassadeur introuvable' });
      return json(headers, 200, {
        ok: true,
        ambassadorId: amb.id,
        slug: amb.slug,
        displayName: amb.displayName,
        promoCode: amb.promoCode,
        attributionDays: program.settings.attributionDays,
      });
    }

    if (action === 'register' && event.httpMethod === 'POST') {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const displayName = String(body.displayName || '').trim();
      const inviteCode = String(body.inviteCode || body.ref || '').trim();
      if (!email || !email.includes('@') || password.length < 8 || !displayName) {
        return json(headers, 400, { error: 'Email, mot de passe (8+) et nom requis' });
      }
      if (program.ambassadors.some((a) => a.email === email)) {
        return json(headers, 409, { error: 'Email déjà utilisé' });
      }

      let referredBy = null;
      let invite = null;
      if (inviteCode) {
        invite = program.invites.find((i) => i.code === inviteCode && i.status === 'open');
        if (invite) referredBy = invite.createdBy || null;
        else {
          const bySlug = program.ambassadors.find(
            (a) => a.slug === slugify(inviteCode) && a.status === 'active'
          );
          if (bySlug) referredBy = bySlug.id;
        }
      }

      const { salt, hash } = hashPassword(password);
      const slug = uniqueSlug(program, body.slug || displayName);
      const promoCode = uniquePromo(program, body.promoCode || displayName.replace(/\s+/g, ''));
      const status = program.settings.requireApproval ? 'pending' : 'active';

      const amb = {
        id: uid('amb'),
        email,
        passwordSalt: salt,
        passwordHash: hash,
        displayName,
        firstName: String(body.firstName || '').trim(),
        lastName: String(body.lastName || '').trim(),
        phone: String(body.phone || '').trim(),
        photoUrl: '',
        bio: '',
        slug,
        promoCode,
        discountPercent: program.settings.defaultDiscountPercent || 10,
        role: ROLES.AMBASSADOR,
        rankId: 'ambassador',
        xp: 0,
        status,
        referredBy,
        onboardingStep: 0,
        onboardingComplete: false,
        agreementAcceptedAt: null,
        stats: {
          personalSales: 0,
          personalOrders: 0,
          personalCommission: 0,
          teamBonus: 0,
          totalEarned: 0,
          monthlySales: {},
          conversionClicks: 0,
        },
        badges: program.ambassadors.length < 25 ? [{ id: 'early', name: 'Early Member', earnedAt: new Date().toISOString() }] : [],
        notificationPrefs: defaultNotificationPrefs(),
        streakDays: 0,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      program.ambassadors.push(amb);
      if (invite) {
        invite.status = 'used';
        invite.usedBy = amb.id;
        invite.usedAt = new Date().toISOString();
      }
      // Credit parrain on signup (even if pending approval)
      if (referredBy) {
        const parent = program.ambassadors.find((a) => a.id === referredBy);
        if (parent) {
          addXp(parent, Math.round((program.settings.xpRules?.activeReferral || 100) / 2), `Filleul inscrit · ${amb.displayName}`, program, {
            key: `referral_signup:${amb.id}`,
          });
        }
      }
      pushAudit(program, { actor: amb.id, action: 'register', meta: { email, referredBy } });
      pushNotification(program, {
        ambassadorId: amb.id,
        type: 'announcement',
        title: 'Bienvenue chez MENES',
        body: 'You\'re officially part of the team.',
      });

      await writeProgram(program);
      if (status === 'active') await syncPromoToStore(amb, program.settings);

      const token = status === 'active' || status === 'pending'
        ? signToken({ aid: amb.id, role: amb.role })
        : null;

      return json(headers, 201, {
        ok: true,
        status: amb.status,
        token,
        ambassador: publicAmbassador(amb, { private: true }),
        message: status === 'pending'
          ? 'Compte créé — en attente d\'approbation admin'
          : 'Compte créé',
      });
    }

    if (action === 'login' && event.httpMethod === 'POST') {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const amb = program.ambassadors.find((a) => a.email === email);
      if (!amb || !verifyPassword(password, amb.passwordSalt, amb.passwordHash)) {
        return json(headers, 401, { error: 'Identifiants invalides' });
      }
      if (amb.status === 'suspended') return json(headers, 403, { error: 'Compte suspendu' });
      if (amb.status === 'rejected') return json(headers, 403, { error: 'Compte refusé' });
      amb.lastActiveAt = new Date().toISOString();
      awardDailyLoginXp(amb, program);
      await writeProgram(program);
      return json(headers, 200, {
        ok: true,
        token: signToken({ aid: amb.id, role: amb.role }),
        ambassador: publicAmbassador(amb, { private: true }),
      });
    }

    if (action === 'invite-info' && event.httpMethod === 'GET') {
      const ref = String(event.queryStringParameters?.ref || '').trim();
      const byInvite = program.invites.find((i) => i.code === ref && i.status === 'open');
      const bySlug = program.ambassadors.find((a) => a.slug === slugify(ref) && a.status === 'active');
      if (!byInvite && !bySlug) return json(headers, 404, { error: 'Invitation invalide' });
      const inviter = bySlug || program.ambassadors.find((a) => a.id === byInvite?.createdBy);
      return json(headers, 200, {
        ok: true,
        inviter: inviter ? { displayName: inviter.displayName, slug: inviter.slug } : null,
      });
    }

    // ——— Authenticated ambassador ———
    const auth = requireAmbassador(event, program, { allowPending: true });
    if (!auth.ok) return json(headers, auth.status, { error: auth.error });
    const amb = auth.ambassador;
    amb.lastActiveAt = new Date().toISOString();

    if (action === 'me' || action === 'dashboard') {
      if (amb.status === 'pending' && action === 'dashboard') {
        return json(headers, 200, {
          ok: true,
          pending: true,
          ambassador: publicAmbassador(amb, { private: true }),
          message: 'Compte en attente d\'approbation',
        });
      }
      if (amb.status === 'active') awardDailyLoginXp(amb, program);
      const dash = dashboardPayload(program, amb);
      await writeProgram(program); // persist matured commissions + xp
      return json(headers, 200, { ok: true, ...dash });
    }

    if (action === 'onboarding' && event.httpMethod === 'POST') {
      const step = Number(body.step);
      if (body.displayName) amb.displayName = String(body.displayName).trim().slice(0, 40);
      if (body.photoUrl !== undefined) amb.photoUrl = String(body.photoUrl).slice(0, 500000);
      if (body.bio !== undefined) amb.bio = String(body.bio).slice(0, 500);
      if (body.acceptAgreement === true) {
        amb.agreementAcceptedAt = new Date().toISOString();
      }
      if (Number.isFinite(step)) amb.onboardingStep = Math.max(0, Math.min(5, step));
      if (body.complete === true) {
        if (!amb.agreementAcceptedAt) {
          return json(headers, 400, {
            error: 'Accepte les règles Ambassador avant de terminer',
            needAgreement: true,
            ambassador: publicAmbassador(amb, { private: true }),
          });
        }
        if (!amb.onboardingComplete) {
          amb.onboardingComplete = true;
          amb.onboardingStep = 5;
          try {
            addXp(amb, program.settings?.xpRules?.completeTraining || 100, 'Onboarding terminé', program, {
              key: 'onboarding:complete',
            });
          } catch (e) {
            console.error('onboarding xp', e.message);
          }
        }
      }
      awardProfileCompleteXp(amb, program);
      await writeProgram(program);
      return json(headers, 200, { ok: true, ambassador: publicAmbassador(amb, { private: true }) });
    }

    if (action === 'update-profile' && event.httpMethod === 'POST') {
      if (body.displayName !== undefined) {
        const name = String(body.displayName || '').trim().slice(0, 40);
        if (name.length < 2) return json(headers, 400, { error: 'Nom trop court (2 caractères min.)' });
        amb.displayName = name;
      }
      if (body.photoUrl !== undefined) amb.photoUrl = String(body.photoUrl).slice(0, 500000);
      if (body.bio !== undefined) amb.bio = String(body.bio).slice(0, 500);
      if (body.phone !== undefined) amb.phone = String(body.phone).slice(0, 40);

      let promoChanged = false;
      const previousCode = amb.promoCode;
      if (body.promoCode !== undefined) {
        let code = String(body.promoCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
        if (code.length < 3) {
          return json(headers, 400, { error: 'Code promo: 3 à 12 lettres/chiffres' });
        }
        const taken = program.ambassadors.some(
          (a) => a.id !== amb.id && String(a.promoCode || '').toUpperCase() === code
        );
        if (taken) {
          return json(headers, 409, { error: 'Ce code promo est déjà utilisé' });
        }
        if (code !== String(previousCode || '').toUpperCase()) {
          amb.promoCode = code;
          promoChanged = true;
        }
      }

      if (body.notificationPrefs && typeof body.notificationPrefs === 'object') {
        amb.notificationPrefs = { ...amb.notificationPrefs, ...body.notificationPrefs };
      }

      if (promoChanged && amb.status === 'active') {
        await syncPromoToStore(amb, program.settings, { previousCode });
      }

      awardProfileCompleteXp(amb, program);

      await writeProgram(program);
      return json(headers, 200, {
        ok: true,
        ambassador: publicAmbassador(amb, { private: true }),
        promoChanged,
      });
    }

    if (action === 'push-subscribe' && event.httpMethod === 'POST') {
      const result = upsertSubscription(amb, body.subscription);
      if (!result.ok) return json(headers, 400, { error: result.error });
      await writeProgram(program);
      return json(headers, 200, { ok: true, push: true });
    }

    if (action === 'push-unsubscribe' && event.httpMethod === 'POST') {
      if (body.disable === true) {
        return json(headers, 403, { error: 'Les notifications push sont obligatoires pour les ambassadeurs' });
      }
      removeSubscription(amb, String(body.endpoint || ''));
      await writeProgram(program);
      return json(headers, 200, { ok: true });
    }

    if (amb.status !== 'active') {
      return json(headers, 403, { error: 'Compte non actif', status: amb.status });
    }

    if (action === 'sales') {
      const siteId = await resolveSiteId('', 'menes');
      const store = await readSiteStore(siteId);
      const myComs = (program.commissions || []).filter((c) => c.ambassadorId === amb.id && c.type === 'personal');
      const byOrder = new Map(myComs.map((c) => [c.orderId, c]));
      const sales = (store.orders || [])
        .filter((o) => o.ambassadorId === amb.id || byOrder.has(o.id))
        .map((o) => sanitizeOrderForAmbassador(o, byOrder.get(o.id)))
        .sort((a, b) => String(b.paidAt || b.createdAt || '').localeCompare(String(a.paidAt || a.createdAt || '')))
        .slice(0, 100);
      return json(headers, 200, { ok: true, sales });
    }

    if (action === 'commissions') {
      const list = (program.commissions || [])
        .filter((c) => c.ambassadorId === amb.id)
        .slice(0, 200);
      return json(headers, 200, { ok: true, commissions: list });
    }

    if (action === 'payouts') {
      const list = (program.payouts || []).filter((p) => p.ambassadorId === amb.id).slice(0, 100);
      return json(headers, 200, { ok: true, payouts: list });
    }

    if (action === 'request-payout' && event.httpMethod === 'POST') {
      matureCommissions(program);
      const available = (program.commissions || []).filter(
        (c) => c.ambassadorId === amb.id && c.status === 'available'
      );
      const amount = available.reduce((s, c) => s + c.amount, 0);
      const min = Number(program.settings.minPayout) || 50;
      if (amount < min) {
        return json(headers, 400, { error: `Minimum ${min}$ CAD`, amount });
      }
      const payout = {
        id: uid('pay'),
        ambassadorId: amb.id,
        amount: Math.round(amount * 100) / 100,
        status: 'pending',
        method: String(body.method || 'manual'),
        reference: '',
        commissionIds: available.map((c) => c.id),
        createdAt: new Date().toISOString(),
      };
      available.forEach((c) => { c.status = 'paid'; c.paidAt = payout.createdAt; c.payoutId = payout.id; });
      program.payouts.unshift(payout);
      pushAudit(program, { actor: amb.id, action: 'request_payout', meta: { amount: payout.amount } });
      await writeProgram(program);
      return json(headers, 200, { ok: true, payout });
    }

    if (action === 'team') {
      return json(headers, 200, {
        ok: true,
        tree: buildTeamTree(program, amb.id, 3),
        stats: teamStats(program, amb.id),
      });
    }

    if (action === 'create-invite' && event.httpMethod === 'POST') {
      const code = uid('inv').replace(/_/g, '').slice(0, 12).toUpperCase();
      const invite = {
        id: uid('invite'),
        code,
        createdBy: amb.id,
        email: String(body.email || '').trim().toLowerCase() || null,
        status: 'open',
        createdAt: new Date().toISOString(),
      };
      program.invites.unshift(invite);
      const inviteUrl = `${program.settings.ambassadorAppUrl}/join?ref=${code}`;
      awardInviteSentXp(amb, program, invite.id);
      let emailed = null;
      if (invite.email) {
        emailed = await sendAmbassadorInvite({
          email: invite.email,
          inviteUrl,
          inviterName: amb.displayName,
        });
      }
      await writeProgram(program);
      return json(headers, 200, { ok: true, invite, inviteUrl, emailed });
    }

    if (action === 'leaderboard') {
      settleWeeklyXpRewards(program);
      await writeProgram(program);
      return json(headers, 200, {
        ok: true,
        leaderboard: leaderboard(program, 50),
        weeklyXpContest: weeklyXpContestInfo(program),
      });
    }

    if (action === 'content') {
      const list = (program.content || [])
        .filter((c) => c.active !== false)
        .slice(0, 100);
      return json(headers, 200, { ok: true, content: list });
    }

    if (action === 'campaigns') {
      const list = (program.campaigns || []).filter((c) => c.active !== false);
      return json(headers, 200, { ok: true, campaigns: list });
    }

    if (action === 'join-campaign' && event.httpMethod === 'POST') {
      const camp = program.campaigns.find((c) => c.id === body.campaignId);
      if (!camp) return json(headers, 404, { error: 'Campagne introuvable' });
      if (!Array.isArray(camp.members)) camp.members = [];
      if (!camp.members.includes(amb.id)) camp.members.push(amb.id);
      await writeProgram(program);
      return json(headers, 200, { ok: true, campaign: camp });
    }

    if (action === 'challenges') {
      return json(headers, 200, { ok: true, challenges: program.challenges || [] });
    }

    // Community
    if (action === 'channels') {
      return json(headers, 200, { ok: true, channels: program.channels || [] });
    }

    if (action === 'messages' && event.httpMethod === 'GET') {
      const channelId = event.queryStringParameters?.channel || 'general';
      const since = event.queryStringParameters?.since;
      const q = String(event.queryStringParameters?.q || '').trim().toLowerCase();
      let msgs = (program.messages || []).filter((m) => m.channelId === channelId && !m.deleted);
      if (since) msgs = msgs.filter((m) => m.createdAt > since);
      if (q) {
        msgs = msgs.filter((m) => {
          const author = program.ambassadors.find((a) => a.id === m.ambassadorId);
          const hay = `${m.text || ''} ${author?.displayName || ''} ${(m.attachments || []).map((a) => a.name || '').join(' ')}`.toLowerCase();
          return hay.includes(q);
        });
      }
      const pinned = msgs.filter((m) => m.pinned).sort((a, b) => String(b.pinnedAt || '').localeCompare(String(a.pinnedAt || '')));
      const normal = msgs.filter((m) => !m.pinned);
      const ordered = [...pinned, ...normal.slice(-120)];
      const mapped = ordered.map((m) => {
        const author = program.ambassadors.find((a) => a.id === m.ambassadorId);
        return {
          ...m,
          authorName: author?.displayName || 'Ambassador',
          authorPhoto: author?.photoUrl || '',
          canDelete: m.ambassadorId === amb.id || ['AMBASSADOR_LEADER', 'AMBASSADOR_ELITE', 'SUPER_ADMIN', 'ADMIN'].includes(amb.role),
          canPin: true,
        };
      });
      return json(headers, 200, { ok: true, messages: mapped, query: q || null });
    }

    if (action === 'send-message' && event.httpMethod === 'POST') {
      const channelId = String(body.channelId || 'general');
      const channel = (program.channels || []).find((c) => c.id === channelId);
      if (!channel) return json(headers, 404, { error: 'Canal introuvable' });
      if (amb.mutedUntil && new Date(amb.mutedUntil).getTime() > Date.now()) {
        return json(headers, 403, { error: 'Compte temporairement muet' });
      }
      if (channel.locked && !['AMBASSADOR_LEADER', 'AMBASSADOR_ELITE'].includes(amb.role)) {
        return json(headers, 403, { error: 'Canal réservé aux annonces admin' });
      }
      const text = String(body.text || '').trim().slice(0, 2000);
      const rawAtt = Array.isArray(body.attachments) ? body.attachments : (body.attachment ? [body.attachment] : []);
      const attachments = [];
      for (const a of rawAtt.slice(0, 3)) {
        const dataUrl = String(a.dataUrl || a.url || '');
        const name = String(a.name || 'fichier').slice(0, 80);
        const type = String(a.type || 'application/octet-stream').slice(0, 80);
        if (!dataUrl.startsWith('data:')) continue;
        // ~900KB raw base64 limit per file (blob-friendly)
        if (dataUrl.length > 1_200_000) {
          return json(headers, 400, { error: `Fichier trop lourd: ${name} (max ~900 Ko)` });
        }
        if (!/^(image\/|application\/pdf|video\/mp4|audio\/)/i.test(type) && !dataUrl.startsWith('data:image/')) {
          return json(headers, 400, { error: 'Type de fichier non supporté (images, PDF, vidéo courte)' });
        }
        attachments.push({ name, type, dataUrl, size: dataUrl.length });
      }
      if (!text && !attachments.length) return json(headers, 400, { error: 'Message vide' });

      const recent = (program.messages || []).filter(
        (m) => m.ambassadorId === amb.id && Date.now() - new Date(m.createdAt).getTime() < 120000
      );
      if (recent.length >= 8) return json(headers, 429, { error: 'Trop de messages — ralentis' });

      if (text) {
        const dup = recent.find((m) => m.text === text && m.channelId === channelId
          && Date.now() - new Date(m.createdAt).getTime() < 5000);
        if (dup && !attachments.length) {
          return json(headers, 200, {
            ok: true,
            message: { ...dup, authorName: amb.displayName, authorPhoto: amb.photoUrl || '' },
            deduped: true,
          });
        }
      }

      const msg = {
        id: uid('msg'),
        channelId,
        ambassadorId: amb.id,
        text: text || (attachments.length ? '' : ''),
        attachments,
        pinned: false,
        pinnedAt: null,
        pinnedBy: null,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deleted: false,
      };
      program.messages.push(msg);
      if (program.messages.length > 5000) program.messages = program.messages.slice(-4000);
      awardChatXp(amb, program);

      let pushResult = null;
      try {
        const preview = text || (attachments[0] ? `📎 ${attachments[0].name}` : 'Nouveau message');
        const recipients = (program.ambassadors || []).filter(
          (a) => a.id !== amb.id && a.status === 'active'
        );
        for (const r of recipients.slice(0, 50)) {
          pushNotification(program, {
            ambassadorId: r.id,
            type: 'community',
            title: `Message dans #${channelId}`,
            body: `${amb.displayName}: ${String(preview).slice(0, 80)}`,
            data: { channelId, messageId: msg.id, view: 'community' },
          });
        }
        pushResult = await notifyCommunityMessage(program, {
          sender: amb,
          channelId,
          text: preview,
          messageId: msg.id,
        });
      } catch (e) {
        pushResult = { error: e.message };
      }

      await writeProgram(program);
      return json(headers, 200, {
        ok: true,
        message: { ...msg, authorName: amb.displayName, authorPhoto: amb.photoUrl || '' },
        push: pushResult,
      });
    }

    if (action === 'delete-message' && event.httpMethod === 'POST') {
      const msg = (program.messages || []).find((m) => m.id === body.messageId);
      if (!msg || msg.deleted) return json(headers, 404, { error: 'Message introuvable' });
      const isOwner = msg.ambassadorId === amb.id;
      const isLead = ['AMBASSADOR_LEADER', 'AMBASSADOR_ELITE', 'SUPER_ADMIN', 'ADMIN'].includes(amb.role);
      if (!isOwner && !isLead) return json(headers, 403, { error: 'Tu ne peux supprimer que tes messages' });
      msg.deleted = true;
      msg.deletedAt = new Date().toISOString();
      msg.deletedBy = amb.id;
      // drop heavy attachments to free blob space
      msg.attachments = [];
      msg.text = '';
      await writeProgram(program);
      return json(headers, 200, { ok: true, messageId: msg.id });
    }

    if (action === 'pin-message' && event.httpMethod === 'POST') {
      const msg = (program.messages || []).find((m) => m.id === body.messageId && !m.deleted);
      if (!msg) return json(headers, 404, { error: 'Message introuvable' });
      const pin = body.pinned !== false;
      if (pin) {
        // max 5 pins per channel
        const pinnedCount = (program.messages || []).filter(
          (m) => m.channelId === msg.channelId && m.pinned && !m.deleted
        ).length;
        if (!msg.pinned && pinnedCount >= 5) {
          return json(headers, 400, { error: 'Max 5 messages épinglés par canal' });
        }
        msg.pinned = true;
        msg.pinnedAt = new Date().toISOString();
        msg.pinnedBy = amb.id;
      } else {
        msg.pinned = false;
        msg.pinnedAt = null;
        msg.pinnedBy = null;
      }
      await writeProgram(program);
      return json(headers, 200, { ok: true, message: msg });
    }

    if (action === 'report-message' && event.httpMethod === 'POST') {
      const report = {
        id: uid('rep'),
        messageId: body.messageId,
        reporterId: amb.id,
        reason: String(body.reason || '').slice(0, 300),
        createdAt: new Date().toISOString(),
        status: 'open',
      };
      program.messageReports.unshift(report);
      await writeProgram(program);
      return json(headers, 200, { ok: true, report });
    }

    // Ideas
    if (action === 'ideas' && event.httpMethod === 'GET') {
      const ideas = (program.ideas || []).slice(0, 100).map((idea) => ({
        ...idea,
        authorName: program.ambassadors.find((a) => a.id === idea.ambassadorId)?.displayName || 'Ambassador',
        likedByMe: (idea.likes || []).includes(amb.id),
        likeCount: (idea.likes || []).length,
        likes: undefined,
      }));
      return json(headers, 200, { ok: true, ideas });
    }

    if (action === 'submit-idea' && event.httpMethod === 'POST') {
      const idea = {
        id: uid('idea'),
        ambassadorId: amb.id,
        title: String(body.title || '').trim().slice(0, 120),
        body: String(body.body || '').trim().slice(0, 2000),
        category: String(body.category || 'promo').slice(0, 40),
        status: 'new',
        likes: [],
        createdAt: new Date().toISOString(),
      };
      if (!idea.title || !idea.body) return json(headers, 400, { error: 'Titre et description requis' });
      program.ideas.unshift(idea);
      awardIdeaSubmitXp(amb, program, idea.id);
      await writeProgram(program);
      return json(headers, 200, { ok: true, idea });
    }

    if (action === 'like-idea' && event.httpMethod === 'POST') {
      const idea = program.ideas.find((i) => i.id === body.ideaId);
      if (!idea) return json(headers, 404, { error: 'Idée introuvable' });
      if (!Array.isArray(idea.likes)) idea.likes = [];
      const idx = idea.likes.indexOf(amb.id);
      if (idx >= 0) idea.likes.splice(idx, 1);
      else {
        idea.likes.push(amb.id);
        if (idea.ambassadorId !== amb.id) {
          pushNotification(program, {
            ambassadorId: idea.ambassadorId,
            type: 'idea',
            title: 'Quelqu\'un a aimé ton idée',
            body: idea.title,
            data: { ideaId: idea.id },
          });
        }
      }
      await writeProgram(program);
      return json(headers, 200, { ok: true, likeCount: idea.likes.length });
    }

    if (action === 'notifications') {
      const list = (program.notifications || [])
        .filter((n) => n.ambassadorId === amb.id)
        .slice(0, 50);
      return json(headers, 200, { ok: true, notifications: list });
    }

    if (action === 'read-notifications' && event.httpMethod === 'POST') {
      (program.notifications || []).forEach((n) => {
        if (n.ambassadorId === amb.id) n.read = true;
      });
      await writeProgram(program);
      return json(headers, 200, { ok: true });
    }

    await writeProgram(program);
    return json(headers, 400, { error: `Action inconnue: ${action}` });
  } catch (err) {
    console.error('ambassador api', err);
    return json(headers, 500, { error: err.message || 'Erreur serveur' });
  }
};
