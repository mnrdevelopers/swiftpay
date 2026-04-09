/* ================================================================
   app.js — SwiftPay Core Application Logic
   ================================================================ */

'use strict';

// ---- App State ----
const state = {
  currentStep: 1,
  source: 'credit_card',
  destType: 'bank',           // 'bank' | 'upi'
  beneficiaryName: '',
  accountNumber: '',
  ifscCode: '',
  bankName: '',
  upiId: '',
  amount: 0,
  fee: 0,
  gst: 0,
  total: 0,
  paymentId: null,
  orderId: null,
};

const FEE_RATE = 0.015;       // 1.5%
const GST_RATE = 0.18;        // 18% on fee
const MIN_FEE = 15;
const MAX_FEE = 500;

// ================================================================
// STEP NAVIGATION
// ================================================================
function goToStep(step) {
  const from = state.currentStep;
  const target = step;

  // Hide current, show target
  document.getElementById(`wizard-step-${from}`)?.classList.remove('active');
  document.getElementById(`wizard-step-${target}`)?.classList.add('active');

  // Update dots
  document.querySelectorAll('.step-item').forEach((el, i) => {
    const n = i + 1;
    el.classList.remove('active', 'completed');
    if (n < target) el.classList.add('completed');
    if (n === target) el.classList.add('active');
  });

  // Update connectors
  document.querySelectorAll('.step-connector').forEach((el, i) => {
    el.classList.toggle('filled', i < target - 1);
  });

  // Update aria
  const prog = document.getElementById('step-progress');
  if (prog) prog.setAttribute('aria-valuenow', target);

  state.currentStep = target;

  // Pre-fill review step
  if (target === 4) buildReviewCard();

  // Smooth scroll to section
  document.getElementById('transfer-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ================================================================
// SOURCE SELECTION
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Wire up source radio cards
  document.querySelectorAll('.source-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.source-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) {
        radio.checked = true;
        state.source = radio.value;
      }
    });
  });

  // Animate stat counter
  animateCounter('stat-transfers', 0, 18452, 1800);

  // Initialize calculator
  updateCalculator(10000);
  updateFeeBreakdown();

  // Render history
  renderHistory();

  // Slider gradient sync
  const slider = document.getElementById('calc-slider');
  if (slider) slider.addEventListener('input', () => syncSliderGradient(slider));
});

// ================================================================
// STEP 2 — DESTINATION
// ================================================================
function switchDestTab(type) {
  state.destType = type;
  document.querySelectorAll('.dest-tab').forEach(t => {
    t.classList.toggle('active', t.id === `tab-${type}`);
    t.setAttribute('aria-selected', t.id === `tab-${type}` ? 'true' : 'false');
  });
  document.querySelectorAll('.dest-panel').forEach(p => {
    p.classList.toggle('active', p.id === `panel-${type}`);
  });
}

async function verifyIFSC() {
  const code = document.getElementById('ifsc-code')?.value.trim().toUpperCase();
  const resultEl = document.getElementById('ifsc-result');
  const input = document.getElementById('ifsc-code');

  if (!code || code.length !== 11) {
    showFieldError(resultEl, 'IFSC must be 11 characters (e.g. SBIN0000123)');
    return;
  }

  resultEl.className = 'ifsc-result';
  resultEl.textContent = '⏳ Verifying IFSC…';
  document.getElementById('ifsc-verify-btn').disabled = true;

  try {
    const res = await fetch(`https://ifsc.razorpay.com/${code}`);
    if (res.ok) {
      const data = await res.json();
      state.bankName = data.BANK || '';
      resultEl.className = 'ifsc-result success';
      resultEl.textContent = `✓ ${data.BANK} — ${data.BRANCH}, ${data.CITY}`;
      input?.classList.add('success');
      input?.classList.remove('error');
    } else {
      resultEl.className = 'ifsc-result error';
      resultEl.textContent = '✗ Invalid IFSC code. Please check and retry.';
      input?.classList.add('error');
      input?.classList.remove('success');
    }
  } catch {
    resultEl.className = 'ifsc-result error';
    resultEl.textContent = '✗ Network error. Please verify your IFSC manually.';
  }

  document.getElementById('ifsc-verify-btn').disabled = false;
}

function verifyUPI() {
  const upi = document.getElementById('upi-id')?.value.trim();
  const resultEl = document.getElementById('upi-result');
  const input = document.getElementById('upi-id');
  const upiRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z]+$/;

  if (!upi || !upiRegex.test(upi)) {
    showFieldError(resultEl, '✗ Invalid UPI ID format. Example: name@upi');
    input?.classList.add('error');
    return;
  }

  resultEl.className = 'ifsc-result success';
  resultEl.textContent = `✓ UPI ID format valid: ${upi}`;
  input?.classList.add('success');
  input?.classList.remove('error');
}

