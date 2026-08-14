/**
 * Admin API for MENES Ambassador program.
 * Auth: X-Admin-Password (same as console).
 */

const { setLambdaEvent, readSiteStore, writeSiteStore } = require('../lib/platform');
const { corsHeaders } = require('../lib/cors');
const {
  readProgram, writeProgram, uid, slugify, pushAudit, defaultSettings,
} = require('../lib/ambassador-data');
const {
  requireAdmin, hashPassword, publicAmbassador, normalizeRole, defaultNotificationPrefs,
} = require('../lib/ambassador-auth');
const {
  matureCommissions, leaderboard, processPaidOrder, reverseCommissionsForOrder,
  buildTeamTree, teamStats, pushNotification, addXp, awardBadge, ensureStats,
  recalculateAllXp, settleWeeklyXpRewards, weeklyXpContestInfo,
} = require('../lib/ambassador-engine');
const { sendAmbassadorWelcome, sendAmbassadorInvite, sendPlatformReady, emailConfigured, emailStatusPublic } = require('../lib/ambassador-email');

function json(headers, status, body) {
  return { statusCode: status, headers, body: JSON.stringify(body) };
}

function parseBody(event) {
  try { return JSON.parse(event.body || '{}'); } catch { return {}; }
}

function actionOf(event, body) {
  return String(event.queryStringParameters?.action || body.action || '').trim();
}

async function syncPromo(ambassador, settings) {
  try {
    const store = await readSiteStore('menes');
    if (!Array.isArray(store.discounts)) store.discounts = [];
    const code = String(ambassador.promoCode || '').toUpperCase();
    if (!code) return;
    const existing = store.discounts.find((d) => String(d.code || '').toUpperCase() === code);
    const row = {
      code,
      type: 'percent',
      value: Number(ambassador.discountPercent ?? settings.defaultDiscountPercent ?? 10),
      active: ambassador.status === 'active',
      minCart: Number(ambassador.minOrder || 0),
      ambassadorId: ambassador.id,
      source: 'ambassador',
    };
    if (existing) Object.assign(existing, row);
    else store.discounts.push(row);
    await writeSiteStore('menes', store);
  } catch (e) {
    console.error('syncPromo', e.message);
  }
}

function globalStats(program) {
  const ambs = program.ambassadors || [];
  const active = ambs.filter((a) => a.status === 'active');
  const commissions = program.commissions || [];
  const totalSales = active.reduce((s, a) => s + (a.stats?.personalSales || 0), 0);
  const sum = (status) => commissions.filter((c) => c.status === status).reduce((s, c) => s + c.amount, 0);
  const top = [...active].sort((a, b) => (b.stats?.personalSales || 0) - (a.stats?.personalSales || 0))[0];
  return {
    totalAmbassadors: ambs.length,
    activeAmbassadors: active.length,
    pendingAmbassadors: ambs.filter((a) => a.status === 'pending').length,
    totalAmbassadorSales: Math.round(totalSales * 100) / 100,
    totalCommissions: Math.round(commissions.reduce((s, c) => s + c.amount, 0) * 100) / 100,
    pendingCommissions: Math.round(sum('pending') * 100) / 100,
    availableCommissions: Math.round(sum('available') * 100) / 100,
    paidCommissions: Math.round(sum('paid') * 100) / 100,
    topAmbassador: top ? { id: top.id, displayName: top.displayName, sales: top.stats?.personalSales || 0 } : null,
    openFraudFlags: (program.fraudFlags || []).filter((f) => f.status === 'needs_review').length,
    openReports: (program.messageReports || []).filter((r) => r.status === 'open').length,
  };
}

