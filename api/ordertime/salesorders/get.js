// /api/ordertime/salesorders/get.js
//
// Resolve a Sales Order by DocNo or internal Id and return a normalized payload:
// { docNo, tranType, customer, billing, shipping, lines[] }.
//
// Strategy:
//  1) If input is numeric, try it as an internal Id via POST /api/document/get (all common types).
//  2) Else (or if Id lookup fails), search DocNo via POST /api/list with tolerant filters,
//     trying both "/list" and "/List" path variants (some tenants are picky).
//  3) Fetch full document by Id via POST /api/document/get and normalize.
//  4) If still failing, return a FOCUSED debug object listing each URL we tried and its status.
//
// Self-contained – no imports from _ot.js.

const RAW_BASE =
  process.env.OT_BASE_URL ||
  process.env.ORDERTIME_BASE_URL ||
  process.env.ORDERTIME_BASE ||
  'https://services.ordertime.com'; // tolerate with/without /api

// Normalize to exactly ".../api" (avoid .../api/api & tolerate tenants that omit the suffix)
const BASE_ROOT = String(RAW_BASE).replace(/\/+$/,'').replace(/\/api$/,'');
const BASE_API  = `${BASE_ROOT}/api`;

const API_KEY =
  process.env.OT_API_KEY || process.env.ORDERTIME_API_KEY;
const EMAIL   =
  process.env.OT_EMAIL    || process.env.ORDERTIME_EMAIL;
const PASS    =
  process.env.OT_PASSWORD || process.env.ORDERTIME_PASSWORD;
const DEVKEY  =
  process.env.OT_DEV_KEY  || process.env.ORDERTIME_DEV_KEY;

function ensureEnv() {
  if (!API_KEY) throw new Error('Missing API key (set OT_API_KEY or ORDERTIME_API_KEY)');
  if (!EMAIL)   throw new Error('Missing email (set OT_EMAIL or ORDERTIME_EMAIL)');
  if (!PASS && !DEVKEY) throw new Error('Missing secret (set OT_PASSWORD/ORDERTIME_PASSWORD or OT_DEV_KEY/ORDERTIME_DEV_KEY)');
}

function otHeaders() {
  const h = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'ApiKey': API_KEY,
    'Email': EMAIL,
  };
  if (DEVKEY) h.DevKey = DEVKEY; else h.Password = PASS;
  return h;
}

