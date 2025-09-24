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
  const h = { 'Content-Type': 'application/json', 'ApiKey': API_KEY, 'apiKey': API_KEY };
  if (EMAIL)  h.email = EMAIL;
  if (DEVKEY) h.DevKey = DEVKEY; else if (PASS) h.password = PASS;
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

// ----- List helpers -----
const FT = { String: 1, Number: 2, DateTime: 3, Boolean: 4 };
const OP = { Equals: 0, StartsWith: 10, Contains: 12 };
function like(prop, val) { return { PropertyName: prop, FieldType: FT.String, Operator: OP.Contains, FilterValueArray: [String(val || '')] }; }

function getProp(obj, path) {
  return path.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), obj);
}

async function listTryAll({ type, filters = [], sortProp = 'Name', desc = false, take = 50 }) {
  const bodies = [
    { Type: type, Page: 1, Take: take, SortParams: [{ PropertyName: sortProp, SortDirection: desc ? 1 : 0 }], FilterParams: filters },
    { Type: type, PageNumber: 1, NumberOfRecords: take, Sortation: { PropertyName: sortProp, Direction: desc ? 'Desc' : 'Asc' },
      Filters: filters.map(f => ({ PropertyName: f.PropertyName, FieldType: 'String', Operator: 'Contains', FilterValueArray: f.FilterValueArray })) }
  ];
  for (const body of bodies) {
    try {
      const res = await otPost('/list', body);
      const rows = Array.isArray(res?.Records) ? res.Records : (Array.isArray(res) ? res : null);
      if (rows && rows.length) return rows;
    } catch { /* try next shape */ }
  }
  return [];
}

async function listUnfiltered({ type, sortProp = 'Name', desc = false, take = 300 }) {
  const a = await otPost('/list', { Type: type, Page: 1, Take: take, SortParams: [{ PropertyName: sortProp, SortDirection: desc ? 1 : 0 }] }).catch(() => null);
  let rows = Array.isArray(a?.Records) ? a.Records : (Array.isArray(a) ? a : []);
  if (rows.length) return rows;
  const b = await otPost('/list', { Type: type, PageNumber: 1, NumberOfRecords: take, Sortation: { PropertyName: sortProp, Direction: desc ? 'Desc' : 'Asc' } }).catch(() => null);
  rows = Array.isArray(b?.Records) ? b.Records : (Array.isArray(b) ? b : []);
  return rows || [];
}

// Always return rows that CONTAIN q across the given columns
async function listSearchWithFallback({ type, q, columns, sortProp, desc = false, take = 50, fallbackTake = 400 }) {
  const seen = new Set();
  const merged = [];

  // 1) try filtered requests (OT may ignore them; we still merge)
  for (const col of columns) {
    const rows = await listTryAll({ type, sortProp, desc, take, filters: [like(col, q)] });
    for (const r of rows) if (!seen.has(r.Id)) { seen.add(r.Id); merged.push(r); }
  }

  // 2) ALWAYS post-filter whatever we merged so far
  const needle = String(q).toLowerCase();
  let filtered = merged.filter(r => columns.some(c => {
    const v = getProp(r, c); return typeof v === 'string' && v.toLowerCase().includes(needle);
  }));
  if (filtered.length) return filtered;

  // 3) last resort: unfiltered page → post-filter
  const unfiltered = await listUnfiltered({ type, sortProp, desc, take: fallbackTake });
  filtered = unfiltered.filter(r => columns.some(c => {
    const v = getProp(r, c); return typeof v === 'string' && v.toLowerCase().includes(needle);
  }));
  return filtered;
}

async function getCustomerById(id)     { return otGet(`/Customer?id=${encodeURIComponent(id)}`); }
async function getSalesOrderById(id)   { return otGet(`/SalesOrder?id=${encodeURIComponent(id)}`); }
async function getSalesOrderByDocNo(n) { return otGet(`/SalesOrder?docNo=${encodeURIComponent(n)}`); }

module.exports = {
  otGet, otPost,
  like, listSearchWithFallback,
  getCustomerById, getSalesOrderById, getSalesOrderByDocNo,
};
