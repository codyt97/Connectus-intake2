// /api/_ot.js  — CommonJS, OrderTime canonical shapes
const BASE    = process.env.OT_BASE_URL || 'https://services.ordertime.com/api';
const API_KEY = process.env.OT_API_KEY;
const EMAIL   = process.env.OT_EMAIL || '';
const PASS    = process.env.OT_PASSWORD || '';
const DEVKEY  = process.env.OT_DEV_KEY || '';

function assertEnv(){ if(!BASE) throw new Error('Missing OT_BASE_URL'); if(!API_KEY) throw new Error('Missing OT_API_KEY'); }

function authHeaders(){
  const h = { 'Content-Type':'application/json', ApiKey:API_KEY, apiKey:API_KEY };
  if (EMAIL)  h.email = EMAIL;
  if (DEVKEY) h.DevKey = DEVKEY; else if (PASS) h.password = PASS;
  return h;
}

async function _req(path, init={}){
  assertEnv();
  const url = `${BASE}${path.startsWith('/')?'':'/'}${path}`;
  const r = await fetch(url, { ...init, headers:{ ...authHeaders(), ...(init.headers||{}) } });
  const txt = await r.text();
  let data; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if(!r.ok) throw new Error(typeof data==='string' ? data : (data?.Message||data?.error||r.statusText));
  return data;
}

async function otGet(path){  return _req(path, { method:'GET'  }); }
async function otPost(path,b){return _req(path, { method:'POST', body:JSON.stringify(b||{}) }); }

// ---- Canonical ListInfo helpers
const OP = { Contains: 12 };

function listInfo({ type, filters=[], sortProp='Id', dir='Asc', page=1, size=100 }){
  return {
    Type: type,
    Filters: filters,
    Sortation: { PropertyName: sortProp, Direction: dir },
    PageNumber: page,
    NumberOfRecords: size
  };
}

function contains(field, value) {
  return {
    PropertyName: field,
    Operator: OP.Contains,
    // MUST be an array for OrderTime
    FilterValueArray: [ String(value ?? '') ]
  };
}

async function listPage({ type, filters=[], sortProp='Id', dir='Asc', page=1, size=100 }){
  const payload = listInfo({ type, filters, sortProp, dir, page, size });
  const res = await otPost('/list', payload);
  return Array.isArray(res?.Records) ? res.Records : (Array.isArray(res) ? res : []);
}

// recursive “does any string field include needle?”
function rowContainsAnyString(value, needle) {
  if (!value) return false;
  if (typeof value === 'string') return value.toLowerCase().includes(needle);
  if (Array.isArray(value)) return value.some(v => rowContainsAnyString(v, needle));
  if (typeof value === 'object') return Object.values(value).some(v => rowContainsAnyString(v, needle));
  return false;
}

async function listSearch({
  type, q, columns,
  sortProp = 'Id', dir = 'Asc',
  pageSize = 100, maxPages = 8
}) {
  const needle = String(q || '').toLowerCase().trim();
  const filterable = (columns || []).filter(c => c && !c.includes('.')); // only simple fields

  const seen = new Set();
  let merged = [];

  // Try server-side filters, but never fail the whole search.
  for (const col of filterable) {
    try {
      const rows = await listPage({
        type,
        filters: [contains(col, needle)],
        sortProp, dir, page: 1, size: pageSize
      });
      for (const r of rows) if (!seen.has(r.Id)) { seen.add(r.Id); merged.push(r); }
    } catch (e) {
      console.warn('listSearch filter skipped:', type, col, e.message);
    }
  }

  // Post-filter whatever we collected using the provided columns (incl. nested)
  const usesColumns = (columns && columns.length > 0);
  const postMatch = (row) => {
    if (usesColumns) {
      return columns.some(c => {
        const v = c.split('.').reduce((a,k) => (a ? a[k] : undefined), row);
        return typeof v === 'string' && v.toLowerCase().includes(needle);
      });
    }
    return rowContainsAnyString(row, needle);
  };

  const filtered = merged.filter(postMatch);
  if (filtered.length) return filtered;

  // Fallback: page through without filters and match across ANY string fields
  const out = [];
  for (let p = 1; p <= maxPages; p++) {
    const rows = await listPage({ type, filters: [], sortProp, dir, page: p, size: pageSize });
    if (!rows.length) break;
    for (const r of rows) if (rowContainsAnyString(r, needle)) out.push(r);
    if (out.length >= 50) break;
  }
  return out;
}

// Entity GETs (note the correct casing)
async function getCustomerById(id){     return otGet(`/Customer?id=${encodeURIComponent(id)}`); }
async function getSalesOrderById(id){   return otGet(`/SalesOrder?id=${encodeURIComponent(id)}`); }
async function getSalesOrderByDocNo(n){ return otGet(`/SalesOrder?docNo=${encodeURIComponent(n)}`); }

module.exports = {
  otGet, otPost,
  listSearch,
  getCustomerById, getSalesOrderById, getSalesOrderByDocNo,
};
