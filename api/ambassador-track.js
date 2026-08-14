/**
 * Public attribution tracking for ambassador links.
 * Sets attribution payload the shop can attach to checkout.
 */

const { setLambdaEvent } = require('../lib/platform');
const { corsHeaders } = require('../lib/cors');
const { readProgram, writeProgram, uid, slugify } = require('../lib/ambassador-data');
const { awardLinkClickXp } = require('../lib/ambassador-engine');

function json(headers, status, body) {
  return { statusCode: status, headers, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  setLambdaEvent(event);
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  try {
    const params = event.queryStringParameters || {};
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch {}

    const slug = slugify(params.slug || body.slug || '');
    const campaignId = params.campaign || body.campaign || null;
    if (!slug) return json(headers, 400, { error: 'slug requis' });

    const program = await readProgram();
    const amb = program.ambassadors.find((a) => a.slug === slug && a.status === 'active');
    if (!amb) return json(headers, 404, { error: 'Ambassadeur introuvable' });

    const click = {
      id: uid('clk'),
      ambassadorId: amb.id,
      slug,
      campaignId,
      sessionId: String(params.session || body.session || '').slice(0, 64) || null,
      referrer: String(event.headers?.referer || event.headers?.Referer || '').slice(0, 300),
      createdAt: new Date().toISOString(),
    };
    if (!Array.isArray(program.attributionClicks)) program.attributionClicks = [];
    program.attributionClicks.unshift(click);
    if (program.attributionClicks.length > 5000) program.attributionClicks.length = 5000;

    awardLinkClickXp(amb, program);
    await writeProgram(program);

    const attribution = {
      ambassadorId: amb.id,
      slug: amb.slug,
      promoCode: amb.promoCode,
      method: 'ambassador_link',
      campaignId,
      clickedAt: click.createdAt,
      expiresAt: new Date(
        Date.now() + (Number(program.settings.attributionDays) || 30) * 86400000
      ).toISOString(),
    };

    return json(headers, 200, {
      ok: true,
      attribution,
      redirect: `${program.settings.shopBaseUrl || 'https://boutiquemenes.netlify.app'}/?ref=${amb.slug}`,
      displayName: amb.displayName,
    });
  } catch (err) {
    return json(headers, 500, { error: err.message || 'Erreur' });
  }
};
