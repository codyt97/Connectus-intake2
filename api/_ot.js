// /api/_ot.js  — CommonJS, OrderTime canonical shapes
const BASE    = process.env.OT_BASE_URL || 'https://services.ordertime.com/api';
const API_KEY = process.env.OT_API_KEY;
const EMAIL   = process.env.OT_EMAIL || '';
const PASS    = process.env.OT_PASSWORD || '';
const DEVKEY  = process.env.OT_DEV_KEY || '';

function assertEnv(){ if(!BASE) throw new Error('Missing OT_BASE_URL'); if(!API_KEY) throw new Error('Missing OT_API_KEY'); }

// add near top
function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')       // strip accents
    .replace(/[^\p{L}\p{N}]+/gu, ' ') // non letters/digits -> space
    .replace(/\s+/g, ' ')    // collapse spaces
    .trim();
}

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


async function listPage({ type, filters=[], sortProp='Id', dir='Asc', page=1, size=100 }){
  const payload = listInfo({ type, filters, sortProp, dir, page, size });
  const res = await otPost('/list', payload);
  return Array.isArray(res?.Records) ? res.Records : (Array.isArray(res) ? res : []);
}

function contains(field, value) {
  return {
    PropertyName: field,
    Operator: OP.Contains,
    // MUST be an array for OrderTime
    FilterValueArray: [ String(value ?? '') ]
  };
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


// replace your listSearch with this one
async function listSearch({
  type, q, columns,
  sortProp = 'Id', dir = 'Asc',
  pageSize = 100, maxPages = 8,
  minHits = 50        // how many client-side matches before we stop scanning
}) {
  const needleRaw = String(q || '').trim();
  const needle = normalize(needleRaw);
  const tokens = needleRaw.toLowerCase().split(/\s+/).filter(Boolean).map(normalize);
  const seen = new Set();
  let merged = [];

  // server-side filters (best effort)
  for (const col of columns) {
    try {
      const rows = await listPage({
        type,
        filters: [contains(col, needleRaw)],
        sortProp, dir, page: 1, size: pageSize
      });
      for (const r of rows) if (!seen.has(r.Id)) { seen.add(r.Id); merged.push(r); }
    } catch (e) {
      console.warn('listSearch filter skipped:', type, col, e?.message || e);
    }
  }

  // tokenized client-side match (handles "iphone 14" vs "iphone14", punctuation, etc.)
  const matches = (row) => {
    for (const c of columns) {
      const v = c.split('.').reduce((a,k)=>a?.[k], row);
      if (typeof v !== 'string') continue;
      const nv = normalize(v);
      if (nv.includes(needle)) return true;
      if (tokens.length > 1 && tokens.every(t => nv.includes(t))) return true;
    }
    return false;
  };

  const filtered = merged.filter(matches);
  if (filtered.length) return filtered;

  // fallback: scan pages without filters and match client-side
  merged = [];
  for (let p = 1; p <= maxPages; p++) {
    let rows = [];
    try {
      rows = await listPage({ type, filters: [], sortProp, dir, page: p, size: pageSize });
    } catch (e) {
      console.warn('listSearch fallback page', p, 'failed for', type, e?.message || e);
      break; // stop scanning on hard OT errors
    }
    if (!rows.length) break;
    for (const r of rows) if (matches(r)) merged.push(r);
    if (merged.length >= minHits) break;
  }
  return merged;
}



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

