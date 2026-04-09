// ================================================================
// api/verify-payment.js — Vercel Serverless Function
// Verifies Razorpay payment signature (prevents fraud)
// ================================================================

const crypto = require('crypto');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { payment_id, order_id, signature } = req.body;

  if (!payment_id || !order_id || !signature) {
    return res.status(400).json({ error: 'Missing required fields: payment_id, order_id, signature' });
  }

  try {
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(`${order_id}|${payment_id}`);
    const generated = hmac.digest('hex');

    if (generated !== signature) {
      return res.status(400).json({ error: 'Invalid payment signature — possible tampered request' });
    }

    res.status(200).json({ verified: true, payment_id, order_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