exports.handler = async (event) => {
  setLambdaEvent(event);
  const headers = corsHeaders(event);
  headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Admin-Password, X-Site-Id, Authorization, X-Ambassador-Token';

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const admin = requireAdmin(event);
  if (!admin.ok) return json(headers, admin.status, { error: admin.error });

  try {
    const body = parseBody(event);
    const action = actionOf(event, body) || (event.httpMethod === 'GET' ? 'overview' : '');
    const program = await readProgram();
    matureCommissions(program);
    settleWeeklyXpRewards(program);

    if (action === 'overview') {
      await writeProgram(program);
      return json(headers, 200, {
        ok: true,
        stats: globalStats(program),
        settings: program.settings,
        leaderboard: leaderboard(program, 10, { includeSales: true }),
        weeklyXpContest: weeklyXpContestInfo(program),
        recentAmbassadors: program.ambassadors.slice(-10).reverse().map((a) => publicAmbassador(a, { private: true })),
        fraudFlags: (program.fraudFlags || []).slice(0, 20),
      });
    }

    if (action === 'list') {
      const status = event.queryStringParameters?.status;
      let list = program.ambassadors.map((a) => publicAmbassador(a, { private: true }));
      if (status) list = list.filter((a) => a.status === status);
      return json(headers, 200, { ok: true, ambassadors: list });
    }

    if (action === 'get') {
      const id = body.id || event.queryStringParameters?.id;
      const amb = program.ambassadors.find((a) => a.id === id);
      if (!amb) return json(headers, 404, { error: 'Introuvable' });
      const commissions = program.commissions.filter((c) => c.ambassadorId === id).slice(0, 100);
      const payouts = program.payouts.filter((p) => p.ambassadorId === id);
      return json(headers, 200, {
        ok: true,
        ambassador: publicAmbassador(amb, { private: true }),
        commissions,
        payouts,
        team: buildTeamTree(program, id, 3),
        teamStats: teamStats(program, id),
      });
    }

    if (action === 'create' && event.httpMethod === 'POST') {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || cryptoRandom());
      const displayName = String(body.displayName || '').trim();
      if (!email || !displayName) return json(headers, 400, { error: 'email et displayName requis' });
      if (program.ambassadors.some((a) => a.email === email)) {
        return json(headers, 409, { error: 'Email déjà utilisé' });
      }
      const { salt, hash } = hashPassword(password);
      let slug = slugify(body.slug || displayName);
      let promoCode = String(body.promoCode || `${displayName.replace(/\s+/g, '')}10`).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const amb = {
        id: uid('amb'),
        email,
        passwordSalt: salt,
        passwordHash: hash,
        displayName,
        firstName: body.firstName || '',
        lastName: body.lastName || '',
        phone: body.phone || '',
        photoUrl: '',
        bio: '',
        slug,
        promoCode,
        discountPercent: Number(body.discountPercent ?? program.settings.defaultDiscountPercent ?? 10),
        customCommission: body.customCommission != null ? Number(body.customCommission) : undefined,
        role: normalizeRole(body.role || 'AMBASSADOR'),
        rankId: body.rankId || 'ambassador',
        xp: 0,
        status: body.status || 'active',
        referredBy: body.referredBy || null,
        onboardingStep: 0,
        onboardingComplete: false,
        agreementAcceptedAt: null,
        stats: {
          personalSales: 0, personalOrders: 0, personalCommission: 0,
          teamBonus: 0, totalEarned: 0, monthlySales: {}, conversionClicks: 0,
        },
        badges: [],
        notificationPrefs: defaultNotificationPrefs(),
        streakDays: 0,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        tempPassword: password,
      };
      program.ambassadors.push(amb);
      pushAudit(program, { actor: 'admin', action: 'create_ambassador', meta: { id: amb.id, email } });
      await syncPromo(amb, program.settings);
      let emailResult = null;
      if (amb.status === 'active') {
        emailResult = await sendAmbassadorWelcome(amb, program.settings);
      }
      await writeProgram(program);
      return json(headers, 201, {
        ok: true,
        ambassador: publicAmbassador(amb, { private: true }),
        tempPassword: password,
        email: emailResult,
        emailConfigured: emailConfigured(),
      });
    }

    if (action === 'invite' && event.httpMethod === 'POST') {
      const code = uid('inv').replace(/_/g, '').slice(0, 12).toUpperCase();
      const invite = {
        id: uid('invite'),
        code,
        createdBy: null,
        email: String(body.email || '').trim().toLowerCase() || null,
        status: 'open',
        createdAt: new Date().toISOString(),
        note: body.note || '',
      };
      program.invites.unshift(invite);
      const inviteUrl = `${program.settings.ambassadorAppUrl}/join?ref=${code}`;
      let emailed = null;
      if (invite.email) {
        emailed = await sendAmbassadorInvite({
          email: invite.email,
          inviteUrl,
          inviterName: 'MENES',
        });
      }
      pushAudit(program, { actor: 'admin', action: 'invite', meta: { code, email: invite.email } });
      await writeProgram(program);
      return json(headers, 200, { ok: true, invite, inviteUrl, emailed });
    }

    if (action === 'update' && event.httpMethod === 'POST') {
      const amb = program.ambassadors.find((a) => a.id === body.id);
      if (!amb) return json(headers, 404, { error: 'Introuvable' });
      const before = { status: amb.status, rankId: amb.rankId, promoCode: amb.promoCode, customCommission: amb.customCommission, referredBy: amb.referredBy };
      const fields = [
        'displayName', 'status', 'rankId', 'role', 'promoCode', 'slug', 'discountPercent',
        'customCommission', 'minOrder', 'photoUrl', 'bio', 'phone',
      ];
      for (const f of fields) {
        if (body[f] !== undefined) amb[f] = body[f];
      }
      if (body.referredBy !== undefined) {
        const parentId = body.referredBy === null || body.referredBy === '' ? null : String(body.referredBy);
        if (parentId && wouldCreateReferralCycle(program, amb.id, parentId)) {
          return json(headers, 400, { error: 'Cette relation créerait une boucle dans l\'arbre' });
        }
        if (parentId && !program.ambassadors.some((a) => a.id === parentId)) {
          return json(headers, 400, { error: 'Parrain introuvable' });
        }
        amb.referredBy = parentId;
        // Credit parrain when admin places someone in their tree
        if (parentId && amb.status === 'active') {
          const parent = program.ambassadors.find((a) => a.id === parentId);
          if (parent) {
            addXp(parent, program.settings.xpRules?.activeReferral || 100, `Filleul actif · ${amb.displayName}`, program, {
              key: `referral_active:${amb.id}`,
            });
          }
        }
      }
      if (body.role) amb.role = normalizeRole(body.role);
      if (body.resetPassword) {
        const { salt, hash } = hashPassword(String(body.resetPassword));
        amb.passwordSalt = salt;
        amb.passwordHash = hash;
      }
      pushAudit(program, {
        actor: 'admin',
        action: 'update_ambassador',
        meta: { id: amb.id, before, after: { status: amb.status, rankId: amb.rankId, promoCode: amb.promoCode, customCommission: amb.customCommission, referredBy: amb.referredBy } },
      });
      await syncPromo(amb, program.settings);
      await writeProgram(program);
      return json(headers, 200, { ok: true, ambassador: publicAmbassador(amb, { private: true }) });
    }

    if (action === 'trees' || action === 'team-forest') {
      const roots = (program.ambassadors || []).filter((a) => !a.referredBy || !program.ambassadors.some((p) => p.id === a.referredBy));
      const forest = roots.map((r) => ({
        ...buildTeamTree(program, r.id, 8),
        orphan: Boolean(r.referredBy), // referredBy points to missing parent
      }));
      const unattached = (program.ambassadors || []).filter((a) => !a.referredBy);
      return json(headers, 200, {
        ok: true,
        forest,
        ambassadors: program.ambassadors.map((a) => publicAmbassador(a, { private: true })),
        roots: unattached.map((a) => ({ id: a.id, displayName: a.displayName })),
      });
    }

    if ((action === 'set-referral' || action === 'set_referral' || action === 'setReferral' || action === 'referral') && event.httpMethod === 'POST') {
      const ambId = String(body.id || body.ambassadorId || '').trim();
      const parentId = body.referredBy === null || body.referredBy === '' || body.referredBy === 'none'
        ? null
        : String(body.referredBy || body.parentId || '').trim();
      const amb = program.ambassadors.find((a) => a.id === ambId);
      if (!amb) return json(headers, 404, { error: 'Ambassadeur introuvable' });
      if (parentId) {
        if (!program.ambassadors.some((a) => a.id === parentId)) {
          return json(headers, 400, { error: 'Parrain introuvable' });
        }
        if (wouldCreateReferralCycle(program, ambId, parentId)) {
          return json(headers, 400, { error: 'Impossible : ça créerait une boucle (A → B → A)' });
        }
      }
      const before = amb.referredBy || null;
      amb.referredBy = parentId;
      pushAudit(program, {
        actor: 'admin',
        action: 'set_referral',
        meta: { id: ambId, before, after: parentId },
      });
      await writeProgram(program);
      return json(headers, 200, {
        ok: true,
        ambassador: publicAmbassador(amb, { private: true }),
        tree: buildTeamTree(program, parentId || ambId, 5),
      });
    }

    if (action === 'recalc-xp' && event.httpMethod === 'POST') {
      const results = recalculateAllXp(program);
      pushAudit(program, {
        actor: 'admin',
        action: 'recalc_xp',
        meta: { count: results.length, top: results.slice(0, 5) },
      });
      await writeProgram(program);
      return json(headers, 200, { ok: true, results });
    }

    if (action === 'sync-promos' && event.httpMethod === 'POST') {
      const { mergeAmbassadorDiscounts } = require('../lib/ambassador-data');
      const store = await readSiteStore('menes');
      if (!Array.isArray(store.products) || store.products.length === 0) {
        return json(headers, 409, {
          error: 'Catalogue boutique vide — sync promo annulée pour ne pas écraser les produits',
        });
      }
      const merged = mergeAmbassadorDiscounts(store, program);
      await writeSiteStore('menes', merged);
      const ambCodes = (merged.discounts || []).filter((d) => d.source === 'ambassador' && d.active !== false);
      pushAudit(program, {
        actor: 'admin',
        action: 'sync_promos',
        meta: { count: ambCodes.length },
      });
      await writeProgram(program);
      return json(headers, 200, {
        ok: true,
        synced: ambCodes.length,
        codes: ambCodes.map((d) => d.code),
      });
    }

    if (action === 'approve' && event.httpMethod === 'POST') {
      const amb = program.ambassadors.find((a) => a.id === body.id);
      if (!amb) return json(headers, 404, { error: 'Introuvable' });
      amb.status = 'active';
      await syncPromo(amb, program.settings);
      const emailResult = await sendAmbassadorWelcome(amb, program.settings);
      pushNotification(program, {
        ambassadorId: amb.id,
        type: 'announcement',
        title: 'Compte approuvé',
        body: 'Tu es officiellement Ambassador MENES. La plateforme est live.',
      });
      if (amb.referredBy) {
        const parent = program.ambassadors.find((a) => a.id === amb.referredBy);
        if (parent) {
          addXp(parent, program.settings.xpRules?.activeReferral || 100, 'Ambassadeur activé', program, {
            key: `referral_active:${amb.id}`,
          });
          pushNotification(program, {
            ambassadorId: parent.id,
            type: 'team',
            title: 'Nouveau membre d\'équipe',
            body: `${amb.displayName} est maintenant actif`,
          });
        }
      }
      pushAudit(program, {
        actor: 'admin',
        action: 'approve',
        meta: { id: amb.id, emailOk: !!emailResult?.ok, emailError: emailResult?.error || null },
      });
      await writeProgram(program);
      return json(headers, 200, {
        ok: true,
        ambassador: publicAmbassador(amb, { private: true }),
        email: emailResult,
        emailConfigured: emailConfigured(),
      });
    }

    if (action === 'resend-welcome' && event.httpMethod === 'POST') {
      const amb = program.ambassadors.find((a) => a.id === body.id);
      if (!amb) return json(headers, 404, { error: 'Introuvable' });
      if (amb.status !== 'active') return json(headers, 400, { error: 'Compte non actif' });
      const emailResult = await sendAmbassadorWelcome(amb, program.settings);
      pushAudit(program, {
        actor: 'admin',
        action: 'resend_welcome',
        meta: { id: amb.id, emailOk: !!emailResult?.ok, emailError: emailResult?.error || null },
      });
      await writeProgram(program);
      return json(headers, 200, {
        ok: true,
        email: emailResult,
        emailConfigured: emailConfigured(),
      });
    }

    if (action === 'notify-platform-ready' && event.httpMethod === 'POST') {
      if (!emailConfigured()) {
        return json(headers, 503, {
          error: 'Email non configuré. Sur Netlify (boutiquemenes) ajoute BREVO_API_KEY + EMAIL_FROM (ex: mymenes2022@gmail.com) — gratuit. Ou SMTP_USER/SMTP_PASS pour Gmail.',
          emailConfigured: false,
          ...emailStatusPublic(),
        });
      }
      const targets = (program.ambassadors || []).filter((a) => a.status === 'active' && a.email);
      const results = [];
      for (const amb of targets) {
        const emailResult = await sendPlatformReady(amb, program.settings);
        results.push({
          id: amb.id,
          email: amb.email,
          ok: !!emailResult?.ok,
          error: emailResult?.error || null,
          resendId: emailResult?.id || null,
        });
        if (emailResult?.ok) {
          pushNotification(program, {
            ambassadorId: amb.id,
            type: 'announcement',
            title: 'Plateforme live',
            body: 'La plateforme Ambassador est maintenant fonctionnelle.',
          });
        }
        // small delay to stay under Resend rate limits
        await new Promise((r) => setTimeout(r, 220));
      }
      const sent = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok).length;
      pushAudit(program, {
        actor: 'admin',
        action: 'notify_platform_ready',
        meta: { total: targets.length, sent, failed },
      });
      await writeProgram(program);
      return json(headers, 200, {
        ok: true,
        emailConfigured: true,
        total: targets.length,
        sent,
        failed,
        results,
      });
    }

    if (action === 'email-status' && event.httpMethod === 'GET') {
      return json(headers, 200, {
        ok: true,
        ...emailStatusPublic(),
        emailConfigured: emailConfigured(),
        hasKey: emailConfigured(),
      });
    }

    if (action === 'suspend' && event.httpMethod === 'POST') {
      const amb = program.ambassadors.find((a) => a.id === body.id);
      if (!amb) return json(headers, 404, { error: 'Introuvable' });
      amb.status = 'suspended';
      await syncPromo(amb, program.settings);
      pushAudit(program, { actor: 'admin', action: 'suspend', meta: { id: amb.id } });
      await writeProgram(program);
      return json(headers, 200, { ok: true });
    }

    if (action === 'delete' && event.httpMethod === 'POST') {
      const ids = Array.isArray(body.ids)
        ? body.ids.map((x) => String(x || '').trim()).filter(Boolean)
        : [String(body.id || '').trim()].filter(Boolean);
      if (!ids.length) return json(headers, 400, { error: 'id ou ids requis' });

      const removed = [];
      for (const id of ids) {
        const idx = program.ambassadors.findIndex((a) => a.id === id);
        if (idx < 0) continue;
        const amb = program.ambassadors[idx];
        removed.push({
          id,
          email: amb.email,
          displayName: amb.displayName,
          promoCode: amb.promoCode,
        });
        program.ambassadors.splice(idx, 1);
      }
      if (!removed.length) return json(headers, 404, { error: 'Introuvable' });

      try {
        const store = await readSiteStore('menes');
        if (Array.isArray(store.discounts)) {
          const removedIds = new Set(removed.map((r) => r.id));
          const removedCodes = new Set(removed.map((r) => String(r.promoCode || '').toUpperCase()).filter(Boolean));
          store.discounts.forEach((d) => {
            if (removedIds.has(d.ambassadorId) || removedCodes.has(String(d.code || '').toUpperCase())) {
              d.active = false;
              d.deletedAmbassador = true;
            }
          });
          await writeSiteStore('menes', store);
        }
      } catch {}

      pushAudit(program, {
        actor: 'admin',
        action: 'delete_ambassador',
        meta: { removed },
      });
      await writeProgram(program);
      return json(headers, 200, { ok: true, deleted: removed.map((r) => r.id), count: removed.length });
    }

    if (action === 'settings' && event.httpMethod === 'POST') {
      const prev = { ...program.settings };
      program.settings = { ...defaultSettings(), ...program.settings, ...body.settings };
      if (body.settings?.levels) program.settings.levels = body.settings.levels;
      pushAudit(program, { actor: 'admin', action: 'update_settings', meta: { before: prev, after: program.settings } });
      await writeProgram(program);
      return json(headers, 200, { ok: true, settings: program.settings });
    }

    if (action === 'commissions') {
      const status = event.queryStringParameters?.status;
      let list = program.commissions || [];
      if (status) list = list.filter((c) => c.status === status);
      return json(headers, 200, { ok: true, commissions: list.slice(0, 500) });
    }

    if (action === 'mature-commissions' && event.httpMethod === 'POST') {
      const n = matureCommissions(program);
      await writeProgram(program);
      return json(headers, 200, { ok: true, matured: n });
    }

    if (action === 'reverse-order' && event.httpMethod === 'POST') {
      const reversed = reverseCommissionsForOrder(program, body.orderId, body.reason || 'admin_reverse');
      pushAudit(program, { actor: 'admin', action: 'reverse_order', meta: { orderId: body.orderId, count: reversed.length } });
      await writeProgram(program);
      return json(headers, 200, { ok: true, reversed });
    }

    if (action === 'force-attribute' && event.httpMethod === 'POST') {
      const store = await readSiteStore('menes');
      const order = (store.orders || []).find((o) => o.id === body.orderId);
      if (!order) return json(headers, 404, { error: 'Commande introuvable' });
      const result = processPaidOrder(program, order, {
        forceAttribution: {
          ambassadorId: body.ambassadorId,
          method: 'admin_assigned',
          promoCode: body.promoCode || null,
          campaignId: body.campaignId || null,
        },
      });
      await writeSiteStore('menes', store);
      pushAudit(program, { actor: 'admin', action: 'force_attribute', meta: { orderId: body.orderId, result } });
      await writeProgram(program);
      return json(headers, 200, { ok: true, result });
    }

    if (action === 'payouts') {
      return json(headers, 200, { ok: true, payouts: program.payouts || [] });
    }

    if (action === 'approve-payout' && event.httpMethod === 'POST') {
      const p = program.payouts.find((x) => x.id === body.id);
      if (!p) return json(headers, 404, { error: 'Introuvable' });
      p.status = body.status || 'paid';
      p.reference = body.reference || p.reference;
      p.paidAt = new Date().toISOString();
      pushAudit(program, { actor: 'admin', action: 'approve_payout', meta: { id: p.id, amount: p.amount } });
      pushNotification(program, {
        ambassadorId: p.ambassadorId,
        type: 'commission',
        title: 'Paiement effectué',
        body: `${p.amount.toFixed(2)}$ versé`,
        data: { payoutId: p.id },
      });
      await writeProgram(program);
      return json(headers, 200, { ok: true, payout: p });
    }

    if (action === 'create-campaign' && event.httpMethod === 'POST') {
      const camp = {
        id: uid('camp'),
        name: String(body.name || 'Campagne').slice(0, 80),
        description: String(body.description || '').slice(0, 2000),
        startAt: body.startAt || new Date().toISOString(),
        endAt: body.endAt || null,
        discount: Number(body.discount) || 0,
        commissionBonus: Number(body.commissionBonus) || 0,
        products: body.products || [],
        assets: body.assets || [],
        members: [],
        active: true,
        createdAt: new Date().toISOString(),
      };
      program.campaigns.unshift(camp);
      await writeProgram(program);
      return json(headers, 200, { ok: true, campaign: camp });
    }

    if (action === 'create-challenge' && event.httpMethod === 'POST') {
      const ch = {
        id: uid('chal'),
        title: String(body.title || '').slice(0, 120),
        description: String(body.description || '').slice(0, 1000),
        goalType: body.goalType || 'sales_count', // sales_count | sales_amount | content
        goalValue: Number(body.goalValue) || 1,
        xpReward: Number(body.xpReward) || 100,
        badgeId: body.badgeId || null,
        startAt: body.startAt || new Date().toISOString(),
        endAt: body.endAt || null,
        active: true,
        progress: {},
        createdAt: new Date().toISOString(),
      };
      program.challenges.unshift(ch);
      await writeProgram(program);
      return json(headers, 200, { ok: true, challenge: ch });
    }

    if (action === 'upload-content' && event.httpMethod === 'POST') {
      const item = {
        id: uid('asset'),
        title: String(body.title || 'Asset').slice(0, 120),
        type: body.type || 'image',
        url: String(body.url || '').slice(0, 500000),
        caption: String(body.caption || '').slice(0, 2000),
        tags: body.tags || [],
        flags: body.flags || [], // FEATURED NEW CAMPAIGN LIMITED
        active: true,
        createdAt: new Date().toISOString(),
      };
      program.content.unshift(item);
      await writeProgram(program);
      return json(headers, 200, { ok: true, content: item });
    }

    if (action === 'ideas') {
      return json(headers, 200, { ok: true, ideas: program.ideas || [] });
    }

    if (action === 'moderate-idea' && event.httpMethod === 'POST') {
      const idea = program.ideas.find((i) => i.id === body.id);
      if (!idea) return json(headers, 404, { error: 'Introuvable' });
      idea.status = body.status || idea.status;
      if (idea.status === 'approved' || idea.status === 'implemented') {
        const author = program.ambassadors.find((a) => a.id === idea.ambassadorId);
        if (author) {
          addXp(author, program.settings.xpRules?.approvedContent || 100, 'Idée approuvée', program, {
            key: `idea_approved:${idea.id}`,
          });
          awardBadge(author, 'content_creator', program);
        }
      }
      await writeProgram(program);
      return json(headers, 200, { ok: true, idea });
    }

    if (action === 'community') {
      return json(headers, 200, {
        ok: true,
        channels: program.channels,
        reports: program.messageReports.slice(0, 50),
        recentMessages: program.messages.slice(-50),
      });
    }

    if (action === 'moderate-message' && event.httpMethod === 'POST') {
      const msg = program.messages.find((m) => m.id === body.messageId);
      if (!msg) return json(headers, 404, { error: 'Message introuvable' });
      if (body.delete) msg.deleted = true;
      if (body.muteAmbassadorId) {
        const target = program.ambassadors.find((a) => a.id === body.muteAmbassadorId);
        if (target) {
          target.mutedUntil = body.mutedUntil || new Date(Date.now() + 7 * 86400000).toISOString();
        }
      }
      if (body.reportId) {
        const r = program.messageReports.find((x) => x.id === body.reportId);
        if (r) r.status = 'resolved';
      }
      pushAudit(program, { actor: 'admin', action: 'moderate_message', meta: body });
      await writeProgram(program);
      return json(headers, 200, { ok: true });
    }

    if (action === 'post-announcement' && event.httpMethod === 'POST') {
      const text = String(body.text || '').trim().slice(0, 2000);
      if (!text) return json(headers, 400, { error: 'Texte requis' });
      const msg = {
        id: uid('msg'),
        channelId: 'announcements',
        ambassadorId: 'admin',
        text,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deleted: false,
        isAnnouncement: true,
      };
      program.messages.push(msg);
      for (const a of program.ambassadors.filter((x) => x.status === 'active')) {
        pushNotification(program, {
          ambassadorId: a.id,
          type: 'announcement',
          title: 'Annonce MENES',
          body: text.slice(0, 120),
        });
      }
      await writeProgram(program);
      return json(headers, 200, { ok: true, message: msg });
    }

    if (action === 'export' && event.httpMethod === 'GET') {
      const type = event.queryStringParameters?.type || 'ambassadors';
      let rows = [];
      if (type === 'ambassadors') {
        rows = program.ambassadors.map((a) => ({
          id: a.id, email: a.email, displayName: a.displayName, status: a.status,
          slug: a.slug, promoCode: a.promoCode, sales: a.stats?.personalSales || 0,
          orders: a.stats?.personalOrders || 0, commission: a.stats?.personalCommission || 0,
          xp: a.xp, rankId: a.rankId, referredBy: a.referredBy || '',
        }));
      } else if (type === 'commissions') {
        rows = program.commissions;
      } else if (type === 'payouts') {
        rows = program.payouts;
      }
      return json(headers, 200, { ok: true, type, rows });
    }

    if (action === 'audit') {
      return json(headers, 200, { ok: true, auditLog: (program.auditLog || []).slice(0, 200) });
    }

    await writeProgram(program);
    return json(headers, 400, { error: `Action inconnue: ${action}` });
  } catch (err) {
    console.error('ambassador-admin', err);
    return json(headers, 500, { error: err.message || 'Erreur serveur' });
  }
};

function cryptoRandom() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** Prevent A→B→A loops when assigning referredBy */
function wouldCreateReferralCycle(program, ambId, newParentId) {
  if (!newParentId) return false;
  if (ambId === newParentId) return true;
  let cur = newParentId;
  const seen = new Set();
  while (cur) {
    if (cur === ambId) return true;
    if (seen.has(cur)) return true;
    seen.add(cur);
    const parent = (program.ambassadors || []).find((a) => a.id === cur);
    cur = parent?.referredBy || null;
  }
  return false;
}
