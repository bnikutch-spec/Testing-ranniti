export const packages = {
  'Triple Occupancy': {
    id: 'triple-occupancy',
    base: 14999,
    gstPercent: 18,
    gstType: 'exclusive',
    hsCode: '998311',
    description: 'Triple occupancy delegate registration'
  },
  'Double Occupancy': {
    id: 'double-occupancy',
    base: 17499,
    gstPercent: 18,
    gstType: 'exclusive',
    hsCode: '998311',
    description: 'Double occupancy delegate registration'
  },
  '1 Member + 1 Family Member + 1 Kid (Up to 5 years)': {
    id: 'member-family-kid-up-to-5',
    base: 25423.73,
    gstPercent: 18,
    gstType: 'exclusive',
    hsCode: '998311',
    description: 'Member + family + child (up to 5 years)'
  },
  '1 Member + 1 Family Member + 1 Kid (Above 5 years)': {
    id: 'member-family-kid-above-5',
    base: 29661.02,
    gstPercent: 18,
    gstType: 'exclusive',
    hsCode: '998311',
    description: 'Member + family + child (above 5 years)'
  }
};

export const sellerSettings = {
  name: 'Imperial Innoventures',
  gstin: '24ADSPV9796P1ZW',
  pan: 'ADSPV9796P',
  address: 'Ground Floor, Shop No. 5, Plot No. 231, Ward - 12B, Ratnakala Arcade, Gandhidham',
  state: 'Gujarat',
  stateCode: '24',
  phone: '+91 98795 01364',
  email: 'hello@bnikutch.com',
  bankName: 'Kotak Mahindra Bank',
  accountNumber: '0114137470',
  branch: 'Gandhidham Branch',
  ifsc: 'KKBK0000822',
  upiId: 'munjalshah9@okicici',
  invoicePrefix: 'RN5-INV'
};

export const calculatePackagePrice = ({ base, gstPercent = 18, gstType = 'exclusive' } = {}) => {
  const baseValue = Number(base || 0);
  const gstRate = Number(gstPercent || 0);

  if (gstType === 'inclusive') {
    const taxableValue = Number((baseValue / (1 + gstRate / 100)).toFixed(2));
    const gstAmount = Number((baseValue - taxableValue).toFixed(2));
    return {
      base: taxableValue,
      gstAmount,
      total: Number(baseValue.toFixed(2)),
      gstPercent: gstRate,
      taxableValue,
      taxType: gstType
    };
  }

  const gstAmount = Number((baseValue * gstRate / 100).toFixed(2));
  const total = Number((baseValue + gstAmount).toFixed(2));

  return {
    base: baseValue,
    gstAmount,
    total,
    gstPercent: gstRate,
    taxableValue: baseValue,
    taxType: gstType
  };
};

export const formatRupees = (value, digits = 2) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: digits,
  maximumFractionDigits: digits
}).format(Number(value || 0));
