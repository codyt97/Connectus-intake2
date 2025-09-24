// /api/_ot.js
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

function contains(field, value){
  return { PropertyName: field, Operator: OP.Contains, FilterValueArray: String(value ?? '') };
}

async function listPage({ type, filters=[], sortProp='Id', dir='Asc', page=1, size=100 }){
  const payload = listInfo({ type, filters, sortProp, dir, page, size });
  const res = await otPost('/list', payload);
  return Array.isArray(res?.Records) ? res.Records : (Array.isArray(res) ? res : []);
}

function deepGet(obj, path){
  return path.split('.').reduce((a,k)=> a?.[k], obj);
}

// --------- SMART SEARCH (AND of tokens across any column) ----------
async function listSearch({
  type,
  q,
  columns,
  sortProp='Id',
  dir='Asc',
  pageSize=100,
  maxPages=10,          // a little higher so we can find rarer combos
  targetCount=100       // stop once we have this many matches
}){
  const raw = String(q||'').trim();
  if (!raw) return [];

  // tokens: split on whitespace & punctuation; lower-case
  const terms = raw.toLowerCase().split(/[\s\-_/]+/).filter(Boolean);
  const seed  = terms.slice().sort((a,b)=>b.length-a.length)[0] || ''; // longest term first

  const seen = new Set();
  let pool = [];

  // 1) Seeded pulls (each searchable column, filter by longest token)
  if (seed){
    for (const col of columns){
      try {
        const page = await listPage({ type, filters:[contains(col, seed)], sortProp, dir, page:1, size:pageSize });
        for (const r of page) if (!seen.has(r.Id)) { seen.add(r.Id); pool.push(r); }
      } catch { /* ignore column-level errors */ }
    }
  }

  // 2) Post-filter for AND-of-terms across any of the columns
  const qualifies = r => {
    const hay = columns
      .map(c => deepGet(r, c))
      .filter(v => typeof v === 'string' && v)
      .join(' ')
      .toLowerCase();
    return terms.every(t => hay.includes(t));
  };
  let out = pool.filter(qualifies);
  if (out.length >= Math.min(targetCount, 20)) return out.slice(0, targetCount);

  // 3) Fallback scan: walk pages until we have enough
  pool = [];
  for (let p=1; p<=maxPages; p++){
    let rows = [];
    try {
      rows = await listPage({ type, filters:[], sortProp, dir, page:p, size:pageSize });
    } catch { break; }
    if (!rows.length) break;

    for (const r of rows) if (qualifies(r)) pool.push(r);
    if (pool.length >= targetCount) break;
  }

  return pool.slice(0, targetCount);
}

// Entity GETs
async function getCustomerById(id){     return otGet(`/customer?id=${encodeURIComponent(id)}`); }
async function getSalesOrderById(id){   return otGet(`/salesorder?id=${encodeURIComponent(id)}`); }
async function getSalesOrderByDocNo(n){ return otGet(`/salesorder?docNo=${encodeURIComponent(n)}`); }

module.exports = {
  otGet, otPost,
  listSearch,
  getCustomerById, getSalesOrderById, getSalesOrderByDocNo,
};
