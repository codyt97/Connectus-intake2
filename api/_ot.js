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

// ---- Canonical ListInfo helpers (per docs) ----
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

// keeps the same OP ids you already set above
function contains(field, value) {
  return {
    PropertyName: field,
    Operator: OP.Contains,
    // IMPORTANT: must be an array, not a string
    FilterValueArray: [ String(value ?? '') ]
  };
}




// Try to fetch one page using canonical shape
async function listPage({ type, filters=[], sortProp='Id', dir='Asc', page=1, size=100 }){
  const payload = listInfo({ type, filters, sortProp, dir, page, size });
  const res = await otPost('/list', payload);
  // /list returns an array (per docs)
  return Array.isArray(res?.Records) ? res.Records : (Array.isArray(res) ? res : []);
}

async function listSearch({
  type, q, columns,
  sortProp = 'Id', dir = 'Asc',
  pageSize = 100, maxPages = 8
}) {
  const needle = String(q || '').toLowerCase().trim();

  // Only use server-side filters for simple (non-nested) fields.
  const filterable = (columns || []).filter(c => c && !c.includes('.'));

  const seen = new Set();
  let merged = [];

  // Try server-side filter column-by-column, but never fail the whole search.
  for (const col of filterable) {
    try {
      const rows = await listPage({
        type,
        filters: [contains(col, needle)],
        sortProp, dir, page: 1, size: pageSize
      });
      for (const r of rows) if (!seen.has(r.Id)) { seen.add(r.Id); merged.push(r); }
    } catch (e) {
      // Unknown/invalid column for this tenant -> skip it and keep going
      console.warn('listSearch filter skipped:', type, col, e.message);
    }
  }

  // Post-filter whatever we collected using *all* columns (incl. nested).
  const allCols = columns || [];
  const postFilterMatch = (row) => allCols.some(c => {
    const v = c.split('.').reduce((a,k) => (a ? a[k] : undefined), row);
    return typeof v === 'string' && v.toLowerCase().includes(needle);
  });

  const filtered = merged.filter(postFilterMatch);
  if (filtered.length) return filtered;

  // Fallback: page through the list without filters and post-filter client-side
  const out = [];
  for (let p = 1; p <= maxPages; p++) {
    const rows = await listPage({ type, filters: [], sortProp, dir, page: p, size: pageSize });
    if (!rows.length) break;
    for (const r of rows) if (postFilterMatch(r)) out.push(r);
    if (out.length >= 50) break; // enough to render the modal
  }
  return out;
}


// Entity GETs
async function getCustomerById(id){     return otGet(`/Customer?id=${encodeURIComponent(id)}`); }
async function getSalesOrderById(id){   return otGet(`/SalesOrder?id=${encodeURIComponent(id)}`); }
async function getSalesOrderByDocNo(n){ return otGet(`/SalesOrder?docNo=${encodeURIComponent(n)}`); }


module.exports = {
  otGet, otPost,
  listSearch,
  getCustomerById, getSalesOrderById, getSalesOrderByDocNo,
};
