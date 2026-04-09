/* ================================================================
   calculator.js — Fee Calculator & Comparison Engine
   SwiftPay — Credit Card to Bank Transfer
   ================================================================ */

'use strict';

// ---- Fee Rates for comparison ----
const PROVIDERS = {
  swiftpay: { name: 'SwiftPay', rate: 0.015 },
  cred:     { name: 'Cred',     rate: 0.025 },
  indus:    { name: 'IndusInd', rate: 0.030 },
  hdfc:     { name: 'HDFC',     rate: 0.035 },
};
const GST = 0.18;

/**
 * Calculates total paid by user for a given provider's fee rate.
 * Fee is deducted from transfer amount, recipient gets the full amount.
 * So user pays: amount + fee + GST(fee)
 */
function calcUserPays(amount, rate) {
  const rawFee = amount * rate;
  const fee = Math.min(Math.max(rawFee, amount > 0 ? 1 : 0), 9999);
  const gst = fee * GST;
  return {
    fee: Math.round(fee * 100) / 100,
    gst: Math.round(gst * 100) / 100,
    total: Math.round((amount + fee + gst) * 100) / 100,
    recipient: amount,
  };
}

/**
 * Updates the fee comparison table and savings banner.
 * @param {number|string} value - Transfer amount in rupees
 */
function updateCalculator(value) {
  const amount = parseFloat(value) || 0;

  // Update display
  const displayEl = document.getElementById('calc-amount-display');
  if (displayEl) {
    displayEl.textContent = `₹${fmtCalc(amount)}`;
  }

  // Update slider gradient
  const slider = document.getElementById('calc-slider');
  if (slider) {
    slider.value = amount;
    const pct = ((amount - 500) / (500000 - 500)) * 100;
    slider.style.background = `linear-gradient(to right, #3B82F6 0%, #06B6D4 ${pct}%, rgba(255,255,255,0.08) ${pct}%, rgba(255,255,255,0.08) 100%)`;
  }

  // Calculate for each provider
  const results = {};
  for (const [key, provider] of Object.entries(PROVIDERS)) {
    results[key] = calcUserPays(amount, provider.rate);
  }

  // SwiftPay
  setCalcText('cc-swiftpay-total', `₹${fmtCalc(results.swiftpay.total)}`);
  setCalcText('cc-swiftpay-recv', `₹${fmtCalc(results.swiftpay.recipient)}`);
  setCalcText('cc-swiftpay-fee',  `1.5% + GST`);

  // Cred
  setCalcText('cc-cred-total', `₹${fmtCalc(results.cred.total)}`);
  setCalcText('cc-cred-recv',  `₹${fmtCalc(results.cred.recipient)}`);

  // IndusInd
  setCalcText('cc-indus-total', `₹${fmtCalc(results.indus.total)}`);
  setCalcText('cc-indus-recv',  `₹${fmtCalc(results.indus.recipient)}`);

  // HDFC
  setCalcText('cc-hdfc-total', `₹${fmtCalc(results.hdfc.total)}`);
  setCalcText('cc-hdfc-recv',  `₹${fmtCalc(results.hdfc.recipient)}`);

  // Savings
  const savingsHdfc = Math.max(0, results.hdfc.total - results.swiftpay.total);
  const savingsCred = Math.max(0, results.cred.total - results.swiftpay.total);

  setCalcText('savings-amount', `₹${fmtCalc(savingsHdfc)}`);
  setCalcText('savings-vs-cred', `₹${fmtCalc(savingsCred)}`);

  // Update banner visibility
  const banner = document.getElementById('savings-banner');
  if (banner) {
    banner.style.display = amount > 0 ? 'flex' : 'none';
  }
}

function setCalcText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function fmtCalc(n) {
  if (!n || isNaN(n)) return '0';
  return Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
