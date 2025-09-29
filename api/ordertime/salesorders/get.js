// /api/ordertime/salesorders/get.js
//
// Resolve a Sales Order by DocNo and return a normalized payload:
// { docNo, tranType, customer, billing, shipping, lines[] }.
//
// Approach:
//  1) Resolve internal Id via POST /api/list (tolerant: multi-type, multi-field,
//     equals/contains, scalar/array, SO- prefix & zero-padding variants).
//  2) Fetch full document by Id via POST /api/document/get.
//  3) Normalize for your UI.
//
// Self-contained: no imports from _ot.js (avoids export shape mismatches).

/* ---------------------------- Env & base URL ---------------------------- */

const RAW_BASE =
  process.env.OT_BASE_URL ||
  process.env.ORDERTIME_BASE_URL ||
  process.env.ORDERTIME_BASE ||
  'https://services.ordertime.com'; // tolerate with/without /api

// normalize to exactly .../api (avoid .../api/api)
const BASE_ROOT = String(RAW_BASE).replace(/\/+$/,'').replace(/\/api$/,'');
const BASE_API  = `${BASE_ROOT}/api`;

const API_KEY =
  process.env.OT_API_KEY ||
  process.env.ORDERTIME_API_KEY;

const EMAIL =
  process.env.OT_EMAIL ||
  process.env.ORDERTIME_EMAIL;

const PASS =
  process.env.OT_PASSWORD ||
  process.env.ORDERTIME_PASSWORD;

const DEVKEY =
  process.env.OT_DEV_KEY ||
  process.env.ORDERTIME_DEV_KEY;

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
  if (DEVKEY) h.DevKey = DEVKEY;
  else h.Password = PASS;
  return h;
}

const OT_DEBUG = process.env.OT_DEBUG === '1';

/* ------------------------------- HTTP ---------------------------------- */

async function otPost(path, body) {
  const url = `${BASE_API}${path.startsWith('/') ? '' : '/'}${path}`;
  if (OT_DEBUG) console.log('OT POST →', url, JSON.stringify(body).slice(0, 500));
  const r = await fetch(url, {
    method: 'POST',
    headers: otHeaders(),
    body: JSON.stringify(body || {}),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (OT_DEBUG) console.log('OT ←', r.status, (text || '').slice(0, 500));
  return { ok: r.ok, status: r.status, text, json };
}

/* ------------------------- list result normalizer ----------------------- */

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

/* ------------------------- order normalizer ----------------------------- */

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

/* ------------------------- DocNo → Id resolver -------------------------- */

async function resolveIdByDocNo(docNo) {
  const TYPES = [130, 135, 131, 140, 7]; // broadened SO "header" types across tenants
  const F_DOC = ['DocNo','DocumentNo','DocNumber','Number','RefNo','RefNumber','DocNoDisplay'];
  const F_ID  = ['Id','ID','id'];

  const candidates = (() => {
    const raw = String(docNo || '').trim();
    const set = new Set([raw]);
    if (raw && !/^SO[-\s]/i.test(raw)) {
      set.add(`SO-${raw}`);
      set.add(`SO ${raw}`);
    }
    if (/^\d+$/.test(raw)) {
      const n = raw.length;
      for (const w of [6,7,8]) if (w > n) set.add(raw.padStart(w, w));
    }
    return [...set];
  })();

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

          const out = await otPost('/list', body);
          if (!out.ok) continue;

          const rows = normalizeListResult(out.json);
          if (rows && rows.length) {
            const row = rows[0];
            const id = F_ID.map(k => row?.[k]).find(Boolean);
            if (id) return { id, TYPE, row };
          }
        }
      }
    }
  }
  return null;
}

/* ----------------------------- Route ----------------------------------- */

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { docNo, debug } = req.query;
    if (!docNo) return res.status(400).json({ error: 'Missing ?docNo=' });

    ensureEnv();

    // 1) Resolve internal Id for DocNo
    const resolved = await resolveIdByDocNo(docNo);

    // Optional debug: broad "contains" probe to see what your tenant returns
    if (!resolved && debug === '1') {
      const F_DOC = ['DocNo','DocumentNo','DocNumber','Number','RefNo','RefNumber','DocNoDisplay'];
      const cands = [String(docNo), `SO-${docNo}`, `SO ${docNo}`];
      const Filters = F_DOC.flatMap(p => cands.map(v => ({ PropertyName: p, Operator: 12, FilterValueArray: [v] })));
      const probe = await otPost('/list', { Type: 130, NumberOfRecords: 5, PageNumber: 1, Filters });
      return res.status(probe.ok ? 200 : 500).json({
        debug: true,
        request: { Type: 130, Filters },
        response: probe.json || probe.text
      });
    }

    if (!resolved) return res.status(404).json({ error: `DocNo not found: ${docNo}` });
    const { id, TYPE } = resolved;

    // 2) Fetch by Id (canonical)
    const getRes = await otPost('/document/get', { Type: TYPE, Id: id });
    if (getRes.ok && getRes.json) {
      const raw = Array.isArray(getRes.json) ? getRes.json[0] : getRes.json;
      return res.status(200).json({ ok: true, order: normalizeSalesOrder(raw) });
    }

    // Surface upstream error for transparency
    return res.status(getRes.status || 502).json({
      error: `document/get failed ${getRes.status}: ${getRes.text?.slice?.(0, 300) || 'No body'}`
    });

  } catch (e) {
    const msg = e?.stack ? `${e.message}\n${e.stack}` : String(e || 'Server error');
    return res.status(500).json({ error: msg });
  }
}
