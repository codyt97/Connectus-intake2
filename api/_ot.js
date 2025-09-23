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
  const h = {
    'Content-Type': 'application/json',
    // OT accepts ApiKey/apiKey case variants in some tenants; send both to be safe.
    'ApiKey': API_KEY,
    'apiKey': API_KEY,
  };
  if (EMAIL)  { h.email = EMAIL; }
  if (DEVKEY) { h.DevKey = DEVKEY; }
  else if (PASS) { h.password = PASS; }
  return h;
}

async function _req(path, init = {}) {
  assertEnv();
  const url = `${BASE}${path.startsWith('/') ? '' : '/'}${path}`;
  const r = await fetch(url, { ...init, headers: { ...authHeaders(), ...(init.headers || {}) }});
  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw new Error(typeof data === 'string' ? data : (data?.Message || data?.error || r.statusText));
  return data;
}

export async function otGet(path)      { return _req(path, { method: 'GET'  }); }
export async function otPost(path, body){ return _req(path, { method: 'POST', body: JSON.stringify(body || {}) }); }

/* =========================
   Domain helpers (normalized)
   ========================= */

// Customer search (by Name, CompanyName, Email, Phone)
export async function listCustomersByName(q, page = 1, take = 25) {
  const like = (prop) => ({ PropertyName: prop, FieldType: 1, Operator: 12, FilterValueArray: [q] });
  // Two passes (name/company) then merge/unique
  const [byName, byCompany, byEmail, byPhone] = await Promise.all([
    otPost('/customer/Search', { Page: page, Take: take, FilterParams: [like('Name')] }),
    otPost('/customer/Search', { Page: page, Take: take, FilterParams: [like('CompanyName')] }),
    otPost('/customer/Search', { Page: page, Take: take, FilterParams: [like('Email')] }),
    otPost('/customer/Search', { Page: page, Take: take, FilterParams: [like('Phone')] }),
  ]);

  const seen = new Set();
  return [...byName, ...byCompany, ...byEmail, ...byPhone]
    .filter(r => (seen.has(r.Id) ? false : (seen.add(r.Id), true)))
    .map(r => ({
      id: r.Id,
      company: r.CompanyName || r.Name || '',
      contact: r.Contact || r.PrimaryContact || '',
      phone: r.Phone || r.BillPhone || r.MainPhone || '',
      email: r.Email || r.BillingEmail || '',
      city: r.City || r.BillingCity || '',
      state: r.State || r.BillingState || '',
    }));
}

// Get + normalize a single customer for “Apply”
export async function getCustomerById(id) {
  const x = await otGet(`/customer?id=${encodeURIComponent(id)}`);

  // OrderTime uses Addr1/2/3 -> Name/Street/Suite (yep, street is Addr2)
  const pickAddr = (a = {}) => ({
    name:  a.Addr1 || '',
    street:a.Addr2 || '',
    suite: a.Addr3 || '',
    city:  a.City  || '',
    state: a.State || '',
    zip:   a.PostalCode || a.Zip || '',
    phone: a.Phone || '',
    email: a.Email || '',
  });

  const bill = pickAddr(x.BillAddress || x.BillingAddress || {
    Addr1: x.CompanyName || x.Name, Addr2: x.BillingAddress1, Addr3: x.BillingAddress2,
    City: x.BillingCity, State: x.BillingState, PostalCode: x.BillingZip, Phone: x.BillingPhone, Email: x.BillingEmail
  });

  const ship = pickAddr(x.ShipAddress || x.ShippingAddress || {
    Addr1: x.ShipCompany || x.CompanyName || x.Name, Addr2: x.ShippingAddress1, Addr3: x.ShippingAddress2,
    City: x.ShippingCity, State: x.ShippingState, PostalCode: x.ShippingZip, Phone: x.ShippingPhone, Email: x.ShippingEmail
  });

  return {
    id: x.Id,
    company: x.CompanyName || x.Name || '',
    billing: bill,
    shipping: ship,
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
    rep: { primary: x.PrimaryRepName || '', secondary: x.SecondaryRepName || '' },
  };
}

// Sales order search (doc no or customer name)
export async function searchSalesOrders(q, page = 1, take = 25) {
  const like = (prop) => ({ PropertyName: prop, FieldType: 1, Operator: 12, FilterValueArray: [q] });
  const [byDoc, byCust] = await Promise.all([
    otPost('/salesorder/Search', { Page: page, Take: take, FilterParams: [like('DocNumber')] }),
    otPost('/salesorder/Search', { Page: page, Take: take, FilterParams: [like('CustomerRef.Name')] }),
  ]);
  const seen = new Set();
  return [...byDoc, ...byCust]
    .filter(r => (seen.has(r.Id) ? false : (seen.add(r.Id), true)))
    .map(r => ({
      id: r.Id,
      docNo: r.DocNumber || r.Number || r.DocNo || '',
      customer: r.CustomerRef?.Name || '',
      status: r.Status || r.DocStatus || '',
      date: r.TxnDate || r.Date || ''
    }));
}

export async function getSalesOrderById(id)    { return otGet(`/salesorder?id=${id}`); }
export async function getSalesOrderByDocNo(n)  { return otGet(`/salesorder?docNo=${n}`); }
