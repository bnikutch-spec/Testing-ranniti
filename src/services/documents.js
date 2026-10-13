import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { collection, nextSequence } from '../config/database.js';
import { calculatePackagePrice, packages, sellerSettings } from '../../public/package-pricing.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'data', 'generated');
const logoUrl = 'https://ranniti5.bnikutch.com/__l5e/assets-v1/76b9250f-a5af-4bcb-89fa-e47c73ba89c5/ranniti-5-logo.png';
let logoBuffer;

const getLogo = async () => {
  if (logoBuffer) return logoBuffer;
  try {
    const response = await fetch(logoUrl);
    if (response.ok) logoBuffer = Buffer.from(await response.arrayBuffer());
  } catch {
    // The PDF remains usable with the text fallback when the logo host is unavailable.
  }
  return logoBuffer;
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

const numberToIndianWords = (value) => {
  const ones = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const belowHundred = (number) => number < 20 ? ones[number] : `${tens[Math.floor(number / 10)]}${number % 10 ? ` ${ones[number % 10]}` : ''}`;
  if (value < 20) return ones[value];
  if (value < 100) return belowHundred(value);
  if (value < 1000) return `${ones[Math.floor(value / 100)]} Hundred${value % 100 ? ` ${belowHundred(value % 100)}` : ''}`;
  for (const [divisor, label] of [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand']]) {
    if (value >= divisor) return `${numberToIndianWords(Math.floor(value / divisor))} ${label}${value % divisor ? ` ${numberToIndianWords(value % divisor)}` : ''}`;
  }
  return `${numberToIndianWords(Math.floor(value / 100))} Hundred${value % 100 ? ` ${belowHundred(value % 100)}` : ''}`;
};

export const formatIndianAmountInWords = (amount) => {
  const paiseTotal = Math.round(Number(amount || 0) * 100);
  const rupees = Math.floor(paiseTotal / 100);
  const paise = paiseTotal % 100;
  return `Indian Rupees ${numberToIndianWords(rupees)}${paise ? ` and ${numberToIndianWords(paise)} Paise` : ''} Only`;
};

export const getInvoiceBreakdown = (registration) => {
  const packageConfig = registration.package_meta || packages[registration.package_name] || {};
  const packagePrice = packageConfig.base == null ? null : calculatePackagePrice(packageConfig);
  const gstPercent = Number(packageConfig.gstPercent ?? 18);
  const amount = Number(registration.amount ?? 0);
  const taxableValue = Number(registration.taxable_amount ?? packagePrice?.base ?? (amount / (1 + gstPercent / 100)).toFixed(2));
  const gstAmount = Number(registration.gst_amount ?? packagePrice?.gstAmount ?? (taxableValue * gstPercent / 100).toFixed(2));
  const total = Number(registration.amount ?? taxableValue + gstAmount);
  const cgstAmount = Number((gstAmount / 2).toFixed(2));
  const sgstAmount = Number((gstAmount - cgstAmount).toFixed(2));
  const roundOff = Number((total - taxableValue - gstAmount).toFixed(2));
  return {
    hsnCode: packageConfig.hsCode || '998311',
    gstPercent,
    taxableValue,
    gstAmount,
    cgstAmount,
    sgstAmount,
    roundOff: Math.abs(roundOff) < 0.005 ? 0 : roundOff,
    total,
  };
};

export const renderInvoicePdf = (registration, payment, invoiceNumber, seller, issuedAt) => pdfBuffer((doc) => {
  const breakdown = getInvoiceBreakdown(registration);
  const formatAmount = (value) => Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const invoiceDate = new Date(issuedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replaceAll(' ', '-');
  const sellerState = seller.state || seller.state_name || 'Gujarat';
  const sellerStateCode = seller.stateCode || seller.state_code || '24';
  const buyerName = registration.company || registration.business_name || registration.full_name || 'Customer';
  const buyerAddress = registration.business_address || registration.address || [registration.city, registration.state].filter(Boolean).join(', ') || '—';
  const buyerState = registration.state || sellerState;
  const buyerStateCode = registration.state_code || sellerStateCode;
  const packageName = registration.package_name || registration.package || 'RANNITI 5 event registration';
  const amountWords = formatIndianAmountInWords(breakdown.total);
  const taxWords = formatIndianAmountInWords(breakdown.gstAmount);
  const left = 34;
  const right = 561;
  const width = right - left;
  const line = (x1, y1, x2, y2) => doc.moveTo(x1, y1).lineTo(x2, y2).lineWidth(0.55).strokeColor('#222222').stroke();
  const metaCell = (label, value, x, y, cellWidth) => {
    doc.fillColor('#555555').font('Helvetica').fontSize(7).text(label, x + 6, y + 4, { width: cellWidth - 12, lineBreak: false });
    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(8).text(String(value || '—'), x + 6, y + 17, { width: cellWidth - 12, height: 17, ellipsis: true });
  };

  doc.rect(0, 0, 595, 842).fill('#ffffff');
  doc.fillColor('#111111').font('Helvetica-Bold').fontSize(16).text('Tax Invoice', left, 23, { width, align: 'center' });

  const headerTop = 49;
  const headerBottom = 250;
  const split = 308;
  const metaSplit = 434;
  doc.rect(left, headerTop, width, headerBottom - headerTop).lineWidth(0.7).strokeColor('#222222').stroke();
  line(split, headerTop, split, headerBottom);
  [130, 184].forEach((y) => line(left, y, split, y));
  [88, 127, 166, 205, 230].forEach((y) => line(split, y, right, y));
  [headerTop, 88, 127, 166, 205].forEach((y) => line(metaSplit, y, metaSplit, y + (y === headerTop ? 39 : 39)));

  doc.fillColor('#111111').font('Helvetica-Bold').fontSize(10).text(String(seller.name || 'Imperial Innoventures').toUpperCase(), left + 8, 56, { width: split - left - 16 });
  doc.font('Helvetica').fontSize(8).text(seller.address || 'Gandhidham, Kutch, Gujarat', left + 8, 72, { width: split - left - 16, height: 30 });
  doc.text(`GSTIN/UIN: ${seller.gstin || '24ADSPV9796P1ZW'}`, left + 8, 105, { width: split - left - 16 });
  doc.text(`State Name : ${sellerState}, Code : ${sellerStateCode}`, left + 8, 117, { width: split - left - 16 });

  doc.font('Helvetica').fontSize(7).fillColor('#444444').text('Consignee (Ship to)', left + 8, 135);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111').text(buyerName, left + 8, 148, { width: split - left - 16 });
  doc.font('Helvetica').fontSize(8).text(buyerAddress, left + 8, 161, { width: split - left - 16, height: 20 });
  doc.text(`State Name : ${buyerState}, Code : ${buyerStateCode}`, left + 8, 174, { width: split - left - 16 });

  doc.font('Helvetica').fontSize(7).fillColor('#444444').text('Buyer (Bill to)', left + 8, 189);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111').text(registration.full_name || buyerName, left + 8, 202, { width: split - left - 16 });
  doc.font('Helvetica').fontSize(8).text(buyerAddress, left + 8, 215, { width: split - left - 16, height: 18 });
  doc.text(`GSTIN/UIN: ${registration.gst_number || '—'}`, left + 8, 234, { width: split - left - 16 });

  const metaWidth = right - split;
  const halfMeta = metaSplit - split;
  metaCell('Invoice No.', invoiceNumber, split, 49, halfMeta);
  metaCell('Dated', invoiceDate, metaSplit, 49, right - metaSplit);
  metaCell('Delivery Note', '—', split, 88, halfMeta);
  metaCell('Mode/Terms of Payment', payment?.gateway || '—', metaSplit, 88, right - metaSplit);
  metaCell('Reference No. & Date', payment?.transaction_id || '—', split, 127, halfMeta);
  metaCell('Other References', registration.id, metaSplit, 127, right - metaSplit);
  metaCell("Buyer's Order No.", registration.id, split, 166, halfMeta);
  metaCell('Dated', invoiceDate, metaSplit, 166, right - metaSplit);
  metaCell('Event', 'RANNITI 5 Strategy Summit', split, 205, halfMeta);
  metaCell('Destination', 'Dhordo, Kutch', metaSplit, 205, right - metaSplit);
  doc.fillColor('#555555').font('Helvetica').fontSize(7).text('Terms of Delivery: Event registration', split + 6, 235, { width: metaWidth - 12 });

  const tableTop = 270;
  const headerHeight = 40;
  const columns = [28, 202, 57, 43, 67, 38, 92];
  const xPositions = [left];
  columns.forEach((columnWidth) => xPositions.push(xPositions.at(-1) + columnWidth));
  const rowLines = [tableTop, tableTop + headerHeight, tableTop + headerHeight + 34, tableTop + headerHeight + 56, tableTop + headerHeight + 78, tableTop + headerHeight + 100, tableTop + headerHeight + 126];
  doc.rect(left, tableTop, width, rowLines.at(-1) - tableTop).lineWidth(0.7).strokeColor('#222222').stroke();
  xPositions.slice(1, -1).forEach((x) => line(x, tableTop, x, rowLines.at(-1)));
  rowLines.slice(1, -1).forEach((y) => line(left, y, right, y));
  const headerLabels = ['Sl No.', 'Particulars', 'HSN/SAC', 'Quantity', 'Rate', 'per', 'Amount'];
  headerLabels.forEach((label, index) => {
    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(7.5).text(label, xPositions[index] + 3, tableTop + 12, { width: columns[index] - 6, align: index === 1 ? 'center' : 'center' });
  });

  const rowText = (index, text, y, rowHeight, align = 'left', bold = false) => {
    doc.fillColor('#111111').font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).text(String(text), xPositions[index] + 4, y + Math.max(5, (rowHeight - 10) / 2), { width: columns[index] - 8, height: rowHeight - 4, align, ellipsis: true });
  };
  const dataTop = tableTop + headerHeight;
  rowText(0, '1', dataTop, 34, 'center');
  rowText(1, packageName, dataTop, 34, 'left', true);
  rowText(2, breakdown.hsnCode, dataTop, 34, 'center');
  rowText(3, '1', dataTop, 34, 'right');
  rowText(4, formatAmount(breakdown.taxableValue), dataTop, 34, 'right');
  rowText(5, 'Unit', dataTop, 34, 'center');
  rowText(6, formatAmount(breakdown.taxableValue), dataTop, 34, 'right', true);
  rowText(1, `OUTPUT CGST @ ${breakdown.gstPercent / 2}%`, dataTop + 34, 22);
  rowText(4, `${breakdown.gstPercent / 2}%`, dataTop + 34, 22, 'right');
  rowText(6, formatAmount(breakdown.cgstAmount), dataTop + 34, 22, 'right');
  rowText(1, `OUTPUT SGST @ ${breakdown.gstPercent / 2}%`, dataTop + 56, 22);
  rowText(4, `${breakdown.gstPercent / 2}%`, dataTop + 56, 22, 'right');
  rowText(6, formatAmount(breakdown.sgstAmount), dataTop + 56, 22, 'right');
  rowText(1, 'ROUND OFF', dataTop + 78, 22);
  rowText(6, formatAmount(breakdown.roundOff), dataTop + 78, 22, 'right');
  rowText(5, 'Total', dataTop + 100, 26, 'right', true);
  rowText(6, `₹ ${formatAmount(breakdown.total)}`, dataTop + 100, 26, 'right', true);

  const wordsTop = rowLines.at(-1) + 9;
  doc.fillColor('#444444').font('Helvetica').fontSize(7).text('Amount Chargeable (in words)', left + 2, wordsTop, { width: width - 4 });
  doc.fillColor('#111111').font('Helvetica-Bold').fontSize(8).text(amountWords, left + 2, wordsTop + 12, { width: width - 4 });

  const taxTop = wordsTop + 38;
  const taxColumns = [72, 80, 45, 70, 45, 70, 145];
  const taxX = [left];
  taxColumns.forEach((columnWidth) => taxX.push(taxX.at(-1) + columnWidth));
  const taxBottom = taxTop + 80;
  doc.rect(left, taxTop, width, taxBottom - taxTop).lineWidth(0.6).strokeColor('#222222').stroke();
  taxX.slice(1, -1).forEach((x) => line(x, taxTop, x, taxBottom));
  [taxTop + 36, taxTop + 58].forEach((y) => line(left, y, right, y));
  const taxHeaders = ['HSN/SAC', 'Taxable Value', 'CGST Rate', 'Amount', 'SGST/UTGST Rate', 'Amount', 'Total Tax Amount'];
  taxHeaders.forEach((label, index) => doc.fillColor('#111111').font('Helvetica-Bold').fontSize(6.5).text(label, taxX[index] + 3, taxTop + 12, { width: taxColumns[index] - 6, align: 'center' }));
  const taxRow = [breakdown.hsnCode, formatAmount(breakdown.taxableValue), `${breakdown.gstPercent / 2}%`, formatAmount(breakdown.cgstAmount), `${breakdown.gstPercent / 2}%`, formatAmount(breakdown.sgstAmount), formatAmount(breakdown.gstAmount)];
  taxRow.forEach((value, index) => doc.fillColor('#111111').font('Helvetica').fontSize(7).text(value, taxX[index] + 3, taxTop + 42, { width: taxColumns[index] - 6, align: index === 0 ? 'left' : 'right' }));
  doc.fillColor('#111111').font('Helvetica-Bold').fontSize(7).text('Total', taxX[0] + 3, taxTop + 64, { width: taxColumns[0] - 6 });
  doc.text(formatAmount(breakdown.taxableValue), taxX[1] + 3, taxTop + 64, { width: taxColumns[1] - 6, align: 'right' });
  doc.text(formatAmount(breakdown.cgstAmount), taxX[3] + 3, taxTop + 64, { width: taxColumns[3] - 6, align: 'right' });
  doc.text(formatAmount(breakdown.sgstAmount), taxX[5] + 3, taxTop + 64, { width: taxColumns[5] - 6, align: 'right' });
  doc.text(formatAmount(breakdown.gstAmount), taxX[6] + 3, taxTop + 64, { width: taxColumns[6] - 6, align: 'right' });

  doc.fillColor('#111111').font('Helvetica').fontSize(8).text(`Tax Amount (in words): ${taxWords}`, left, taxBottom + 10, { width });
  doc.rect(left, taxBottom + 31, width, 61).lineWidth(0.6).strokeColor('#222222').stroke();
  doc.font('Helvetica').fontSize(8).text(`Company's PAN : ${seller.pan || 'ADSPV9796P'}`, left + 7, taxBottom + 65);
  doc.font('Helvetica-Bold').fontSize(9).text(`for ${String(seller.name || 'Imperial Innoventures').toUpperCase()}`, left + 215, taxBottom + 39, { width: width - 222, align: 'right' });
  line(left + 278, taxBottom + 77, right - 8, taxBottom + 77);
  doc.font('Helvetica').fontSize(7).text('Authorised Signatory', left + 278, taxBottom + 80, { width: width - 286, align: 'right' });
  doc.font('Helvetica').fontSize(8).text('This is a Computer Generated Invoice', left, taxBottom + 101, { width, align: 'center' });
});

export const createArtifacts = async (registration, payment) => {
  const invoices = await collection('invoices');
  const passes = await collection('entry_passes');
  const settings = await (await collection('settings')).findOne({ key: 'seller' }) || {};
  const seller = { ...sellerSettings, ...(settings || {}) };
  if (seller.address === 'Gandhidham, Kutch, Gujarat') seller.address = sellerSettings.address;
  const existing = await invoices.findOne({ registration_id: registration.id });
  const existingPass = existing && await passes.findOne({ registration_id: registration.id });
  const now = new Date().toISOString();
  const invoiceNumber = existing?.invoice_number || `RN5-INV-${String(await nextSequence('invoice')).padStart(3, '0')}`;
  const passNumber = existingPass?.pass_number || `RN5-${String(await nextSequence('entry_pass')).padStart(3, '0')}`;
  const qrToken = existingPass?.qr_token || `RANNITI5:${registration.id}:${uuidv4()}`;
  const logo = await getLogo();
  const eventDate = '18–20 December 2026';
  const eventVenue = 'Dhordo, Kutch';
  const drawField = (doc, label, value, x, y, width) => {
    doc.fillColor('#77736f').font('Helvetica-Bold').fontSize(8).text(label.toUpperCase(), x, y, { width });
    doc.fillColor('#151515').font('Helvetica').fontSize(11).text(String(value || '—'), x, y + 13, { width });
  };
  const invoicePath = path.join(outputDir, `${invoiceNumber}.pdf`);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(invoicePath, await renderInvoicePdf(registration, payment, invoiceNumber, seller, now));
  const qrData = await QRCode.toDataURL(qrToken, { margin: 1, width: 220 });
  const entryPassPath = await writePdf(`${passNumber}.pdf`, (doc) => {
    doc.rect(0, 0, 595, 841).fill('#ffffff');
    doc.save().path('M 385 0 L 595 0 L 595 158 L 438 113 Z').fill('#b50813').restore();
    doc.save().path('M 355 0 L 595 0 L 595 137 L 418 94 Z').fill('#e11925').restore();
    if (logo) doc.image(logo, 48, 37, { fit: [215, 82] });
    else doc.fillColor('#d71920').font('Helvetica-Bold').fontSize(35).text('RANNITI 5', 48, 55);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9).text('BIGGER NETWORKS', 466, 42, { width: 100 });
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9).text('STRONGER BUSINESS', 466, 58, { width: 110 });
    doc.fillColor('#d71920').roundedRect(30, 172, 535, 67, 12).fill();
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(27).text('DIGITAL ENTRY PASS', 138, 191, { width: 400, align: 'center' });
    doc.fillColor('#ffffff').lineWidth(2).moveTo(120, 184).lineTo(120, 226).stroke();
    doc.fillColor('#38465c').font('Helvetica').fontSize(17).text('R A N N I T I   5   S T R A T E G Y   S U M M I T', 32, 258, { width: 531, align: 'center' });
    doc.fillColor('#d71920').rect(32, 289, 531, 2).fill();
    doc.fillColor('#151c2b').font('Helvetica-Bold').fontSize(31).text(registration.full_name, 42, 316, { width: 510 });
    doc.fillColor('#38465c').font('Helvetica').fontSize(15).text(registration.company || registration.chapter || 'RANNITI 5 Delegate', 42, 359);
    doc.fillColor('#d71920').lineWidth(1).moveTo(298, 404).lineTo(298, 515).stroke();
    doc.fillColor('#d71920').circle(66, 423, 20).fill();
    doc.fillColor('#ffffff').circle(66, 417, 6).fill().roundedRect(57, 427, 18, 11, 6).fill();
    drawField(doc, 'Registration ID', registration.id, 96, 402, 180);
    doc.fillColor('#d71920').roundedRect(46, 474, 40, 40, 8).stroke();
    doc.fillColor('#d71920').font('Helvetica-Bold').fontSize(20).text('↔', 56, 483);
    drawField(doc, 'Entry pass', passNumber, 96, 474, 180);
    doc.fillColor('#d71920').roundedRect(322, 403, 40, 40, 8).stroke();
    doc.fillColor('#d71920').font('Helvetica-Bold').fontSize(20).text('▣', 332, 412);
    drawField(doc, 'Event', 'RANNITI 5 Strategy Summit', 374, 402, 190);
    drawField(doc, 'Dates', eventDate, 374, 445, 190);
    drawField(doc, 'Venue', eventVenue, 374, 480, 190);
    doc.roundedRect(183, 524, 229, 205, 9).lineWidth(3).strokeColor('#d71920').stroke();
    doc.image(Buffer.from(qrData.split(',')[1], 'base64'), 205, 546, { width: 185, height: 185 });
    doc.fillColor('#38465c').font('Helvetica').fontSize(10).text('PRESENT THIS PASS AT THE VENUE ENTRANCE', 75, 735, { width: 445, align: 'center' });
    doc.save().rect(0, 755, 595, 86).fill('#b50813').restore();
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9).text('CONNECT', 92, 770);
    doc.text('COLLABORATE', 244, 770);
    doc.text('CONQUER', 438, 770);
    doc.fillColor('#ffffff').fontSize(17).text('•', 185, 764).text('•', 382, 764);
  });
  const invoiceId = uuidv4();
  const passId = uuidv4();
  const invoice = existing
    ? { ...existing, file_path: invoicePath }
    : { id: invoiceId, registration_id: registration.id, invoice_number: invoiceNumber, file_path: invoicePath, created_at: now };
  const entryPass = existingPass
    ? { ...existingPass, file_path: entryPassPath }
    : { id: passId, registration_id: registration.id, pass_number: passNumber, qr_token: qrToken, file_path: entryPassPath, created_at: now };
  if (existing) await invoices.updateOne({ _id: existing._id }, { $set: { file_path: invoicePath } });
  else await invoices.insertOne(invoice);
  if (existingPass) await passes.updateOne({ _id: existingPass._id }, { $set: { file_path: entryPassPath } });
  else await passes.insertOne(entryPass);
  return { invoice, entryPass };
};

