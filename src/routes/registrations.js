import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { collection } from '../config/database.js';
import { adminMiddleware, authMiddleware } from '../middleware/authMiddleware.js';
import { createArtifacts, sendConfirmationEmail } from '../services/documents.js';
import { calculatePackagePrice, packages } from '../../public/package-pricing.js';

const router = express.Router();
const publicRegistration = (r) => ({ ...r, registrationId: r.id, package: r.package_name, paymentStatus: r.payment_status, transactionId: r.transaction_id, paymentDate: r.payment_date, entryPassNumber: r.pass_number, invoiceNumber: r.invoice_number });

router.post('/registrations', async (req, res) => {
  const body = req.body || {};
  const selectedPackage = packages[body.package] ? body.package : Object.keys(packages).find((name) => name.toLowerCase() === String(body.package || '').trim().toLowerCase());
  const packageConfig = selectedPackage ? packages[selectedPackage] : null;
  const computedPrice = packageConfig ? calculatePackagePrice(packageConfig) : null;
  const amount = selectedPackage ? computedPrice.total : Number(body.amount || 0);

  if (!body.fullName || !body.email || !body.password || body.password.length < 8 || !selectedPackage || !amount) {
    return res.status(400).json({ success: false, message: 'Name, email, password (8+ characters), and a valid package are required' });
  }

  const id = `RN5-REG-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const now = new Date().toISOString();
  await (await collection('registrations')).insertOne({
    id,
    full_name: body.fullName.trim(),
    email: body.email.trim().toLowerCase(),
    mobile: body.mobile || '',
    company: body.company || '',
    guest_name: body.guestName || '',
    region: body.region || '',
    chapter: body.chapter || '',
    gst_number: body.gstNumber || '',
    city: body.city || '',
    date_of_birth: body.dateOfBirth || '',
    hoodie_size: body.hoodieSize || '',
    business_intent: body.businessIntent || '',
    package_name: selectedPackage,
    package_meta: packageConfig,
    amount,
    gst_amount: computedPrice.gstAmount,
    taxable_amount: computedPrice.base,
    status: 'Pending',
    created_at: now,
    updated_at: now
  });
  const users = await collection('users');
  const email = body.email.trim().toLowerCase();
  if (!await users.findOne({ email })) await users.insertOne({ id: uuidv4(), name: body.fullName.trim(), email, password_hash: await bcrypt.hash(body.password, 12), role: 'user', created_at: now, updated_at: now });
  return res.status(201).json({ success: true, registration: { id, amount, package: selectedPackage } });
});

router.get('/member/dashboard', authMiddleware, async (req, res) => {
  const registrations = await (await collection('registrations')).find({ email: req.user.email }).sort({ created_at: -1 }).toArray();
  const ids = registrations.map((registration) => registration.id);
  const [payments, invoices, passes, checkins] = await Promise.all([ (await collection('payments')).find({ registration_id: { $in: ids } }).toArray(), (await collection('invoices')).find({ registration_id: { $in: ids } }).toArray(), (await collection('entry_passes')).find({ registration_id: { $in: ids } }).toArray(), (await collection('checkins')).find({ registration_id: { $in: ids } }).toArray() ]);
  const by = (rows) => new Map(rows.map((row) => [row.registration_id, row]));
  const paymentBy = by(payments); const invoiceBy = by(invoices); const passBy = by(passes); const checkinBy = by(checkins);
  return res.json({ success: true, member: { name: req.user.name, email: req.user.email }, registrations: registrations.map((registration) => ({ ...registration, password_hash: undefined, payment: paymentBy.get(registration.id) || null, invoice: invoiceBy.get(registration.id) || null, entryPass: passBy.get(registration.id) || null, checkin: checkinBy.get(registration.id) || null })) });
});

router.get('/member/documents/:type/:id', authMiddleware, async (req, res) => {
  const registration = await (await collection('registrations')).findOne({ id: req.params.id, email: req.user.email });
  if (!registration) return res.status(404).json({ success: false, message: 'Registration not found' });
  const table = req.params.type === 'invoice' ? 'invoices' : req.params.type === 'entry-pass' ? 'entry_passes' : null;
  if (!table) return res.status(400).json({ success: false, message: 'Invalid document type' });
  const document = await (await collection(table)).findOne({ registration_id: registration.id });
  if (!document) return res.status(404).json({ success: false, message: 'Document not available until payment is confirmed' });
  return res.download(document.file_path);
});

router.post('/payments/manual', async (req, res) => {
  const { registrationId, transactionId } = req.body || {};
  const registration = await (await collection('registrations')).findOne({ id: registrationId });
  if (!registration || !transactionId) return res.status(400).json({ success: false, message: 'Registration ID and transaction ID are required' });
  const now = new Date().toISOString();
  await (await collection('payments')).updateOne({ registration_id: registrationId }, { $set: { id: uuidv4(), registration_id: registrationId, transaction_id: transactionId.trim(), amount: registration.amount, status: 'Received', gateway: 'manual', payment_date: now, updated_at: now }, $setOnInsert: { created_at: now } }, { upsert: true });
  return res.json({ success: true, status: 'Received', registrationId });
});

router.post('/payments/order', async (req, res) => {
  const registration = await (await collection('registrations')).findOne({ id: req.body?.registrationId });
  if (!registration) return res.status(404).json({ success: false, message: 'Registration not found' });
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return res.status(503).json({ success: false, message: 'Razorpay is not configured. Use manual payment until gateway keys are set.' });
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const response = await fetch('https://api.razorpay.com/v1/orders', { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: Math.round(registration.amount * 100), currency: 'INR', receipt: registration.id }) });
  const order = await response.json();
  if (!response.ok) return res.status(502).json({ success: false, message: order.error?.description || 'Unable to create payment order' });
  const now = new Date().toISOString();
  await (await collection('payments')).updateOne({ registration_id: registration.id }, { $set: { id: uuidv4(), registration_id: registration.id, amount: registration.amount, status: 'Pending', gateway: 'razorpay', gateway_order_id: order.id, updated_at: now }, $setOnInsert: { created_at: now } }, { upsert: true });
  return res.json({ success: true, keyId: process.env.RAZORPAY_KEY_ID, order, registrationId: registration.id });
});

router.post('/payments/razorpay/verify', async (req, res) => {
  const { registrationId, razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '').update(`${orderId}|${paymentId}`).digest('hex');
  if (!signature || signature !== expected) return res.status(400).json({ success: false, message: 'Invalid payment signature' });
  const now = new Date().toISOString();
  const result = await (await collection('payments')).updateOne({ registration_id: registrationId, gateway_order_id: orderId }, { $set: { transaction_id: paymentId, status: 'Received', payment_date: now, updated_at: now } });
  if (!result.matchedCount) return res.status(404).json({ success: false, message: 'Payment order not found' });
  return res.json({ success: true, status: 'Received' });
});

router.get('/admin/registrations', authMiddleware, adminMiddleware, async (req, res) => {
  const registrations = await (await collection('registrations')).find().sort({ created_at: -1 }).toArray();
  const [payments, invoices, passes] = await Promise.all([(await collection('payments')).find().toArray(), (await collection('invoices')).find().toArray(), (await collection('entry_passes')).find().toArray()]);
  const by = (rows) => new Map(rows.map((row) => [row.registration_id, row]));
  const paymentBy = by(payments); const invoiceBy = by(invoices); const passBy = by(passes);
  return res.json({ success: true, registrations: registrations.map((r) => publicRegistration({ ...r, ...(paymentBy.get(r.id) ? { payment_status: paymentBy.get(r.id).status, transaction_id: paymentBy.get(r.id).transaction_id, payment_date: paymentBy.get(r.id).payment_date } : {}), ...(invoiceBy.get(r.id) ? { invoice_number: invoiceBy.get(r.id).invoice_number } : {}), ...(passBy.get(r.id) ? { pass_number: passBy.get(r.id).pass_number } : {}) })) });
});

router.patch('/admin/registrations/:registrationId', authMiddleware, adminMiddleware, async (req, res) => {
  const allowed = ['full_name', 'email', 'mobile', 'company', 'guest_name', 'region', 'chapter', 'gst_number', 'city', 'date_of_birth', 'hoodie_size', 'business_intent', 'package_name'];
  const updates = Object.fromEntries(Object.entries(req.body || {}).filter(([key, value]) => allowed.includes(key) && value !== undefined));
  if (!Object.keys(updates).length) return res.status(400).json({ success: false, message: 'No editable fields provided' });
  if (updates.email) updates.email = String(updates.email).trim().toLowerCase();
  if (updates.full_name) updates.full_name = String(updates.full_name).trim();
  updates.updated_at = new Date().toISOString();
  const result = await (await collection('registrations')).updateOne({ id: req.params.registrationId }, { $set: updates });
  if (!result.matchedCount) return res.status(404).json({ success: false, message: 'Registration not found' });
  return res.json({ success: true, registrationId: req.params.registrationId });
});

router.get('/admin/overview', authMiddleware, adminMiddleware, async (req, res) => {
  const [confirmed, payments, invoices, passes, checkins, emailLogs] = await Promise.all([(await collection('registrations')).find({ status: 'Confirmed' }).sort({ updated_at: -1 }).toArray(), (await collection('payments')).find().sort({ updated_at: -1 }).toArray(), (await collection('invoices')).find().sort({ created_at: -1 }).toArray(), (await collection('entry_passes')).find().sort({ created_at: -1 }).toArray(), (await collection('checkins')).find().sort({ checked_at: -1 }).toArray(), (await collection('email_logs')).find().sort({ sent_at: -1 }).toArray()]);
  return res.json({ success: true, confirmed, payments, invoices, passes, checkins, emailLogs });
});

router.get('/admin/settings', authMiddleware, adminMiddleware, async (req, res) => {
  const settings = await (await collection('settings')).findOne({ key: 'seller' }) || {};
  return res.json({ success: true, settings: { name: settings.name || 'Imperial Innoventures', gstin: settings.gstin || '24ADSPV9796P1ZW', pan: settings.pan || 'ADSPV9796P', address: settings.address || 'Gandhidham, Kutch, Gujarat', state: settings.state || settings.state_name || 'Gujarat', stateCode: settings.stateCode || settings.state_code || '24', upiId: settings.upi_id || settings.upiId || 'munjalshah9@okicici', bankName: settings.bank_name || settings.bankName || 'Kotak Mahindra Bank', accountNumber: settings.account_number || settings.accountNumber || '0114137470', branch: settings.branch || 'Gandhidham Branch', ifsc: settings.ifsc || 'KKBK0000822' } });
});

router.put('/admin/settings', authMiddleware, adminMiddleware, async (req, res) => {
  const payload = req.body || {};
  const values = {
    key: 'seller',
    name: payload.name || 'Imperial Innoventures',
    gstin: payload.gstin || '24ADSPV9796P1ZW',
    pan: payload.pan || 'ADSPV9796P',
    address: payload.address || 'Gandhidham, Kutch, Gujarat',
    state: payload.state || 'Gujarat',
    state_code: payload.stateCode || payload.state_code || '24',
    upi_id: payload.upiId || payload.upi_id || 'munjalshah9@okicici',
    bank_name: payload.bankName || payload.bank_name || 'Kotak Mahindra Bank',
    account_number: payload.accountNumber || payload.account_number || '0114137470',
    branch: payload.branch || 'Gandhidham Branch',
    ifsc: payload.ifsc || 'KKBK0000822',
    phone: payload.phone || '+91 98795 01364',
    email: payload.email || 'hello@bnikutch.com',
    updated_at: new Date().toISOString()
  };
  await (await collection('settings')).updateOne({ key: 'seller' }, { $set: values }, { upsert: true });
  return res.json({ success: true, settings: values });
});

router.post('/admin/payments/:registrationId/confirm', authMiddleware, adminMiddleware, async (req, res) => {
  const registrations = await collection('registrations');
  const payments = await collection('payments');
  const registration = await registrations.findOne({ id: req.params.registrationId });
  const payment = await payments.findOne({ registration_id: req.params.registrationId });
  if (!registration || !payment) return res.status(404).json({ success: false, message: 'Registration or payment not found' });
  if (payment.status === 'Confirmed') return res.json({ success: true, message: 'Payment already confirmed', artifacts: await createArtifacts(registration, payment) });
  const now = new Date().toISOString();
  await payments.updateOne({ registration_id: registration.id }, { $set: { status: 'Confirmed', updated_at: now, payment_date: payment.payment_date || now } });
  await registrations.updateOne({ id: registration.id }, { $set: { status: 'Confirmed', updated_at: now } });
  const artifacts = await createArtifacts(registration, { ...payment, status: 'Confirmed' });
  let email;
  try { email = await sendConfirmationEmail(registration, artifacts); } catch (error) { return res.status(502).json({ success: false, message: error.message, artifacts }); }
  return res.json({ success: true, registrationId: registration.id, artifacts, email });
});

router.post('/admin/payments/:registrationId/resend', authMiddleware, adminMiddleware, async (req, res) => {
  const registration = await (await collection('registrations')).findOne({ id: req.params.registrationId });
  const payment = await (await collection('payments')).findOne({ registration_id: req.params.registrationId });
  if (!registration || !payment || payment.status !== 'Confirmed') return res.status(400).json({ success: false, message: 'Payment must be confirmed before sending email' });
  try {
    await sendConfirmationEmail(registration, await createArtifacts(registration, payment));
  } catch (error) {
    return res.status(502).json({ success: false, message: error.message });
  }
  return res.json({ success: true, message: 'Confirmation email sent' });
});

router.get('/admin/documents/:type/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const table = req.params.type === 'invoice' ? 'invoices' : 'entry_passes';
  const row = await (await collection(table)).findOne({ $or: [{ registration_id: req.params.id }, { id: req.params.id }] });
  if (!row) return res.status(404).json({ success: false, message: 'Document not found' });
  return res.download(row.file_path);
});

router.post('/admin/checkins', authMiddleware, adminMiddleware, async (req, res) => {
  const code = String(req.body.code || '').trim();
  const pass = await (await collection('entry_passes')).aggregate([{ $match: { $or: [{ pass_number: code }, { qr_token: code }] } }, { $lookup: { from: 'registrations', localField: 'registration_id', foreignField: 'id', as: 'registration' } }, { $unwind: '$registration' }]).next();
  if (!pass) return res.status(404).json({ success: false, result: 'INVALID ENTRY PASS' });
  if (pass.registration.status !== 'Confirmed') return res.status(403).json({ success: false, result: 'PAYMENT NOT CONFIRMED', member: pass.registration.full_name });
  const checkins = await collection('checkins');
  const existing = await checkins.findOne({ registration_id: pass.registration_id });
  if (existing) return res.status(409).json({ success: false, result: 'ALREADY CHECKED IN', checkin: existing, member: pass.registration.full_name });
  const checkin = { id: uuidv4(), entry_pass_number: pass.pass_number, registration_id: pass.registration_id, member_name: pass.registration.full_name, checked_at: new Date().toISOString(), method: req.body.method === 'manual' ? 'Manual' : 'QR', checked_by: req.user.email };
  await checkins.insertOne(checkin);
  return res.json({ success: true, result: 'ENTRY VERIFIED', member: { ...pass.registration, pass_number: pass.pass_number }, checkin });
});

router.get('/admin/checkins.csv', authMiddleware, adminMiddleware, async (req, res) => {
  const rows = await (await collection('checkins')).find().sort({ checked_at: -1 }).toArray();
  const csv = ['Entry Pass Number,Registration ID,Member,Date,Time,Method,Checked By', ...rows.map((r) => { const date = new Date(r.checked_at); return [r.entry_pass_number, r.registration_id, r.member_name, date.toLocaleDateString('en-IN'), date.toLocaleTimeString('en-IN'), r.method, r.checked_by].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','); })].join('\n');
  res.type('text/csv').attachment('ranniti5-check-in-log.csv').send(csv);
});

export default router;