function validateStep2() {
  if (state.destType === 'bank') {
    const name = document.getElementById('beneficiary-name')?.value.trim();
    const acno = document.getElementById('account-number')?.value.trim();
    const conf = document.getElementById('confirm-account')?.value.trim();
    const ifsc = document.getElementById('ifsc-code')?.value.trim().toUpperCase();

    if (!name) return showToast('Please enter the beneficiary name.', 'error');
    if (!acno || acno.length < 8) return showToast('Please enter a valid account number.', 'error');
    if (acno !== conf) return showToast('Account numbers do not match.', 'error');
    if (!ifsc || ifsc.length !== 11) return showToast('Please enter a valid 11-character IFSC code.', 'error');

    state.beneficiaryName = name;
    state.accountNumber = acno;
    state.ifscCode = ifsc;
  } else {
    const upi = document.getElementById('upi-id')?.value.trim();
    const upiRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z]+$/;
    if (!upi || !upiRegex.test(upi)) return showToast('Please enter a valid UPI ID.', 'error');
    state.upiId = upi;
    state.beneficiaryName = upi.split('@')[0];
  }

  goToStep(3);
}

// ================================================================
// STEP 3 — AMOUNT
// ================================================================
function setAmount(val) {
  const inp = document.getElementById('transfer-amount');
  if (inp) inp.value = val;

  // Highlight quick amount button
  document.querySelectorAll('.quick-amt').forEach(b => b.classList.remove('active'));
  const map = { 5000: 'qa-5k', 10000: 'qa-10k', 25000: 'qa-25k', 50000: 'qa-50k' };
  if (map[val]) document.getElementById(map[val])?.classList.add('active');

  updateFeeBreakdown();
}

function updateFeeBreakdown() {
  const inp = document.getElementById('transfer-amount');
  const raw = parseFloat(inp?.value) || 0;
  state.amount = raw;

  const rawFee = raw * FEE_RATE;
  state.fee = Math.min(Math.max(rawFee, raw > 0 ? MIN_FEE : 0), MAX_FEE);
  state.gst = Math.round(state.fee * GST_RATE * 100) / 100;
  state.total = Math.round((raw + state.fee + state.gst) * 100) / 100;

  const mode = raw >= 200000 ? 'RTGS (Same Day)' : raw >= 1000 ? 'IMPS (Instant)' : 'IMPS (Instant)';

  setText('fb-amount', `₹${fmt(raw)}`);
  setText('fb-fee', `₹${fmt(state.fee)}`);
  setText('fb-gst', `₹${fmt(state.gst)}`);
  setText('fb-total', `₹${fmt(state.total)}`);
  setText('fb-recipient', `₹${fmt(raw)}`);
  setText('fb-mode', mode);
}

function validateStep3() {
  const amt = parseFloat(document.getElementById('transfer-amount')?.value) || 0;
  if (amt < 500) return showToast('Minimum transfer amount is ₹500.', 'error');
  if (amt > 500000) return showToast('Maximum transfer amount is ₹5,00,000 per transaction.', 'error');
  state.amount = amt;
  goToStep(4);
}

// ================================================================
// STEP 4 — REVIEW
// ================================================================
function buildReviewCard() {
  const sourceLabels = {
    credit_card: '💳 Credit Card',
    debit_card: '🏧 Debit Card',
    wallet: '👛 Digital Wallet',
    netbanking: '🏦 Net Banking',
  };
  setText('rv-source', sourceLabels[state.source] || state.source);

  if (state.destType === 'bank') {
    setText('rv-to', state.beneficiaryName || '—');
    const masked = state.accountNumber ? `A/C: ••••${state.accountNumber.slice(-4)} | ${state.ifscCode}` : '—';
    setText('rv-to-sub', masked);
  } else {
    setText('rv-to', state.upiId || '—');
    setText('rv-to-sub', 'via UPI');
  }

  setText('rv-amount', `₹${fmt(state.amount)}`);
  setText('rv-fee', `₹${fmt(state.fee)}`);
  setText('rv-gst', `₹${fmt(state.gst)}`);
  setText('rv-total', `₹${fmt(state.total)}`);
}

// ================================================================
// PAYMENT — RAZORPAY CHECKOUT
// ================================================================
function initiatePayment() {
  const agreed = document.getElementById('terms-checkbox')?.checked;
  if (!agreed) return showToast('Please agree to the Terms & Conditions to continue.', 'warning');

  const totalPaise = Math.round(state.total * 100);
  openRazorpayCheckout(totalPaise, state);
}