export const sendConfirmationEmail = async (registration, artifacts) => {
  const subject = 'RANNITI 5 – Payment Confirmed | Entry Pass & Invoice';
  const emailLogs = await collection('email_logs');
  const sentAt = new Date().toISOString();
  const attachments = await Promise.all([artifacts.invoice.file_path, artifacts.entryPass.file_path].map(async (filePath) => ({
    filename: path.basename(filePath),
    content: (await fs.readFile(filePath)).toString('base64'),
  })));

  try {
    const brevoApiKey = process.env.BREVO_API_KEY;
    const brevoSenderEmail = process.env.BREVO_SENDER_EMAIL;
    const resendApiKey = process.env.RESEND_API_KEY;
    const resendFromEmail = process.env.RESEND_FROM_EMAIL;

    if (brevoApiKey && brevoSenderEmail) {
      if (brevoApiKey.startsWith('xsmtpsib-')) throw new Error('Brevo SMTP credentials cannot be used with the HTTP API. Set a Brevo v3 API key beginning with xkeysib-.');
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { accept: 'application/json', 'api-key': brevoApiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          sender: { name: process.env.BREVO_SENDER_NAME || 'RANNITI 5', email: brevoSenderEmail },
          to: [{ email: registration.email, name: registration.full_name }],
          subject,
          textContent: `Payment confirmed for ${registration.full_name}. Registration ID: ${registration.id}. Entry Pass: ${artifacts.entryPass.pass_number}.`,
          attachment: attachments,
        }),
      });
      if (response.ok) {
        await emailLogs.insertOne({ id: uuidv4(), registration_id: registration.id, recipient: registration.email, subject, status: 'Sent', provider: 'brevo', sent_at: sentAt });
        return { status: 'Sent', provider: 'brevo' };
      }
      const text = await response.text().catch(() => '');
      if (!resendApiKey || !resendFromEmail) throw new Error(text ? `Brevo rejected email: ${text}` : 'Brevo is not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL.');
    }

    if (resendApiKey && resendFromEmail) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: resendFromEmail,
          to: [registration.email],
          subject,
          text: `Payment confirmed for ${registration.full_name}. Registration ID: ${registration.id}. Entry Pass: ${artifacts.entryPass.pass_number}.`,
          attachments,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || `Resend rejected email: ${JSON.stringify(payload)}`);
      await emailLogs.insertOne({ id: uuidv4(), registration_id: registration.id, recipient: registration.email, subject, status: 'Sent', provider: 'resend', sent_at: sentAt });
      return { status: 'Sent', provider: 'resend' };
    }

    throw new Error('Email is not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL, or RESEND_API_KEY and RESEND_FROM_EMAIL.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await emailLogs.insertOne({ id: uuidv4(), registration_id: registration.id, recipient: registration.email, subject, status: 'Failed', sent_at: sentAt, error: message });
    throw error;
  }
};

