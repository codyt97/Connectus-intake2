// /api/_ot.js
const BASE    = process.env.OT_BASE_URL || 'https://services.ordertime.com/api';
const API_KEY = process.env.OT_API_KEY;
const EMAIL   = process.env.OT_EMAIL || '';
const PASS    = process.env.OT_PASSWORD || '';
const DEVKEY  = process.env.OT_DEV_KEY || '';

function assertEnv() {
  if (!BASE) throw new Error('Missing OT_BASE_URL');
  if (!API_KEY) throw new Error('Missing OT_API_KEY');
}

function authHeaders() {
  // Be generous with header names (some tenants differ)
  const h = {
    'Content-Type': 'application/json',
    ApiKey: API_KEY,
    apiKey: API_KEY,
    'x-api-key': API_KEY,
  };
  if (EMAIL) h.email = EMAIL;
  if (DEVKEY) h.DevKey = DEVKEY;
  else if (PASS) h.password = PASS;
  return h;
}

function safeJSON(txt) { try { return JSON.parse(txt); } catch { return null; } }

async function post(path, body) {
  assertEnv();
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`OT POST ${path} ${res.status}: ${text}`);
  return safeJSON(text) ?? text;
}

async function get(path) {
  assertEnv();
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  const text = await res.text();
  if (!res.ok) throw new Error(`OT GET ${path} ${res.status}: ${text}`);
  return safeJSON(text) ?? text;
}

// Export a generic poster so all routes share the same working auth
export async function otPost(path, body) { return post(path, body); }
export async function otGet(path) { return get(path); }

// Normalized customer-by-id (used by WCP "Apply")
export async function getCustomerById(id) {
  const x = await get(`/customer?id=${encodeURIComponent(id)}`);

  const bill = x.BillAddress || x.BillingAddress || {
    Contact: x.BillingContact, Phone: x.BillingPhone, Email: x.BillingEmail,
    Addr1: x.BillingAddress1 || x.BillingAddress, Addr2: x.BillingAddress2,
    City: x.BillingCity, State: x.BillingState, Zip: x.BillingZip
  };
  const ship = x.ShipAddress || x.ShipToAddress || {
    Contact: x.ShipToContact, Phone: x.ShipToPhone, Email: x.ShipToEmail,
    Addr1: x.ShipToAddress1, Addr2: x.ShipToAddress2,
    City: x.ShipToCity, State: x.ShipToState, Zip: x.ShipToZip,
    IsResidential: x.ShipToIsResidential
  };

  return {
    company: x.Company || x.CompanyName || x.Name || '',
    billing: {
      contact: bill?.Contact || '',
      phone:   bill?.Phone   || '',
      email:   bill?.Email   || '',
      street:  bill?.Addr1   || '',
      suite:   bill?.Addr2   || '',
      city:    bill?.City    || '',
      state:   bill?.State   || '',
      zip:     bill?.Zip     || ''
    },
    shipping: {
      company: x.ShipToCompany || x.Company || '',
      contact: ship?.Contact || '',
      phone:   ship?.Phone   || '',
      email:   ship?.Email   || '',
      street:  ship?.Addr1   || '',
      suite:   ship?.Addr2   || '',
      city:    ship?.City    || '',
      state:   ship?.State   || '',
      zip:     ship?.Zip     || '',
      residence: !!ship?.IsResidential
    },
    payment: {
      method: x.DefaultPaymentMethod || '',
      terms:  x.PaymentTerms || '',
      taxExempt: !!x.IsTaxExempt,
      agreement: !!x.HasPurchaseAgreement,
    },
    shippingOptions: {
      pay:   x.DefaultShipPaymentMethod || '',
      speed: x.DefaultShipSpeed || '',
      shortShip: x.ShortShipPolicy || '',
    },
    carrierRep: { name: x.CarrierRepName || '', email: x.CarrierRepEmail || '' },
    rep:        { primary: x.PrimaryRepName || '', secondary: x.SecondaryRepName || '' },
  };
}
