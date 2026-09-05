import express from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../config/database.js';
import { adminMiddleware, authMiddleware } from '../middleware/authMiddleware.js';
import { createArtifacts, sendConfirmationEmail } from '../services/documents.js';

const router = express.Router();
const packages = { 'Triple Occupancy': 17698.82, 'Double Occupancy': 20648.82, '1 Member + 1 Family Member + 1 Kid (Up to 5 years)': 29999, '1 Member + 1 Family Member + 1 Kid (Above 5 years)': 34999 };
const publicRegistration = (r) => ({ ...r, registrationId: r.id, package: r.package_name, paymentStatus: r.payment_status, transactionId: r.transaction_id, paymentDate: r.payment_date, entryPassNumber: r.pass_number, invoiceNumber: r.invoice_number });

router.post('/registrations', async (req, res) => {
  const body = req.body || {};
  const amount = packages[body.package] || Number(body.amount);
  if (!body.fullName || !body.email || !body.package || !amount) return res.status(400).json({ success: false, message: 'Name, email, package and amount are required' });
  const id = `RN5-REG-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const now = new Date().toISOString();
  await run('INSERT INTO registrations (id, full_name, email, mobile, company, guest_name, region, chapter, gst_number, city, date_of_birth, hoodie_size, business_intent, package_name, amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, body.fullName.trim(), body.email.trim().toLowerCase(), body.mobile || '', body.company || '', body.guestName || '', body.region || '', body.chapter || '', body.gstNumber || '', body.city || '', body.dateOfBirth || '', body.hoodieSize || '', body.businessIntent || '', body.package, amount, now, now]);
  return res.status(201).json({ success: true, registration: { id, amount, package: body.package } });
});

router.post('/payments/manual', async (req, res) => {
  const { registrationId, transactionId } = req.body || {};
  const registration = await get('SELECT * FROM registrations WHERE id = ?', [registrationId]);
  if (!registration || !transactionId) return res.status(400).json({ success: false, message: 'Registration ID and transaction ID are required' });
  const now = new Date().toISOString();
  await run('INSERT OR REPLACE INTO payments (id, registration_id, transaction_id, amount, status, gateway, payment_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [uuidv4(), registrationId, transactionId.trim(), registration.amount, 'Received', 'manual', now, now, now]);
  return res.json({ success: true, status: 'Received', registrationId });
});

router.post('/payments/order', async (req, res) => {
  const registration = await get('SELECT * FROM registrations WHERE id = ?', [req.body?.registrationId]);
  if (!registration) return res.status(404).json({ success: false, message: 'Registration not found' });
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return res.status(503).json({ success: false, message: 'Razorpay is not configured. Use manual payment until gateway keys are set.' });
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const response = await fetch('https://api.razorpay.com/v1/orders', { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: Math.round(registration.amount * 100), currency: 'INR', receipt: registration.id }) });
  const order = await response.json();
  if (!response.ok) return res.status(502).json({ success: false, message: order.error?.description || 'Unable to create payment order' });
  const now = new Date().toISOString();
  await run('INSERT OR REPLACE INTO payments (id, registration_id, amount, status, gateway, gateway_order_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [uuidv4(), registration.id, registration.amount, 'Pending', 'razorpay', order.id, now, now]);
  return res.json({ success: true, keyId: process.env.RAZORPAY_KEY_ID, order, registrationId: registration.id });
});

router.post('/payments/razorpay/verify', async (req, res) => {
  const { registrationId, razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '').update(`${orderId}|${paymentId}`).digest('hex');
  if (!signature || signature !== expected) return res.status(400).json({ success: false, message: 'Invalid payment signature' });
  const now = new Date().toISOString();
  await run('UPDATE payments SET transaction_id = ?, status = ?, payment_date = ?, updated_at = ? WHERE registration_id = ? AND gateway_order_id = ?', [paymentId, 'Received', now, now, registrationId, orderId]);
  return res.json({ success: true, status: 'Received' });
});

router.get('/admin/registrations', authMiddleware, adminMiddleware, async (req, res) => {
  const rows = await all('SELECT r.*, p.status payment_status, p.transaction_id, p.payment_date, i.invoice_number, e.pass_number FROM registrations r LEFT JOIN payments p ON p.registration_id = r.id LEFT JOIN invoices i ON i.registration_id = r.id LEFT JOIN entry_passes e ON e.registration_id = r.id ORDER BY r.created_at DESC');
  return res.json({ success: true, registrations: rows.map(publicRegistration) });
});

router.get('/admin/overview', authMiddleware, adminMiddleware, async (req, res) => {
  const [confirmed, invoices, passes, checkins, emailLogs] = await Promise.all([
    all("SELECT id, full_name, email, package_name, amount FROM registrations WHERE status = 'Confirmed' ORDER BY updated_at DESC"),
    all('SELECT invoice_number, registration_id, created_at FROM invoices ORDER BY created_at DESC'),
    all('SELECT pass_number, registration_id, created_at FROM entry_passes ORDER BY created_at DESC'),
    all('SELECT entry_pass_number, registration_id, member_name, checked_at, method, checked_by FROM checkins ORDER BY checked_at DESC'),
    all('SELECT registration_id, recipient, status, sent_at, error FROM email_logs ORDER BY sent_at DESC'),
  ]);
  return res.json({ success: true, confirmed, invoices, passes, checkins, emailLogs });
});

router.post('/admin/payments/:registrationId/confirm', authMiddleware, adminMiddleware, async (req, res) => {
  const registration = await get('SELECT * FROM registrations WHERE id = ?', [req.params.registrationId]);
  const payment = await get('SELECT * FROM payments WHERE registration_id = ?', [req.params.registrationId]);
  if (!registration || !payment) return res.status(404).json({ success: false, message: 'Registration or payment not found' });
  if (payment.status === 'Confirmed') return res.json({ success: true, message: 'Payment already confirmed', artifacts: await createArtifacts(registration, payment) });
  const now = new Date().toISOString();
  await run('UPDATE payments SET status = ?, updated_at = ? WHERE registration_id = ?', ['Confirmed', now, registration.id]);
  await run('UPDATE registrations SET status = ?, updated_at = ? WHERE id = ?', ['Confirmed', now, registration.id]);
  const artifacts = await createArtifacts(registration, { ...payment, status: 'Confirmed' });
  await sendConfirmationEmail(registration, artifacts);
  return res.json({ success: true, registrationId: registration.id, artifacts });
});

router.post('/admin/payments/:registrationId/resend', authMiddleware, adminMiddleware, async (req, res) => {
  const registration = await get('SELECT * FROM registrations WHERE id = ?', [req.params.registrationId]);
  const payment = await get('SELECT * FROM payments WHERE registration_id = ?', [req.params.registrationId]);
  if (!registration || !payment || payment.status !== 'Confirmed') return res.status(400).json({ success: false, message: 'Payment must be confirmed before sending email' });
  await sendConfirmationEmail(registration, await createArtifacts(registration, payment));
  return res.json({ success: true, message: 'Confirmation email sent' });
});

router.get('/admin/documents/:type/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const table = req.params.type === 'invoice' ? 'invoices' : 'entry_passes';
  const row = await get(`SELECT file_path FROM ${table} WHERE registration_id = ? OR id = ?`, [req.params.id, req.params.id]);
  if (!row) return res.status(404).json({ success: false, message: 'Document not found' });
  return res.download(row.file_path);
});

router.post('/admin/checkins', authMiddleware, adminMiddleware, async (req, res) => {
  const code = String(req.body.code || '').trim();
  const pass = await get('SELECT e.*, r.full_name, r.email, r.company, r.status FROM entry_passes e JOIN registrations r ON r.id = e.registration_id WHERE e.pass_number = ? OR e.qr_token = ?', [code, code]);
  if (!pass) return res.status(404).json({ success: false, result: 'INVALID ENTRY PASS' });
  if (pass.status !== 'Confirmed') return res.status(403).json({ success: false, result: 'PAYMENT NOT CONFIRMED', member: pass.full_name });
  const existing = await get('SELECT * FROM checkins WHERE registration_id = ?', [pass.registration_id]);
  if (existing) return res.status(409).json({ success: false, result: 'ALREADY CHECKED IN', checkin: existing, member: pass.full_name });
  const checkin = { id: uuidv4(), entry_pass_number: pass.pass_number, registration_id: pass.registration_id, member_name: pass.full_name, checked_at: new Date().toISOString(), method: req.body.method === 'manual' ? 'Manual' : 'QR', checked_by: req.user.email };
  await run('INSERT INTO checkins (id, entry_pass_number, registration_id, member_name, checked_at, method, checked_by) VALUES (?, ?, ?, ?, ?, ?, ?)', Object.values(checkin));
  return res.json({ success: true, result: 'ENTRY VERIFIED', member: pass, checkin });
});

router.get('/admin/checkins.csv', authMiddleware, adminMiddleware, async (req, res) => {
  const rows = await all('SELECT entry_pass_number, registration_id, member_name, checked_at, method, checked_by FROM checkins ORDER BY checked_at DESC');
  const csv = ['Entry Pass Number,Registration ID,Member,Date,Time,Method,Checked By', ...rows.map((r) => { const date = new Date(r.checked_at); return [r.entry_pass_number, r.registration_id, r.member_name, date.toLocaleDateString('en-IN'), date.toLocaleTimeString('en-IN'), r.method, r.checked_by].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','); })].join('\n');
  res.type('text/csv').attachment('ranniti5-check-in-log.csv').send(csv);
});

export default router;