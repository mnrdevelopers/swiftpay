/* ================================================================
   history.js — Transaction History Manager
   SwiftPay — Credit Card to Bank Transfer
   ================================================================ */

'use strict';

const HISTORY_KEY = 'swiftpay_txn_history';

// ---- Get all transactions ----
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

// ---- Save transactions ----
function saveHistory(txns) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(txns));
  } catch {
    console.error('Could not save transaction history.');
  }
}

// ---- Add a new transaction ----
function addTransactionToHistory(txn) {
  const history = getHistory();
  history.unshift(txn);          // Newest first
  if (history.length > 100) history.pop();  // Keep max 100
  saveHistory(history);
  renderHistory();
}

// ---- Render the table ----
let _filterQuery = '';

function renderHistory(filter) {
  if (filter !== undefined) _filterQuery = (filter || '').toLowerCase();

  const tbody = document.getElementById('history-tbody');
  const emptyEl = document.getElementById('history-empty');
  const tableEl = document.getElementById('history-table');
  if (!tbody) return;

  tbody.innerHTML = '';

  let history = getHistory();

  if (_filterQuery) {
    history = history.filter(t =>
      (t.recipient || '').toLowerCase().includes(_filterQuery) ||
      (t.id || '').toLowerCase().includes(_filterQuery) ||
      (t.orderId || '').toLowerCase().includes(_filterQuery) ||
      (t.details || '').toLowerCase().includes(_filterQuery)
    );
  }

  if (history.length === 0) {
    if (emptyEl) emptyEl.style.display = 'flex';
    if (tableEl) tableEl.style.display = 'none';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (tableEl) tableEl.style.display = 'table';

  history.forEach((txn, idx) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <div style="font-size:0.82rem;color:var(--text-muted);">${formatDate(txn.date)}</div>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">${formatTime(txn.date)}</div>
      </td>
      <td>
        <div class="td-name">${escHtml(txn.recipient || '—')}</div>
        <div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">${escHtml(txn.details || '')}</div>
      </td>
      <td class="td-amount">₹${fmtH(txn.amount)}</td>
      <td class="td-fee">₹${fmtH(txn.fee)}</td>
      <td>${statusBadge(txn.status)}</td>
      <td>
        <button class="btn-receipt"
          id="receipt-btn-${idx}"
          onclick="printReceipt(${idx})"
          aria-label="Download receipt for transaction ${txn.id || idx}">
          🧾 Receipt
        </button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// ---- Filter ----
function filterHistory(query) {
  renderHistory(query);
}

// ---- Status badge ----
function statusBadge(status) {
  const map = {
    completed:  '<span class="status-badge status-completed">✓ Completed</span>',
    pending:    '<span class="status-badge status-pending">⏳ Pending</span>',
    processing: '<span class="status-badge status-processing">⚙ Processing</span>',
    failed:     '<span class="status-badge status-failed">✗ Failed</span>',
  };
  return map[status] || map.pending;
}

// ---- Print/Export receipt ----
function printReceipt(idx) {
  const history = getHistory();
  const txn = history[idx];
  if (!txn) return;

  const win = window.open('', '_blank', 'width=600,height=700');
  win.document.write(`<!DOCTYPE html><html><head><title>SwiftPay Receipt</title>
  <style>
    body { font-family: 'Segoe UI', sans-serif; background:#f8fafc; color:#1e293b; margin:0; padding:32px; }
    .receipt { max-width:460px; margin:0 auto; background:white; border-radius:16px; padding:32px; box-shadow:0 4px 24px rgba(0,0,0,0.1); }
    .logo { font-size:1.5rem; font-weight:800; color:#3B82F6; margin-bottom:24px; }
    h2 { font-size:1.2rem; margin-bottom:4px; }
    .status { display:inline-block; padding:3px 10px; border-radius:99px; font-size:0.75rem; font-weight:700;
              background:${txn.status==='completed'?'#dcfce7':'#fef3c7'}; color:${txn.status==='completed'?'#16a34a':'#d97706'}; margin-bottom:24px; }
    table { width:100%; border-collapse:collapse; }
    tr td { padding:10px 0; border-bottom:1px solid #f1f5f9; font-size:0.9rem; }
    tr:last-child td { border:none; }
    td:last-child { text-align:right; font-weight:600; }
    .total-row td { font-size:1.05rem; font-weight:800; color:#3B82F6; padding-top:16px; }
    .footer-note { margin-top:24px; font-size:0.75rem; color:#94a3b8; text-align:center; }
  </style></head><body>
  <div class="receipt">
    <div class="logo">⚡ SwiftPay</div>
    <h2>Transfer Receipt</h2>
    <div class="status">${txn.status?.toUpperCase() || 'COMPLETED'}</div>
    <table>
      <tr><td>Payment ID</td><td>${escHtml(txn.id||'—')}</td></tr>
      <tr><td>Order ID</td><td>${escHtml(txn.orderId||'—')}</td></tr>
      <tr><td>Date & Time</td><td>${formatDate(txn.date)} ${formatTime(txn.date)}</td></tr>
      <tr><td>Recipient</td><td>${escHtml(txn.recipient||'—')}</td></tr>
      <tr><td>Bank Details</td><td>${escHtml(txn.details||'—')}</td></tr>
      <tr><td>Transfer Amount</td><td>₹${fmtH(txn.amount)}</td></tr>
      <tr><td>Service Fee (1.5% + GST)</td><td>₹${fmtH(txn.fee)}</td></tr>
      <tr class="total-row"><td>Total Charged</td><td>₹${fmtH(txn.total)}</td></tr>
    </table>
    <div class="footer-note">This is a computer-generated receipt. Powered by Razorpay.</div>
  </div>
  <script>window.onload=()=>window.print();<\/script>
  </body></html>`);
  win.document.close();
}

// ---- Export CSV ----
function exportHistory() {
  const history = getHistory();
  if (history.length === 0) {
    showToast('No transactions to export.', 'warning');
    return;
  }

  const headers = ['Date', 'Time', 'Payment ID', 'Recipient', 'Details', 'Amount (₹)', 'Fee (₹)', 'Total (₹)', 'Status', 'Mode'];
  const rows = history.map(t => [
    formatDate(t.date),
    formatTime(t.date),
    t.id || '',
    t.recipient || '',
    t.details || '',
    t.amount || 0,
    t.fee || 0,
    t.total || 0,
    t.status || '',
    t.mode || 'IMPS',
  ]);

  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `swiftpay_history_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Transaction history exported as CSV!', 'success');
}

// ---- Clear All ----
function clearHistory() {
  if (!confirm('Clear all transaction history? This cannot be undone.')) return;
  saveHistory([]);
  renderHistory();
  showToast('Transaction history cleared.', 'info');
}

// ---- Seed demo data (first visit) ----
(function seedDemoData() {
  const existing = getHistory();
  if (existing.length > 0) return;

  const demos = [
    {
      id: 'pay_demo_001', orderId: 'ORD_demo_001',
      date: new Date(Date.now() - 2 * 24 * 3600000).toISOString(),
      recipient: 'Rahul Sharma', details: 'A/C ••••4521 | SBIN0002345',
      amount: 15000, fee: 265.5, total: 15265.5,
      source: 'credit_card', status: 'completed', mode: 'IMPS',
    },
    {
      id: 'pay_demo_002', orderId: 'ORD_demo_002',
      date: new Date(Date.now() - 5 * 24 * 3600000).toISOString(),
      recipient: 'Priya Patel', details: 'priya.patel@ybl',
      amount: 8000, fee: 141.6, total: 8141.6,
      source: 'debit_card', status: 'completed', mode: 'IMPS',
    },
    {
      id: 'pay_demo_003', orderId: 'ORD_demo_003',
      date: new Date(Date.now() - 8 * 24 * 3600000).toISOString(),
      recipient: 'Amit Kumar', details: 'A/C ••••9012 | HDFC0001234',
      amount: 50000, fee: 500, total: 50590,
      source: 'credit_card', status: 'completed', mode: 'IMPS',
    },
  ];

  saveHistory(demos);
})();

// ---- Helpers ----
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function fmtH(n) {
  if (!n && n !== 0) return '0.00';
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
