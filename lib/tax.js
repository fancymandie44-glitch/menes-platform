'use strict';

/** Canadian GST/HST/QST by province. NS HST is 14% (2025+). */
const CA = {
  QC: { rate: 14.975, label: 'TPS 5% + TVQ 9,975%' },
  ON: { rate: 13, label: 'TVH 13%' },
  AB: { rate: 5, label: 'TPS 5%' },
  BC: { rate: 12, label: 'TPS 5% + TVP 7%' },
  MB: { rate: 12, label: 'TPS 5% + TVP 7%' },
  SK: { rate: 11, label: 'TPS 5% + TVP 6%' },
  NS: { rate: 14, label: 'TVH 14%' },
  NB: { rate: 15, label: 'TVH 15%' },
  NL: { rate: 15, label: 'TVH 15%' },
  PE: { rate: 15, label: 'TVH 15%' },
  NT: { rate: 5, label: 'TPS 5%' },
  NU: { rate: 5, label: 'TPS 5%' },
  YT: { rate: 5, label: 'TPS 5%' },
};

/** Standard destination VAT for countries offered at checkout. US has no federal VAT. */
const COUNTRY = {
  FR: { rate: 20, label: 'TVA 20%' },
  BE: { rate: 21, label: 'TVA 21%' },
  DE: { rate: 19, label: 'MwSt 19%' },
  ES: { rate: 21, label: 'IVA 21%' },
  IT: { rate: 22, label: 'IVA 22%' },
  NL: { rate: 21, label: 'BTW 21%' },
  CH: { rate: 8.1, label: 'TVA 8,1%' },
  GB: { rate: 20, label: 'VAT 20%' },
};

function quoteTax({ country = 'CA', province = '', amount = 0 } = {}) {
  const cc = String(country || 'CA').trim().toUpperCase();
  const taxable = Math.max(0, Number(amount) || 0);
  let rule = { rate: 0, label: '' };
  if (cc === 'CA') {
    const prov = String(province || '').trim().toUpperCase();
    rule = CA[prov] || CA.QC;
  } else if (COUNTRY[cc]) {
    rule = COUNTRY[cc];
  }
  const taxAmount = Math.round(taxable * (rule.rate / 100) * 100) / 100;
  return {
    amount: taxAmount,
    label: rule.label,
    rate: rule.rate / 100,
    percent: rule.rate,
  };
}

module.exports = { quoteTax, CA_TAX: CA, COUNTRY_TAX: COUNTRY };
