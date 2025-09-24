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

// --- add these helpers in /api/_ot.js ---

function val(obj, path) {
  return String(
    path.split('.').reduce((a, k) => (a && a[k] != null ? a[k] : undefined), obj) ?? ''
  );
}

// Try a page with progressively smaller sizes if /list is grumpy
async function listPageSafe({ type, filters=[], sortProp='Id', dir='Asc', page=1, size=100 }) {
  const sizes = [size, 50, 25, 10, 5];
  for (const s of sizes) {
    try {
      const rows = await listPage({ type, filters, sortProp, dir, page, size: s });
      return rows;
    } catch (e) {
      // swallow and try the next smaller page size
    }
  }
  return [];
}

// Scan N pages without filters and let us post-filter locally
async function scanList({ type, sortProp='Id', dir='Asc', pageSize=50, maxPages=20 }) {
  let out = [];
  for (let p = 1; p <= maxPages; p++) {
    const rows = await listPageSafe({ type, filters: [], sortProp, dir, page: p, size: pageSize });
    if (!rows.length) break;
    out.push(...rows);
    if (rows.length < pageSize) break; // last page
  }
  return out;
}


// PUT THIS IN /api/_ot.js, replacing the existing listSearch

async function listSearch({
  type,
  q,
  columns,
  sortProp = 'Id',
  dir = 'Asc',
  pageSize = 100,
  maxPages = 12,          // scan a bit deeper for two-word queries
}) {
  const tokens = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  const seen   = new Set();
  const merged = [];

  const addUnique = (rows) => {
    if (!Array.isArray(rows)) return;
    for (const r of rows) {
      if (!seen.has(r.Id)) { seen.add(r.Id); merged.push(r); }
    }
  };

  // Try a filtered call per column, but NEVER fail the whole search
  for (const col of columns) {
    try {
      const rows = await listPage({
        type,
        filters: [contains(col, q)],
        sortProp,
        dir,
        page: 1,
        size: pageSize,
      });
      addUnique(rows);
    } catch (e) {
      console.warn(`listSearch filter skipped: ${type} ${col} ${e.message}`);
      // ignore and move on; some tenants/properties explode on filter
    }
  }

  // Post-filter what we collected using token AND across all provided columns
  const postMatch = (r) => {
    const hay = columns
      .map(c => c.split('.').reduce((a, k) => a?.[k], r))
      .filter(v => typeof v === 'string')
      .join(' ')
      .toLowerCase();
    return tokens.every(t => hay.includes(t));
  };

  let filtered = merged.filter(postMatch);
  if (filtered.length) return filtered;

  // Fallback: scan pages with NO filters, then post-filter
  const out = [];
  for (let p = 1; p <= maxPages; p++) {
    let rows;
    try {
      rows = await listPage({
        type,
        filters: [],
        sortProp,
        dir,
        page: p,
        size: pageSize,
      });
    } catch (e) {
      console.warn(`listSearch fallback page ${p} failed: ${e.message}`);
      break;
    }
    if (!rows?.length) break;

    for (const r of rows) if (postMatch(r)) out.push(r);
    if (out.length >= 75) break; // enough to render quickly
  }
  return out;
}

module.exports = {
  otGet, otPost,
  listSearch,
  getCustomerById, getSalesOrderById, getSalesOrderByDocNo,
};


// Entity GETs (note the correct casing)
async function getCustomerById(id){     return otGet(`/Customer?id=${encodeURIComponent(id)}`); }
async function getSalesOrderById(id){   return otGet(`/SalesOrder?id=${encodeURIComponent(id)}`); }
async function getSalesOrderByDocNo(n){ return otGet(`/SalesOrder?docNo=${encodeURIComponent(n)}`); }

module.exports = {
  otGet, otPost,
  listSearch,           // keep for customers
  scanList, listPageSafe,
  val,
  getCustomerById, getSalesOrderById, getSalesOrderByDocNo,
};

