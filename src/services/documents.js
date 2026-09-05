import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import { get, run } from '../config/database.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'data', 'generated');

const nextSequence = async (name, prefix, width) => {
  await run('UPDATE sequences SET value = value + 1 WHERE name = ?', [name]);
  const row = await get('SELECT value FROM sequences WHERE name = ?', [name]);
  return `${prefix}${String(row.value).padStart(width, '0')}`;
};

const pdfBuffer = (draw) => new Promise((resolve, reject) => {
  const doc = new PDFDocument({ size: 'A4', margin: 52 });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);
  draw(doc);
  doc.end();
});

const writePdf = async (filename, draw) => {
  await fs.mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);
  await fs.writeFile(filePath, await pdfBuffer(draw));
  return filePath;
};

export const createArtifacts = async (registration, payment) => {
  const existing = await get('SELECT * FROM invoices WHERE registration_id = ?', [registration.id]);
  if (existing) return { invoice: existing, entryPass: await get('SELECT * FROM entry_passes WHERE registration_id = ?', [registration.id]) };
  const now = new Date().toISOString();
  const invoiceNumber = await nextSequence('invoice', 'RN5-INV-', 3);
  const passNumber = await nextSequence('entry_pass', 'RN5-', 3);
  const qrToken = `RANNITI5:${registration.id}:${uuidv4()}`;
  const invoicePath = await writePdf(`${invoiceNumber}.pdf`, (doc) => {
    doc.fillColor('#d6402d').fontSize(28).text('RANNITI 5', { continued: true }).fillColor('#222').fontSize(18).text('  INVOICE', { align: 'right' });
    doc.moveDown(2).fontSize(11).fillColor('#666').text(`Invoice number: ${invoiceNumber}`).text(`Date: ${new Date(now).toLocaleString('en-IN')}`);
    doc.moveDown().fillColor('#222').fontSize(18).text('Billed to');
    doc.fontSize(12).text(registration.full_name).text(registration.email).text(registration.mobile || '');
    doc.moveDown().text(`Registration ID: ${registration.id}`).text(`Package: ${registration.package_name}`).text(`Transaction ID: ${payment.transaction_id || 'Pending'}`);
    doc.moveDown(2).fontSize(24).text(`Amount paid: INR ${Number(registration.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    doc.moveDown().fillColor('#16803c').fontSize(16).text('PAID');
    doc.fillColor('#666').fontSize(10).text('RANNITI 5 Strategy Summit | Dhordo, Kutch | 18-20 December 2026', 52, 740);
  });
  const qrData = await QRCode.toDataURL(qrToken, { margin: 1, width: 220 });
  const entryPassPath = await writePdf(`${passNumber}.pdf`, (doc) => {
    doc.fillColor('#d6402d').fontSize(32).text('RANNITI 5').fillColor('#222').fontSize(18).text('DIGITAL ENTRY PASS');
    doc.moveDown(2).fontSize(22).text(registration.full_name).fontSize(13).fillColor('#555').text(registration.company || registration.chapter || 'Delegate');
    doc.moveDown().fillColor('#222').text(`Registration ID: ${registration.id}`).text(`Entry Pass: ${passNumber}`);
    doc.moveDown().text('Event: RANNITI 5 Strategy Summit').text('18-20 December 2026 | Dhordo, Kutch');
    doc.image(Buffer.from(qrData.split(',')[1], 'base64'), { fit: [220, 220], align: 'center' });
    doc.fontSize(10).fillColor('#666').text('Present this pass at the venue entrance.', { align: 'center' });
  });
  const invoiceId = uuidv4();
  const passId = uuidv4();
  await run('INSERT INTO invoices (id, registration_id, invoice_number, file_path, created_at) VALUES (?, ?, ?, ?, ?)', [invoiceId, registration.id, invoiceNumber, invoicePath, now]);
  await run('INSERT INTO entry_passes (id, registration_id, pass_number, qr_token, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?)', [passId, registration.id, passNumber, qrToken, entryPassPath, now]);
  return { invoice: { id: invoiceId, invoice_number: invoiceNumber, file_path: invoicePath }, entryPass: { id: passId, pass_number: passNumber, qr_token: qrToken, file_path: entryPassPath } };
};

export const sendConfirmationEmail = async (registration, artifacts) => {
  const subject = 'RANNITI 5 – Payment Confirmed | Entry Pass & Invoice';
  const transport = nodemailer.createTransport(process.env.SMTP_HOST ? {
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  } : { jsonTransport: true });
  try {
    await transport.sendMail({ from: process.env.MAIL_FROM || 'RANNITI 5 <no-reply@ranniti5.bnikutch.com>', to: registration.email, subject, text: `Payment confirmed for ${registration.full_name}. Registration ID: ${registration.id}. Entry Pass: ${artifacts.entryPass.pass_number}.`, attachments: [{ filename: path.basename(artifacts.invoice.file_path), path: artifacts.invoice.file_path }, { filename: path.basename(artifacts.entryPass.file_path), path: artifacts.entryPass.file_path }] });
    await run('INSERT INTO email_logs (id, registration_id, recipient, subject, status, sent_at) VALUES (?, ?, ?, ?, ?, ?)', [uuidv4(), registration.id, registration.email, subject, 'Sent', new Date().toISOString()]);
    return { status: 'Sent' };
  } catch (error) {
    await run('INSERT INTO email_logs (id, registration_id, recipient, subject, status, sent_at, error) VALUES (?, ?, ?, ?, ?, ?, ?)', [uuidv4(), registration.id, registration.email, subject, 'Failed', new Date().toISOString(), error.message]);
    throw error;
  }
};