async function otPost(path, body) {
  const url = `${BASE_API}${path.startsWith('/') ? '' : '/'}${path}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: otHeaders(),
    body: JSON.stringify(body || {}),
  });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { url, ok: r.ok, status: r.status, text, json };
}

/* -------------------- list result & order normalizers ------------------- */

function normalizeListResult(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  const keys = ['Items','items','List','list','Results','results','Rows','rows'];
  for (const k of keys) if (Array.isArray(data[k])) return data[k];
  const shells = ['Data','data','Result','result','Payload','payload'];
  for (const s of shells) {
    const v = data[s];
    if (v && typeof v === 'object') {
      for (const k of keys) if (Array.isArray(v[k])) return v[k];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

function normalizeSalesOrder(r) {
  const get = (o, p, d='') => { try { return p.split('.').reduce((x,k)=>x?.[k], o) ?? d; } catch { return d; } };

  const billing = {
    company: get(r,'CustomerRef.Name') || get(r,'CustomerName') || '',
    contact: get(r,'BillTo.ContactName'),
    phone:   get(r,'BillTo.Phone'),
    email:   get(r,'BillTo.Email'),
    street:  get(r,'BillTo.Address1'),
    suite:   get(r,'BillTo.Address2'),
    city:    get(r,'BillTo.City'),
    state:   get(r,'BillTo.State'),
    zip:     get(r,'BillTo.Zip'),
  };

  const shipping = {
    company: get(r,'ShipTo.Company') || billing.company || '',
    contact: get(r,'ShipTo.ContactName'),
    phone:   get(r,'ShipTo.Phone'),
    email:   get(r,'ShipTo.Email'),
    street:  get(r,'ShipTo.Address1'),
    suite:   get(r,'ShipTo.Address2'),
    city:    get(r,'ShipTo.City'),
    state:   get(r,'ShipTo.State'),
    zip:     get(r,'ShipTo.Zip'),
    residence: !!get(r,'ShipTo.Residential', false),
  };

  const customer = {
    id:    get(r,'CustomerRef.Id') || get(r,'CustomerId'),
    name:  get(r,'CustomerRef.Name') || get(r,'CustomerName'),
    po:    get(r,'PONumber') || '',
    terms: get(r,'Terms') || '',
  };

  const lines = (r?.Lines || r?.LineItems || []).map(L => {
    const g = (p,d='') => get(L,p,d);
    const qty = Number(g('Quantity', 0));
    const up  = Number(g('UnitPrice', 0));
    const ext = Number(g('Amount', qty * up));
    return {
      lineId:      g('LineId') || g('Id') || g('LineNo'),
      itemId:      g('ItemRef.Id') || g('ItemId') || g('Item.ID'),
      item:        g('ItemRef.Name') || g('ItemName') || '',
      sku:         g('ItemRef.Code') || g('ItemCode') || g('SKU') || '',
      description: g('Description') || '',
      qty,
      unitPrice:   up,
      extPrice:    ext,
      attributes: {
        carrier:     g('Custom.Carrier') || g('Carrier') || '',
        lteWifiBoth: g('Custom.LTE_WiFi_Both') || g('LTE_WiFi_Both') || '',
        condition:   g('Custom.New_CPO') || g('New_CPO') || '',
      }
    };
  });

  return {
    docNo:
      get(r,'DocNo') || get(r,'DocumentNo') || get(r,'DocNumber') ||
      get(r,'Number') || get(r,'RefNo') || get(r,'RefNumber') ||
      get(r,'DocNoDisplay'),
    tranType: get(r,'TranType') || '',
    customer, billing, shipping, lines,
  };
}

/* ----------------------- DocNo → Id (robust) ---------------------------- */

async function resolveByIdOrDocNo(input) {
  const TYPES = [130, 135, 131, 140, 7]; // common SO header-ish types
  const F_DOC = ['DocNo','DocumentNo','DocNumber','Number','RefNo','RefNumber','DocNoDisplay'];
  const F_ID  = ['Id','ID','id'];

  const attempts = []; // for debug report

  const val = String(input || '').trim();
  const isNumeric = /^\d+$/.test(val);

  // 1) If numeric, try as internal Id first (fast path)
  if (isNumeric) {
    for (const TYPE of TYPES) {
      const a = await otPost('/document/get', { Type: TYPE, Id: Number(val) });
      attempts.push({ kind: 'document/get(Id)', url: a.url, status: a.status });
      if (a.ok && a.json) {
        const raw = Array.isArray(a.json) ? a.json[0] : a.json;
        return { ok: true, id: Number(val), TYPE, raw, attempts };
      }
    }
  }

  // 2) DocNo strategies: SO-prefix & zero-pad candidates, equals & contains, scalar & array
  const candidates = (() => {
    const s = new Set([val]);
    if (val && !/^SO[-\s]/i.test(val)) { s.add(`SO-${val}`); s.add(`SO ${val}`); }
    if (/^\d+$/.test(val)) {
      const n = val.length; for (const w of [6,7,8]) if (w > n) s.add(val.padStart(w, w));
    }
    return [...s];
  })();

  const LIST_PATHS = ['/list','/List']; // try both casings

  for (const path of LIST_PATHS) {
    for (const TYPE of TYPES) {
      for (const asArray of [false, true]) {
        for (const op of [0, 12]) { // 0 = equals, 12 = contains
          for (const v of candidates) {
            const fv = asArray ? [v] : v;
            const Filters = F_DOC.map(p => ({ PropertyName: p, Operator: op, FilterValueArray: fv }));
            const body = {
              Type: TYPE,
              NumberOfRecords: 1,
              PageNumber: 1,
              SortOrder: { PropertyName: F_DOC[0], Direction: 1 },
              Filters
            };
            const a = await otPost(path, body);
            attempts.push({ kind: `list ${path}`, url: a.url, status: a.status });
            if (!a.ok) continue;

            const rows = normalizeListResult(a.json);
            if (rows && rows.length) {
              const row = rows[0];
              const id = F_ID.map(k => row?.[k]).find(Boolean);
              if (id) return { ok: true, id, TYPE, attempts };
            }
          }
        }
      }
    }
  }

  return { ok: false, attempts };
}

/* -------------------------------- Route -------------------------------- */

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { docNo, debug } = req.query;
    if (!docNo) return res.status(400).json({ error: 'Missing ?docNo=' });

    ensureEnv();

    // Resolve by Id or DocNo
    const r = await resolveByIdOrDocNo(docNo);

    // If debug requested or not found, expose what we tried
    if ((!r.ok || debug === '1') && debug !== '0') {
      if (!r.ok && debug === '1') {
        return res.status(404).json({ error: `DocNo not found: ${docNo}`, attempts: r.attempts });
      }
    }

    if (!r.ok) return res.status(404).json({ error: `DocNo not found: ${docNo}` });

    // If we already got the raw doc via Id fast-path, normalize and return
    if (r.raw) {
      return res.status(200).json({ ok: true, order: normalizeSalesOrder(r.raw) });
    }

    // Otherwise fetch by Id now
    const getRes = await otPost('/document/get', { Type: r.TYPE, Id: r.id });
    if (getRes.ok && getRes.json) {
      const raw = Array.isArray(getRes.json) ? getRes.json[0] : getRes.json;
      return res.status(200).json({ ok: true, order: normalizeSalesOrder(raw) });
    }

    // Surface upstream error
    return res.status(getRes.status || 502).json({
      error: `document/get failed ${getRes.status}: ${getRes.text?.slice?.(0,300) || 'No body'}`,
    });

  } catch (e) {
    const msg = e?.stack ? `${e.message}\n${e.stack}` : String(e || 'Server error');
    return res.status(500).json({ error: msg });
  }
}
