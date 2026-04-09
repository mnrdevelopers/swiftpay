// ================================================================
// api/create-order.js — Vercel Serverless Function
// SwiftPay: Creates a Razorpay order
//
// Deploy FREE on Vercel:
//   1. Push this project to GitHub
//   2. Import to vercel.com (free account)
//   3. Add environment variables in Vercel Dashboard
//   4. Done — your API is live at https://yourapp.vercel.app/api/create-order
// ================================================================

const Razorpay = require('razorpay');

module.exports = async function handler(req, res) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { amount, currency = 'INR', notes = {} } = req.body;

    if (!amount || amount < 50000) {
      return res.status(400).json({ error: 'Minimum amount is ₹500 (50000 paise)' });
    }

    const razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const order = await razorpay.orders.create({
      amount,
      currency,
      receipt: `rcpt_${Date.now()}`,
      notes,
    });

    res.status(200).json({
      order_id: order.id,
      amount:   order.amount,
      currency: order.currency,
    });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: err.message });
  }
};
