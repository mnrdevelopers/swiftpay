/* ================================================================
   razorpay.js — Razorpay Checkout Integration
   SwiftPay — Credit Card to Bank Transfer
   ================================================================ */

'use strict';

/**
 * DEMO MODE  → Works right now, no backend needed.
 *              Test card: 4111 1111 1111 1111 | Expiry: 12/27 | CVV: 123 | OTP: 1234
 *
 * PRODUCTION → Deploy this project FREE to Vercel (see bottom of file).
 *              The api/ folder handles all secret key operations securely.
 */

// ── YOUR Razorpay PUBLIC key (safe to expose in frontend) ─────────────────────
const RAZORPAY_KEY = 'rzp_test_SNNQBnNeaIWbLr';

// ── API base URL ──────────────────────────────────────────────────────────────
// Leave as '' — works for both Local (Live Server) and Vercel deployment.
// Vercel auto-routes /api/* to the serverless functions in the api/ folder.
const API_BASE = '';

/* ================================================================
   openRazorpayCheckout()
   Called from app.js → initiatePayment()
   Gracefully falls back to demo mode if Vercel API is not deployed yet.
   ================================================================ */
async function openRazorpayCheckout(totalPaise, transferState) {
  if (typeof Razorpay === 'undefined') {
    showToast('Razorpay could not load. Check your internet connection.', 'error');
    return;
  }

  // Disable pay button while processing
  const payBtn = document.getElementById('pay-btn');
  if (payBtn) { payBtn.disabled = true; payBtn.textContent = 'Preparing payment…'; }

  try {
    // ── STEP 1: Create Razorpay Order via Vercel API ─────────────────────────
    let orderId = null;
    try {
      const res = await fetch(`${API_BASE}/api/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: totalPaise,
          currency: 'INR',
          notes: buildNotes(transferState),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        orderId = data.order_id || null;
      }
    } catch {
      // Backend not deployed yet → demo mode (no real payout)
      console.info('SwiftPay: Vercel API not reachable — running in demo mode.');
    }

    // ── STEP 2: Open Razorpay Checkout popup ─────────────────────────────────
    const methodMap = {
      credit_card: 'card',
      debit_card:  'card',
      wallet:      'wallet',
      netbanking:  'netbanking',
    };

    const recipientDisplay =
      transferState.destType === 'bank'
        ? `${transferState.beneficiaryName} (A/C ••••${transferState.accountNumber?.slice(-4)})`
        : transferState.upiId;

    const options = {
      key:         RAZORPAY_KEY,
      amount:      totalPaise,
      currency:    'INR',
      name:        'SwiftPay',
      description: `Transfer ₹${(totalPaise / 100).toLocaleString('en-IN')} → ${recipientDisplay}`,
      image:       '',

      // Attach real order_id when backend is live
      ...(orderId ? { order_id: orderId } : {}),

      prefill: {
        name:    transferState.destType === 'bank' ? transferState.beneficiaryName : '',
        email:   '',
        contact: '',
      },

      notes: buildNotes(transferState),

      theme: {
        color:          '#3B82F6',
        backdrop_color: 'rgba(4,7,15,0.85)',
      },

      modal: {
        ondismiss() {
          window.onPaymentFailed?.({ description: 'Cancelled by user' });
        },
        animation: true,
      },

      config: {
        display: {
          blocks: {
            preferred: {
              name: 'Recommended',
              instruments: [{ method: methodMap[transferState.source] || 'card' }],
            },
          },
          sequence:    ['block.preferred'],
          preferences: { show_default_blocks: true },
        },
      },

      handler: async function (response) {
        // ── STEP 3: Verify + Payout after successful payment ─────────────────
        await verifyAndPayout(response, transferState);
      },
    };

    const rzp = new Razorpay(options);
    rzp.on('payment.failed', (response) => {
      window.onPaymentFailed?.(response.error);
      showToast(`Payment failed: ${response.error?.description || 'Unknown error'}`, 'error');
    });
    rzp.open();

  } finally {
    if (payBtn) {
      payBtn.disabled = false;
      payBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        Pay &amp; Transfer Now`;
    }
  }
}

/* ================================================================
   verifyAndPayout()
   Verifies Razorpay payment signature, then triggers RazorpayX payout.
   Both steps are handled by Vercel serverless functions (api/ folder).
   ================================================================ */
async function verifyAndPayout(response, transferState) {
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = response;

  // Verify signature only when order_id is present (production mode)
  if (razorpay_order_id && razorpay_signature) {
    try {
      const vRes = await fetch(`${API_BASE}/api/verify-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_id: razorpay_payment_id,
          order_id:   razorpay_order_id,
          signature:  razorpay_signature,
        }),
      });
      if (!vRes.ok) {
        showToast('⚠️ Payment could not be verified. Contact support.', 'error');
        return;
      }
    } catch {
      console.info('Signature verification skipped — demo mode.');
    }
  }

  // Trigger payout
  try {
    const payloadPayout =
      transferState.destType === 'bank'
        ? {
            beneficiary_name: transferState.beneficiaryName,
            account_number:   transferState.accountNumber,
            ifsc:             transferState.ifscCode,
          }
        : { upi_id: transferState.upiId };

    await fetch(`${API_BASE}/api/payout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payloadPayout,
        amount:     Math.round(transferState.amount * 100),
        payment_id: razorpay_payment_id,
      }),
    });
  } catch {
    console.info('Payout API skipped — demo mode.');
  }

  // Notify app.js of overall success
  window.onPaymentSuccess?.({ razorpay_payment_id, razorpay_order_id });
}

