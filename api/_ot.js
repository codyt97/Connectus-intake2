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


// ---- Lists API helper ----
export async function otList(body) {
  return otPost('/list', body);
}

// enums the List API actually accepts
const FT = { String: 1, Number: 2, DateTime: 3, Boolean: 4 };
const OP = { Equals: 0, StartsWith: 10, Contains: 12 };

// convenience builder
export function like(prop, value) {
  return { PropertyName: prop, FieldType: FT.String, Operator: OP.Contains, FilterValueArray: [String(value || '')] };
}

// Customer search (by Name, CompanyName, Email, Phone)
// listCustomersByName
export async function listCustomersByName(q, page = 1, take = 25) {
  const like = (p) => ({ PropertyName: p, FieldType: 1, Operator: 12, FilterValueArray: [q] });
  const [byName, byCompany, byEmail, byPhone] = await Promise.all([
    otPost('/Customer/Search', { Page: page, Take: take, FilterParams: [like('Name')] }),
    otPost('/Customer/Search', { Page: page, Take: take, FilterParams: [like('CompanyName')] }),
    otPost('/Customer/Search', { Page: page, Take: take, FilterParams: [like('Email')] }),
    otPost('/Customer/Search', { Page: page, Take: take, FilterParams: [like('Phone')] }),
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

// getCustomerById
export async function getCustomerById(id) {
  const x = await otGet(`/Customer?id=${encodeURIComponent(id)}`);
  // ... (keep your normalizer the same)
}

// Generic List helper (OrderTime Lists API)
export async function otList(listInfo) {
  return otPost('/list', listInfo);
}

// searchSalesOrders
export async function searchSalesOrders(q, page = 1, take = 25) {
  const like = (p) => ({ PropertyName: p, FieldType: 1, Operator: 12, FilterValueArray: [q] });
  const [byDoc, byCust] = await Promise.all([
    otPost('/SalesOrder/Search', { Page: page, Take: take, FilterParams: [like('DocNumber')] }),
    otPost('/SalesOrder/Search', { Page: page, Take: take, FilterParams: [like('CustomerRef.Name')] }),
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

export async function getSalesOrderById(id)   { return otGet(`/SalesOrder?id=${id}`); }
export async function getSalesOrderByDocNo(n) { return otGet(`/SalesOrder?docNo=${n}`); }