export const sendPasswordResetEmail = async (user, token, appUrl) => {
  const subject = 'RANNITI 5 | Reset your password';
  const resetUrl = `${appUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
  const text = `Reset your RANNITI 5 password using this link. It expires in 30 minutes: ${resetUrl}`;
  const resetBrevoApiKey = process.env.BREVO_RESET_PASSWORD_API_KEY || process.env['BREVO_RESET-PASSWORD_API_KEY'] || process.env.BREVO_API_KEY;
  const resetBrevoSenderEmail = process.env.BREVO_RESET_PASSWORD_SENDER_EMAIL || process.env['BREVO_RESET-PASSWORD_SENDER_EMAIL'] || process.env.BREVO_SENDER_EMAIL;
  const resetBrevoSenderName = process.env.BREVO_RESET_PASSWORD_SENDER_NAME || process.env['BREVO_RESET-PASSWORD_SENDER_NAME'] || process.env.BREVO_SENDER_NAME;
  if (resetBrevoApiKey && resetBrevoSenderEmail) {
    if (resetBrevoApiKey.startsWith('xsmtpsib-')) throw new Error('Brevo SMTP credentials cannot be used with the HTTP API. Set a Brevo v3 API key beginning with xkeysib-.');
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { accept: 'application/json', 'api-key': resetBrevoApiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: resetBrevoSenderName || 'RANNITI 5', email: resetBrevoSenderEmail },
        to: [{ email: user.email, name: user.name }],
        subject,
        textContent: text,
      }),
    });
    if (!response.ok) throw new Error(`Brevo rejected password reset email: ${await response.text()}`);
    return;
  }
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) throw new Error('Email is not configured. Set a Brevo reset-password API key and sender email, or RESEND_API_KEY and RESEND_FROM_EMAIL.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to: [user.email], subject, text }),
  });
  if (!response.ok) throw new Error(`Resend rejected password reset email: ${await response.text()}`);
};