/* ── Helper: build Razorpay notes ─────────────────────────────────────────── */
function buildNotes(t) {
  const notes = { purpose: 'Credit Card to Bank Transfer', source_type: t.source };
  if (t.destType === 'bank') {
    notes.beneficiary    = t.beneficiaryName;
    notes.account_last4  = t.accountNumber?.slice(-4);
    notes.ifsc           = t.ifscCode;
  } else {
    notes.upi_id = t.upiId;
  }
  return notes;
}

/* ================================================================
   🚀 DEPLOY FREE ON VERCEL — Step-by-Step Guide
   ================================================================

   No Node.js server to run. Vercel is 100% free for this project.

   STEP 1 — Push to GitHub
   ───────────────────────
     git init
     git add .
     git commit -m "SwiftPay initial"
     git remote add origin https://github.com/YOU/swiftpay.git
     git push -u origin main

   STEP 2 — Import to Vercel
   ─────────────────────────
     → vercel.com/new → Import Git Repository
     → Select your repo → Click Deploy
     → Done! Live at https://swiftpay-xyz.vercel.app

   STEP 3 — Add Environment Variables (in Vercel Dashboard)
   ──────────────────────────────────────────────────────────
     RAZORPAY_KEY_ID          = rzp_test_SNNQBnNeaIWbLr
     RAZORPAY_KEY_SECRET      = <from Razorpay Dashboard>
     RAZORPAYX_KEY_ID         = <from x.razorpay.com>
     RAZORPAYX_KEY_SECRET     = <from x.razorpay.com>
     RAZORPAYX_ACCOUNT_NUMBER = <your RazorpayX current account>
     RAZORPAY_WEBHOOK_SECRET  = <from Razorpay Dashboard → Webhooks>

   STEP 4 — Register Webhook
   ─────────────────────────
     Razorpay Dashboard → Settings → Webhooks → Add new:
     URL: https://swiftpay-xyz.vercel.app/api/webhook
     Events: payment.captured, payout.processed, payout.failed

   STEP 5 — Switch to Live Keys
   ─────────────────────────────
     Replace RAZORPAY_KEY above with: rzp_live_XXXX
     Update RAZORPAY_KEY_ID env var in Vercel dashboard.

   ================================================================ */
