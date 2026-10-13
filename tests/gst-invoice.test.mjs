import assert from 'node:assert/strict';
import { packages, calculatePackagePrice, formatRupees } from '../public/package-pricing.js';

const triple = packages['Triple Occupancy'];
const priced = calculatePackagePrice(triple);
assert.equal(triple.base, 14999);
assert.equal(priced.gstAmount, 2699.82);
assert.equal(priced.total, 17698.82);
assert.equal(formatRupees(17698.82), '₹17,698.82');
console.log('GST package pricing smoke test passed');
