'use strict';

/** Change this one constant (or set ANTHROPIC_MODEL) to swap the operator model. */
const COPILOT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

const COPILOT_MAX_STEPS = Math.min(16, Math.max(1, Number(process.env.COPILOT_MAX_STEPS) || 8));
const COPILOT_TIMEOUT_MS = Math.min(55_000, Math.max(8_000, Number(process.env.COPILOT_TIMEOUT_MS) || 45_000));
const COPILOT_DAILY_BUDGET_CAP = Math.max(1, Number(process.env.COPILOT_DAILY_BUDGET_CAP) || 50);
const COPILOT_TOTAL_BUDGET_CAP = Math.max(1, Number(process.env.COPILOT_TOTAL_BUDGET_CAP) || 500);

const BRAND_VOICE = [
  'English only for all customer-facing ad copy.',
  'On-brand: confident, street-smart, premium.',
  'Brand lines: "a bridge, not a wall"; "values we live, not just wear".',
  'No hype medical claims, no guaranteed results, no before/after body language.',
].join(' ');

function anthropicKey() {
  return String(process.env.ANTHROPIC_API_KEY || '').trim();
}

function anthropicConfigured() {
  return Boolean(anthropicKey());
}

function metaConfigured() {
  return Boolean(String(process.env.META_ACCESS_TOKEN || '').trim() && String(process.env.META_AD_ACCOUNT_ID || '').trim());
}

module.exports = {
  COPILOT_MODEL,
  COPILOT_MAX_STEPS,
  COPILOT_TIMEOUT_MS,
  COPILOT_DAILY_BUDGET_CAP,
  COPILOT_TOTAL_BUDGET_CAP,
  BRAND_VOICE,
  anthropicKey,
  anthropicConfigured,
  metaConfigured,
};
