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
  if (EMAIL)  h.email   = EMAIL;
  if (DEVKEY) h.DevKey  = DEVKEY;
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

// ---------- Lists helpers ----------
const FT = { String: 1, Number: 2, DateTime: 3, Boolean: 4 };
const OP = { Equals: 0, StartsWith: 10, Contains: 12 };

// builder
function like(prop, value) {
  return { PropertyName: prop, FieldType: FT.String, Operator: OP.Contains, FilterValueArray: [String(value || '')] };
}

// Some OT tenants use ListInfo(A); others use ListInfo(B). Try both then post-filter.
async function otListSmart({ type, filters, sortProp, desc = false, take = 50 }) {
  const bodies = [
    // A) Page/Take + SortParams + FilterParams
    {
      Type: type, Page: 1, Take: take,
      SortParams: [{ PropertyName: sortProp || 'Name', SortDirection: desc ? 1 : 0 }],
      FilterParams: filters
    },
    // B) PageNumber/NumberOfRecords + Sortation + Filters (string enums also ok)
    {
      Type: type, PageNumber: 1, NumberOfRecords: take,
      Sortation: { PropertyName: sortProp || 'Name', Direction: desc ? 'Desc' : 'Asc' },
      Filters: filters.map(f => ({
        PropertyName: f.PropertyName,
        FieldType: 'String',
        Operator: 'Contains',
        FilterValueArray: f.FilterValueArray
      }))
    }
  ];

  // Try A then B; if either returns .Records use it; if array, use it
  for (const body of bodies) {
    try {
      const res = await otPost('/list', body);
      const rows = Array.isArray(res?.Records) ? res.Records : (Array.isArray(res) ? res : null);
      if (rows && rows.length) return rows;
    } catch (_e) { /* try next shape */ }
  }
  // last resort: no rows or shapes both rejected
  return [];
}

// best-effort post-filter (keeps UI relevant even if OT ignores filters)
function filterRows(rows, q, pick) {
  if (!q) return rows;
  const needle = String(q).toLowerCase();
  return rows.filter(row => {
    const hay = pick(row);
    return hay.some(v => typeof v === 'string' && v.toLowerCase().includes(needle));
  });
}

// ---------- Direct GET helpers (used by :id and docNo) ----------
async function getCustomerById(id)     { return otGet(`/Customer?id=${encodeURIComponent(id)}`); }
async function getSalesOrderById(id)   { return otGet(`/SalesOrder?id=${encodeURIComponent(id)}`); }
async function getSalesOrderByDocNo(n) { return otGet(`/SalesOrder?docNo=${encodeURIComponent(n)}`); }

module.exports = {
  otGet, otPost,
  otListSmart, like, filterRows,
  getCustomerById, getSalesOrderById, getSalesOrderByDocNo,
};
