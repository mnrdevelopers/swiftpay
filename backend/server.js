// ================================================================
// server.js — SwiftPay Backend (Node.js + Express)
// Production-ready Razorpay + RazorpayX integration
//
// Setup:
//   npm install express razorpay cors dotenv
//   node server.js
// ================================================================

'use strict';

require('dotenv').config();
const express    = require('express');
const Razorpay   = require('razorpay');
const crypto     = require('crypto');
const cors       = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;

// ---------- Middleware ----------
app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5500' }));
app.use(express.static('../'));   // Serve frontend from parent folder

// ---------- Razorpay Instance ----------
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ================================================================
// 1. CREATE ORDER
//    POST /api/create-order
//    Body: { amount: <number in paise>, currency: "INR", notes: {} }
//    Returns: { order_id, amount, currency }
// ================================================================
app.post('/api/create-order', async (req, res) => {
  try {
    const { amount, currency = 'INR', notes = {} } = req.body;

    if (!amount || amount < 50000) {   // Min ₹500 = 50000 paise
      return res.status(400).json({ error: 'Minimum amount is ₹500 (50000 paise)' });
    }

    const order = await razorpay.orders.create({
      amount,
      currency,
      receipt: `rcpt_${Date.now()}`,
      notes,
    });

    res.json({ order_id: order.id, amount: order.amount, currency: order.currency });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ================================================================
// 2. VERIFY PAYMENT SIGNATURE
//    POST /api/verify-payment
//    Body: { payment_id, order_id, signature }
//    Returns: { verified: true } or 400 error
// ================================================================
app.post('/api/verify-payment', (req, res) => {
  const { payment_id, order_id, signature } = req.body;

  if (!payment_id || !order_id || !signature) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
  hmac.update(`${order_id}|${payment_id}`);
  const generated = hmac.digest('hex');

  if (generated !== signature) {
    return res.status(400).json({ error: 'Invalid payment signature — possible fraud attempt' });
  }

  res.json({ verified: true, payment_id, order_id });
});

// ================================================================
// 3. INITIATE PAYOUT (RazorpayX)
//    POST /api/payout
//    Body: {
//      beneficiary_name, account_number, ifsc,   (bank transfer)
//      OR upi_id,                                 (UPI transfer)
//      amount,    // in paise
//      payment_id // from verified payment
//    }
//    Returns: { payout_id, status }
// ================================================================
app.post('/api/payout', async (req, res) => {
  try {
    const {
      beneficiary_name,
      account_number,
      ifsc,
      upi_id,
      amount,
      payment_id,
    } = req.body;

    if (!amount || !payment_id) {
      return res.status(400).json({ error: 'amount and payment_id are required' });
    }

    // Build fund account based on type
    let fund_account;
    if (upi_id) {
      fund_account = {
        account_type: 'vpa',
        vpa: { address: upi_id },
        contact: {
          name: upi_id.split('@')[0],
          type: 'customer',
          reference_id: `ref_${Date.now()}`,
        },
      };
    } else {
      if (!account_number || !ifsc || !beneficiary_name) {
        return res.status(400).json({ error: 'Bank transfer requires beneficiary_name, account_number, ifsc' });
      }
      fund_account = {
        account_type: 'bank_account',
        bank_account: {
          name: beneficiary_name,
          ifsc: ifsc.toUpperCase(),
          account_number,
        },
        contact: {
          name: beneficiary_name,
          type: 'customer',
          reference_id: `ref_${Date.now()}`,
        },
      };
    }

    // RazorpayX Payout API
    const response = await fetch('https://api.razorpay.com/v1/payouts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAYX_KEY_ID}:${process.env.RAZORPAYX_KEY_SECRET}`).toString('base64')}`,
      },
      body: JSON.stringify({
        account_number: process.env.RAZORPAYX_ACCOUNT_NUMBER,
        fund_account,
        amount,
        currency: 'INR',
        mode: amount >= 20000000 ? 'RTGS' : 'IMPS',  // RTGS for ≥₹2L
        purpose: 'payout',
        queue_if_low_balance: true,
        narration: 'SwiftPay Transfer',
        reference_id: payment_id,
      }),
    });

    const payout = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: payout.error?.description || 'Payout failed' });
    }

    res.json({ payout_id: payout.id, status: payout.status, utr: payout.utr });
  } catch (err) {
    console.error('Payout error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ================================================================
// 4. WEBHOOK — Razorpay Payment Events
//    POST /api/webhook
//    (Register this URL in Razorpay Dashboard → Webhooks)
// ================================================================
app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature  = req.headers['x-razorpay-signature'];
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  const hmac = crypto.createHmac('sha256', webhookSecret);
  hmac.update(req.body);
  const digest = hmac.digest('hex');

  if (digest !== signature) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  const event = JSON.parse(req.body);
  console.log('Webhook event:', event.event);

  // Handle events
  switch (event.event) {
    case 'payment.captured':
      console.log('Payment captured:', event.payload.payment.entity.id);
      // --> Trigger payout here or via queue
      break;
    case 'payout.processed':
      console.log('Payout processed:', event.payload.payout.entity.id);
      // --> Update transaction status in DB
      break;
    case 'payout.failed':
      console.log('Payout failed:', event.payload.payout.entity.id);
      // --> Initiate refund
      break;
  }

  res.json({ status: 'ok' });
});

// ================================================================
// 5. HEALTH CHECK
// ================================================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mode: process.env.NODE_ENV || 'development', time: new Date().toISOString() });
});

// ---------- Start Server ----------
app.listen(PORT, () => {
  console.log(`SwiftPay backend running at http://localhost:${PORT}`);
  console.log(`Mode: ${process.env.NODE_ENV || 'development'}`);
});