// Called by razorpay.js on success
window.onPaymentSuccess = function(response) {
  state.paymentId = response.razorpay_payment_id;
  state.orderId = response.razorpay_order_id || ('ORD_' + Date.now());

  // Save to history
  addTransactionToHistory({
    id: state.paymentId || ('PAY_' + Date.now()),
    orderId: state.orderId,
    date: new Date().toISOString(),
    recipient: state.destType === 'bank'
      ? state.beneficiaryName
      : state.upiId,
    details: state.destType === 'bank'
      ? `A/C ••••${state.accountNumber.slice(-4)} | ${state.bankName || state.ifscCode}`
      : state.upiId,
    amount: state.amount,
    fee: state.fee + state.gst,
    total: state.total,
    source: state.source,
    status: 'completed',
    mode: state.amount >= 200000 ? 'RTGS' : 'IMPS',
  });

  // Show success modal
  setText('modal-desc', `₹${fmt(state.amount)} is being transferred to ${state.destType === 'bank' ? state.beneficiaryName : state.upiId} via ${state.amount >= 200000 ? 'RTGS' : 'IMPS'}. Funds credited within 2–5 minutes.`);
  setText('modal-txn', `Payment ID: ${state.paymentId || '—'}\nOrder ID: ${state.orderId || '—'}`);

  const modal = document.getElementById('success-modal');
  if (modal) modal.hidden = false;
};

// Called by razorpay.js on failure / dismiss
window.onPaymentFailed = function(err) {
  showToast('Payment failed or was cancelled. Please try again.', 'error');
  console.error('Payment error:', err);
};

function closeModal() {
  const modal = document.getElementById('success-modal');
  if (modal) modal.hidden = true;
  document.getElementById('history-section')?.scrollIntoView({ behavior: 'smooth' });
  renderHistory();
}

function resetWizard() {
  const modal = document.getElementById('success-modal');
  if (modal) modal.hidden = true;
  Object.assign(state, {
    currentStep: 1, source: 'credit_card', destType: 'bank',
    beneficiaryName: '', accountNumber: '', ifscCode: '', bankName: '',
    upiId: '', amount: 0, fee: 0, gst: 0, total: 0, paymentId: null, orderId: null,
  });
  document.querySelectorAll('.form-input').forEach(el => { el.value = ''; el.className = 'form-input'; });
  document.querySelectorAll('.ifsc-result').forEach(el => { el.textContent = ''; el.className = 'ifsc-result'; });
  document.getElementById('transfer-amount') && (document.getElementById('transfer-amount').value = '');
  document.getElementById('terms-checkbox') && (document.getElementById('terms-checkbox').checked = false);
  updateFeeBreakdown();
  goToStep(1);
  document.getElementById('transfer-section')?.scrollIntoView({ behavior: 'smooth' });
  renderHistory();
}

// ================================================================
// UI HELPERS
// ================================================================
function showToast(message, type = 'info') {
  // Remove any existing toast
  document.getElementById('sp-toast')?.remove();

  const toast = document.createElement('div');
  toast.id = 'sp-toast';
  const colors = { error: '#EF4444', success: '#10B981', warning: '#F59E0B', info: '#3B82F6' };
  toast.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:9999;
    background:${colors[type] || colors.info}15;
    border: 1px solid ${colors[type] || colors.info}40;
    color:${colors[type] || colors.info};
    padding:14px 20px; border-radius:12px;
    font-size:0.875rem; font-weight:500;
    backdrop-filter:blur(12px);
    max-width:360px; line-height:1.5;
    box-shadow:0 8px 24px rgba(0,0,0,0.3);
    animation: toastIn 0.3s cubic-bezier(0.34,1.56,0.64,1);
  `;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');
  toast.textContent = message;

  const style = document.createElement('style');
  style.textContent = `@keyframes toastIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }`;
  toast.appendChild(style);
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function showFieldError(el, msg) {
  if (!el) return;
  el.className = 'ifsc-result error';
  el.textContent = msg;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function fmt(n) {
  if (!n || isNaN(n)) return '0';
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function animateCounter(id, start, end, duration) {
  const el = document.getElementById(id);
  if (!el) return;
  const range = end - start;
  const step = Math.ceil(range / (duration / 16));
  let current = start;
  const timer = setInterval(() => {
    current += step;
    if (current >= end) { current = end; clearInterval(timer); }
    el.textContent = current.toLocaleString('en-IN') + '+';
  }, 16);
}

function syncSliderGradient(slider) {
  const min = parseFloat(slider.min);
  const max = parseFloat(slider.max);
  const val = parseFloat(slider.value);
  const pct = ((val - min) / (max - min)) * 100;
  slider.style.background = `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${pct}%, rgba(255,255,255,0.1) ${pct}%, rgba(255,255,255,0.1) 100%)`;
}
