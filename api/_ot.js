// /api/_ot.js  (CommonJS)
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
    'ApiKey': API_KEY,
    'apiKey': API_KEY,
  };
  if (EMAIL)  h.email = EMAIL;
  if (DEVKEY) h.DevKey = DEVKEY;
  else if (PASS) h.password = PASS;
  return h;
}

async function _req(path, init = {}) {
  assertEnv();
  const url = `${BASE}${path.startsWith('/') ? '' : '/'}${path}`;
  const r = await fetch(url, { ...init, headers: { ...authHeaders(), ...(init.headers || {}) } });
  const txt = await r.text();
  let data; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if (!r.ok) throw new Error(typeof data === 'string' ? data : (data?.Message || data?.error || r.statusText));
  return data;
}

async function otGet(path)     { return _req(path, { method: 'GET'  }); }
async function otPost(path, b) { return _req(path, { method: 'POST', body: JSON.stringify(b || {}) }); }

// ---- Lists helper + tiny DSL for filters ----
async function otList(body) { return otPost('/list', body); }
const FT = { String: 1, Number: 2, DateTime: 3, Boolean: 4 };
const OP = { Equals: 0, StartsWith: 10, Contains: 12 };
function like(prop, value) {
  return { PropertyName: prop, FieldType: FT.String, Operator: OP.Contains, FilterValueArray: [String(value || '')] };
}

// Optional tiny CRUD helpers some routes use
async function getCustomerById(id)      { return otGet(`/Customer?id=${encodeURIComponent(id)}`); }
async function getSalesOrderById(id)    { return otGet(`/SalesOrder?id=${encodeURIComponent(id)}`); }
async function getSalesOrderByDocNo(n)  { return otGet(`/SalesOrder?docNo=${encodeURIComponent(n)}`); }

module.exports = {
  otGet, otPost, otList, like,
  getCustomerById, getSalesOrderById, getSalesOrderByDocNo,
};
