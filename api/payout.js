// ================================================================
// api/payout.js — Vercel Serverless Function
// Initiates RazorpayX payout to beneficiary bank account / UPI
//
// Requires a RazorpayX account (apply at https://x.razorpay.com/)
// ================================================================

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    beneficiary_name,
    account_number,
    ifsc,
    upi_id,
    amount,          // amount in paise
    payment_id,
  } = req.body;

  if (!amount || !payment_id) {
    return res.status(400).json({ error: 'amount and payment_id are required' });
  }

  try {
    // Build fund_account object based on type (bank or UPI)
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
        return res.status(400).json({
          error: 'Bank transfer requires beneficiary_name, account_number and ifsc',
        });
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

    // RazorpayX Payout API call
    const authHeader = Buffer.from(
      `${process.env.RAZORPAYX_KEY_ID}:${process.env.RAZORPAYX_KEY_SECRET}`
    ).toString('base64');

    const response = await fetch('https://api.razorpay.com/v1/payouts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${authHeader}`,
      },
      body: JSON.stringify({
        account_number: process.env.RAZORPAYX_ACCOUNT_NUMBER,
        fund_account,
        amount,
        currency: 'INR',
        mode: amount >= 20000000 ? 'RTGS' : 'IMPS',   // RTGS for ≥₹2 lakh
        purpose: 'payout',
        queue_if_low_balance: true,
        narration: 'SwiftPay Transfer',
        reference_id: payment_id,
      }),
    });

    const payout = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: payout.error?.description || 'Payout initiation failed',
      });
    }

    res.status(200).json({
      payout_id: payout.id,
      status: payout.status,
      utr: payout.utr || null,
      mode: payout.mode,
    });
  } catch (err) {
    console.error('Payout error:', err);
    res.status(500).json({ error: err.message });
  }
};
