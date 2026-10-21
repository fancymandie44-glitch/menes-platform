'use strict';

const BANNED = [
  /\bguaranteed?\b/i,
  /\bmiracle\b/i,
  /\bcure\b/i,
  /\bbefore\s*\/\s*after\b/i,
  /\bwhite(?:ning)? (?:skin|teeth)\b/i,
  /\bget rich\b/i,
  /\bno risk\b/i,
  /\b100%\s*effective\b/i,
  /\bfree money\b/i,
  /\bcrypto giveaway\b/i,
];

function collectText(draft) {
  const bits = [
    draft?.primaryText, draft?.headline, draft?.description,
    ...(Array.isArray(draft?.variations) ? draft.variations.flatMap((v) => [v.primaryText, v.headline, v.description]) : []),
  ];
  return bits.filter(Boolean).join('\n');
}

function looksEnglish(text) {
  const s = String(text || '');
  if (s.length < 12) return true;
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const ascii = s.replace(/[^A-Za-z]/g, '');
  if (!letters) return true;
  if (ascii.length / letters.length < 0.7) return false;
  const fr = (s.match(/\b(le|la|les|des|une|un|et|pour|avec|achetez|pi[eè]ce|sac|maintenant|garantie|bandouli[eè]re)\b/gi) || []).length;
  const en = (s.match(/\b(the|and|for|with|shop|wear|bridge|values|drop|street)\b/gi) || []).length;
  if (fr >= 2 && fr > en) return false;
  return true;
}

function checkAdCompliance(draft) {
  const issues = [];
  const blob = collectText(draft);
  if (!blob.trim()) issues.push({ severity: 'critical', message: 'Ad copy is empty' });
  if (!looksEnglish(blob)) issues.push({ severity: 'critical', message: 'Customer-facing ad copy must be English only' });
  for (const re of BANNED) {
    if (re.test(blob)) issues.push({ severity: 'critical', message: `Prohibited wording matched: ${re}` });
  }
  if (!draft?.landingPageUrl) issues.push({ severity: 'warning', message: 'Missing landing page URL' });
  if (!draft?.cta) issues.push({ severity: 'warning', message: 'Missing call to action' });
  if (Number(draft?.dailyBudget) > 0 && !draft?.objective) {
    issues.push({ severity: 'warning', message: 'Budget set without an objective' });
  }
  const ok = !issues.some((i) => i.severity === 'critical');
  return { ok, issues };
}

module.exports = { checkAdCompliance, looksEnglish };
