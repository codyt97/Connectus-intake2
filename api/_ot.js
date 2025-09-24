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

// Try both payload dialects; return rows or []
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
    } catch (_) { /* try next shape */ }
  }
  return [];
}

// no filters, just a page to allow manual filtering
async function listUnfiltered({ type, sortProp = 'Name', desc = false, take = 200 }) {
  const resA = await otPost('/list', { Type: type, Page: 1, Take: take, SortParams: [{ PropertyName: sortProp, SortDirection: desc ? 1 : 0 }] }).catch(() => null);
  let rows = Array.isArray(resA?.Records) ? resA.Records : (Array.isArray(resA) ? resA : []);
  if (rows.length) return rows;

  const resB = await otPost('/list', { Type: type, PageNumber: 1, NumberOfRecords: take, Sortation: { PropertyName: sortProp, Direction: desc ? 'Desc' : 'Asc' } }).catch(() => null);
  rows = Array.isArray(resB?.Records) ? resB.Records : (Array.isArray(resB) ? resB : []);
  return rows || [];
}

function postFilter(rows, q, pick) {
  if (!q) return rows;
  const needle = String(q).toLowerCase();
  return rows.filter(r => pick(r).some(v => typeof v === 'string' && v.toLowerCase().includes(needle)));
}

// Convenient search with fallback
async function listSearchWithFallback({ type, q, columns, sortProp, desc = false, take = 50, fallbackTake = 300 }) {
  // 1) try each column as its own filter (OR) and merge
  const merged = [];
  const seen = new Set();
  for (const col of columns) {
    const rows = await listTryAll({ type, sortProp, desc, take, filters: [like(col, q)] });
    for (const r of rows) if (!seen.has(r.Id)) { seen.add(r.Id); merged.push(r); }
  }
  if (merged.length) return merged;

  // 2) fallback: pull an unfiltered page and post-filter by string contains
  const unfiltered = await listUnfiltered({ type, sortProp, desc, take: fallbackTake });
  return postFilter(unfiltered, q, (r) => columns.map(c => {
    // basic dotted-path support (e.g., 'CustomerRef.Name')
    const parts = c.split('.');
    let cur = r; for (const p of parts) { cur = (cur || {})[p]; }
    return cur;
  }));
}

async function getCustomerById(id)     { return otGet(`/Customer?id=${encodeURIComponent(id)}`); }
async function getSalesOrderById(id)   { return otGet(`/SalesOrder?id=${encodeURIComponent(id)}`); }
async function getSalesOrderByDocNo(n) { return otGet(`/SalesOrder?docNo=${encodeURIComponent(n)}`); }

module.exports = {
  otGet, otPost,
  like, listSearchWithFallback,
  getCustomerById, getSalesOrderById, getSalesOrderByDocNo,
};
