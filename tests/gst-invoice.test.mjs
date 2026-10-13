import assert from 'node:assert/strict';
import { packages, calculatePackagePrice, formatRupees, sellerSettings } from '../public/package-pricing.js';
import { formatIndianAmountInWords, getInvoiceBreakdown, renderInvoicePdf } from '../src/services/documents.js';

const triple = packages['Triple Occupancy'];
const priced = calculatePackagePrice(triple);
assert.equal(triple.base, 14999);
assert.equal(priced.gstAmount, 2699.82);
assert.equal(priced.total, 17698.82);
assert.equal(formatRupees(17698.82), '₹17,698.82');
assert.equal(sellerSettings.address, 'Ground Floor, Shop No. 5, Plot No. 231, Ward - 12B, Ratnakala Arcade, Gandhidham');

const registration = {
	id: 'RN5-REG-TEST',
	full_name: 'Test Member',
	email: 'member@example.com',
	package_name: 'Triple Occupancy',
	package_meta: triple,
	taxable_amount: priced.base,
	gst_amount: priced.gstAmount,
	amount: priced.total,
};
const invoice = getInvoiceBreakdown(registration);
assert.equal(invoice.hsnCode, '998311');
assert.equal(invoice.cgstAmount, 1349.91);
assert.equal(invoice.sgstAmount, 1349.91);
assert.equal(invoice.roundOff, 0);
assert.equal(invoice.total, 17698.82);
assert.equal(formatIndianAmountInWords(invoice.total), 'Indian Rupees Seventeen Thousand Six Hundred Ninety Eight and Eighty Two Paise Only');

const pdf = await renderInvoicePdf(registration, { gateway: 'manual', transaction_id: 'TXN-TEST' }, 'RN5-INV-TEST', {
	name: 'Imperial Innoventures',
	gstin: '24ADSPV9796P1ZW',
	pan: 'ADSPV9796P',
	address: 'Gandhidham, Kutch, Gujarat',
	state: 'Gujarat',
	stateCode: '24',
}, '2026-10-13T00:00:00.000Z');
assert.equal(pdf.subarray(0, 4).toString('ascii'), '%PDF');
assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1);
console.log('GST package pricing smoke test passed');
