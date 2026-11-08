'use strict';

const { notifyPassportWelcome, notifySimple, brandShell, escHtml, emailConfigured } = require('./notify');
const { publicCode } = require('./passport');

async function deliverNewPassportEmails(store, result, locale) {
  if (!result?.created || !result.passport) return { welcome: { ok: true, skipped: true } };
  const view = { ...result.passport, code: publicCode(result.passport.id) };
  const welcome = await notifyPassportWelcome(view, { locale });
  if (welcome.ok && !welcome.skipped) {
    result.passport.welcomeEmailAt = new Date().toISOString();
  }
  if (emailConfigured()) {
    try {
      await notifySimple({
        store,
        subject: `Passeport MENES · ${result.passport.email}`,
        html: brandShell({
          title: 'Nouveau passeport',
          bodyHtml: `<p style="color:#9a958c">${escHtml(result.passport.email)} · source ${escHtml(result.passport.source || 'passport')} · ${(store.subscribers || []).filter((s) => s.active !== false).length} abonnés</p>`,
        }),
      });
    } catch {}
  }
  return { welcome };
}

module.exports = { deliverNewPassportEmails };
