// ================================================================
// api/webhook.js — Vercel Serverless Function
// Handles Razorpay webhook events
//
// Register this URL in Razorpay Dashboard → Settings → Webhooks:
//   https://your-app.vercel.app/api/webhook
// ================================================================

const crypto = require('crypto');

// Disable body parsing so we get raw body for signature verification
export const config = {
  api: { bodyParser: false },
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  // Read raw body
  const rawBody = await getRawBody(req);
  const signature = req.headers['x-razorpay-signature'];

  // Verify webhook signature
  const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET);
  hmac.update(rawBody);
  const digest = hmac.digest('hex');

  if (digest !== signature) {
    console.error('Invalid webhook signature');
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  const event = JSON.parse(rawBody);
  console.log('Webhook received:', event.event);

  // Handle different events
  switch (event.event) {
    case 'payment.captured':
      // Payment was successful — safe to trigger payout
      console.log('Payment captured:', event.payload.payment.entity.id);
      // TODO: Trigger payout via internal call or queue
      break;

    case 'payout.processed':
      // Bank transfer successful
      console.log('Payout processed:', event.payload.payout.entity.id);
      break;

    case 'payout.failed':
      // Bank transfer failed — initiate refund
      console.log('Payout failed:', event.payload.payout.entity.id);
      // TODO: Trigger refund via Razorpay Refunds API
      break;

    case 'refund.created':
      console.log('Refund created:', event.payload.refund.entity.id);
      break;

    default:
      console.log('Unhandled event:', event.event);
  }

  res.status(200).json({ status: 'ok' });
};

// Helper: read raw body for HMAC verification
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
