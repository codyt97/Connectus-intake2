// /api/ordertime/salesorders/get.js
//
// Get a Sales Order by *DocNo* (human-facing number).
// Strategy:
//   1) Resolve internal Id via POST /list using tolerant filters
//      (multi-type, multi-field, equals/contains, scalar/array, with SO- prefix & zero-padding variants).
//   2) Fetch the full document by Id via POST /document/get (canonical), with REST-ish fallbacks.
//   3) Normalize to the shape your UI expects: { docNo, tranType, customer, billing, shipping, lines[] }.
//
// Paste this file at: /api/ordertime/salesorders/get.js

/***********************
 * Env & URL handling  *
 ***********************/
const RAW_BASE =
  process.env.OT_BASE_URL ||
  process.env.ORDERTIME_BASE_URL ||
  process.env.ORDERTIME_BASE ||
  'https://services.ordertime.com'; // no /api suffix here

const BASE_API = String(RAW_BASE).replace(/\/+$/,'') + '/api';

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

function assertEnv() {
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

async function post(path, body) {
  const url = `${BASE_API}${path.startsWith('/') ? '' : '/'}${path}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: otHeaders(),
    body: JSON.stringify(body || {}),
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, text, json: safeJSON(text) };
}

function safeJSON(t){ try { return JSON.parse(t); } catch { return null; } }

/****************************
 * Helpers & Normalization  *
 ****************************/
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
    const getL = (p,d='') => get(L,p,d);
    const qty  = Number(getL('Quantity', 0));
    const up   = Number(getL('UnitPrice', 0));
    const ext  = Number(getL('Amount', qty * up));
    return {
      lineId:      getL('LineId') || getL('Id') || getL('LineNo'),
      itemId:      getL('ItemRef.Id') || getL('ItemId') || getL('Item.ID'),
      item:        getL('ItemRef.Name') || getL('ItemName') || '',
      sku:         getL('ItemRef.Code') || getL('ItemCode') || getL('SKU') || '',
      description: getL('Description') || '',
      qty,
      unitPrice:   up,
      extPrice:    ext,
      attributes: {
        carrier:     getL('Custom.Carrier') || getL('Carrier') || '',
        lteWifiBoth: getL('Custom.LTE_WiFi_Both') || getL('LTE_WiFi_Both') || '',
        condition:   getL('Custom.New_CPO') || getL('New_CPO') || '',
      }
    };
  });

  return {
    docNo:    get(r,'DocNo') || get(r,'DocumentNo') || get(r,'DocNumber') || get(r,'Number') || get(r,'RefNo') || get(r,'RefNumber') || get(r,'DocNoDisplay'),
    tranType: get(r,'TranType') || '',
    customer,
    billing,
    shipping,
    lines,
  };
}

/*****************************************
 * DocNo → Id resolution (tolerant list) *
 *****************************************/
async function resolveIdByDocNo(docNo) {
  const TYPES = [130, 135, 131, 140, 7]; // common SO header types
  const F_DOC = ['DocNo','DocumentNo','DocNumber','Number','RefNo','RefNumber','DocNoDisplay'];
  const F_ID  = ['Id','ID','id'];

  // Build candidate values: raw, SO- prefixed, space prefixed, and zero-padded
  const candidates = (() => {
    const raw = String(docNo || '').trim();
    const set = new Set([raw]);
    if (raw && !/^SO[-\s]/i.test(raw)) {
      set.add(`SO-${raw}`);
      set.add(`SO ${raw}`);
    }
    if (/^\d+$/.test(raw)) {
      const n = raw.length;
      for (const w of [6,7,8]) if (w > n) set.add(raw.padStart(w, '0'));
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

          const out = await post('/list', body);
          if (!out.ok) continue;
          const rows = normalizeListResult(out.json);
          if (rows && rows.length) {
            // return the first Id we can find across common Id keys, plus the TYPE for /document/get
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

/****************
 * Route Handler
 ****************/
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { docNo, debug } = req.query;
    if (!docNo) return res.status(400).json({ error: 'Missing ?docNo=' });

    assertEnv();

    // 1) Resolve the internal Id by DocNo
    const found = await resolveIdByDocNo(docNo);

    // Optional debug probe to see what your tenant returns
    if (!found && debug === '1') {
      // Broad "contains" probe to help identify the correct field naming in your tenant
      const F_DOC = ['DocNo','DocumentNo','DocNumber','Number','RefNo','RefNumber','DocNoDisplay'];
      const candidates = [String(docNo), `SO-${docNo}`, `SO ${docNo}`];
      const Filters = F_DOC.flatMap(p => candidates.map(v => ({ PropertyName: p, Operator: 12, FilterValueArray: [v] })));
      const probe = await post('/list', { Type: 130, NumberOfRecords: 5, PageNumber: 1, Filters });
      return res.status(probe.ok ? 200 : 500).json({ debug: true, request: { Type:130, Filters }, response: probe.json || probe.text });
    }

    if (!found) return res.status(404).json({ error: `DocNo not found: ${docNo}` });

    const { id, TYPE } = found;

    // 2) Fetch by Id (canonical)
    const docGet = await post('/document/get', { Type: TYPE, Id: id });
    if (docGet.ok && docGet.json) {
      const raw = Array.isArray(docGet.json) ? docGet.json[0] : docGet.json;
      return res.status(200).json({ ok: true, order: normalizeSalesOrder(raw) });
    }

    // 3) Fallbacks: REST-ish GET by id (singular + plural)
    for (const url of [
      `${BASE_API}/salesorder/get?id=${encodeURIComponent(id)}`,
      `${BASE_API}/salesorders/get?id=${encodeURIComponent(id)}`
    ]) {
      const r = await fetch(url, { headers: otHeaders() });
      const t = await r.text();
      if (r.ok) {
        const raw = safeJSON(t);
        const data = Array.isArray(raw) ? raw[0] : raw;
        return res.status(200).json({ ok: true, order: normalizeSalesOrder(data) });
      }
    }

    return res.status(404).json({ error: `Could not fetch Sales Order Id ${id} for DocNo ${docNo}` });

  } catch (e) {
    const msg = (e && e.stack) ? `${e.message}\n${e.stack}` : String(e || 'Server error');
    return res.status(500).json({ error: msg });
  }
}
