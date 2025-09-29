// /api/ordertime/salesorders/get.js
//
// OrderTime tenant: /api/document/get is NOT available (404).
// Use /api/list with the "RecordTypeEnum" contract and FilterValue (singular).
// This route resolves by DocNo and returns a normalized sales order payload.

const RAW_BASE =
  process.env.OT_BASE_URL ||
  process.env.ORDERTIME_BASE_URL ||
  process.env.ORDERTIME_BASE ||
  'https://services.ordertime.com';

// normalize to .../api
const BASE_ROOT = String(RAW_BASE).replace(/\/+$/,'').replace(/\/api$/,'');
const BASE_API  = `${BASE_ROOT}/api`;

// auth headers your other endpoints use
const API_KEY = process.env.OT_API_KEY || process.env.ORDERTIME_API_KEY;
const EMAIL   = process.env.OT_EMAIL    || process.env.ORDERTIME_EMAIL;
const PASS    = process.env.OT_PASSWORD || process.env.ORDERTIME_PASSWORD;
const DEVKEY  = process.env.OT_DEV_KEY  || process.env.ORDERTIME_DEV_KEY;

function ensureEnv() {
  if (!API_KEY) throw new Error('Missing API key');
  if (!EMAIL)   throw new Error('Missing email');
  if (!PASS && !DEVKEY) throw new Error('Missing password/devkey');
}

function otHeaders() {
  const h = { 'Content-Type':'application/json', 'Accept':'application/json', 'ApiKey': API_KEY, 'Email': EMAIL };
  if (DEVKEY) h.DevKey = DEVKEY; else h.Password = PASS;
  return h;
}

async function otPost(path, body) {
  const url = `${BASE_API}${path.startsWith('/')?'':'/'}${path}`;
  const r = await fetch(url, { method:'POST', headers: otHeaders(), body: JSON.stringify(body||{}) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { url, status: r.status, ok: r.ok, json, text };
}

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

function normalizeSalesOrder(raw) {
  const get = (o,p,d='') => { try { return p.split('.').reduce((x,k)=>x?.[k], o) ?? d; } catch { return d; } };

  const billing = {
    company: get(raw,'CustomerRef.Name') || get(raw,'CustomerName') || '',
    contact: get(raw,'BillTo.ContactName'),
    phone:   get(raw,'BillTo.Phone'),
    email:   get(raw,'BillTo.Email'),
    street:  get(raw,'BillTo.Address1'),
    suite:   get(raw,'BillTo.Address2'),
    city:    get(raw,'BillTo.City'),
    state:   get(raw,'BillTo.State'),
    zip:     get(raw,'BillTo.Zip'),
  };

  const shipping = {
    company: get(raw,'ShipTo.Company') || billing.company || '',
    contact: get(raw,'ShipTo.ContactName'),
    phone:   get(raw,'ShipTo.Phone'),
    email:   get(raw,'ShipTo.Email'),
    street:  get(raw,'ShipTo.Address1'),
    suite:   get(raw,'ShipTo.Address2'),
    city:    get(raw,'ShipTo.City'),
    state:   get(raw,'ShipTo.State'),
    zip:     get(raw,'ShipTo.Zip'),
    residence: !!get(raw,'ShipTo.Residential', false),
  };

  const customer = {
    id:   get(raw,'CustomerRef.Id') || get(raw,'CustomerId'),
    name: get(raw,'CustomerRef.Name') || get(raw,'CustomerName'),
    po:   get(raw,'PONumber') || '',
    terms:get(raw,'Terms') || '',
  };

  const lines = (raw?.Lines || raw?.LineItems || []).map(L => {
    const g = (p,d='') => get(L,p,d);
    const qty = Number(g('Quantity',0));
    const up  = Number(g('UnitPrice',0));
    const ext = Number(g('Amount', qty*up));
    return {
      lineId: g('LineId') || g('Id') || g('LineNo'),
      itemId: g('ItemRef.Id') || g('ItemId') || g('Item.ID'),
      item:   g('ItemRef.Name') || g('ItemName') || '',
      sku:    g('ItemRef.Code') || g('ItemCode') || g('SKU') || '',
      description: g('Description') || '',
      qty, unitPrice: up, extPrice: ext,
      attributes: {
        carrier:     g('Custom.Carrier') || g('Carrier') || '',
        lteWifiBoth: g('Custom.LTE_WiFi_Both') || g('LTE_WiFi_Both') || '',
        condition:   g('Custom.New_CPO') || g('New_CPO') || '',
      }
    };
  });

  return {
    docNo:
      get(raw,'DocNo') || get(raw,'DocumentNo') || get(raw,'DocNumber') ||
      get(raw,'Number') || get(raw,'RefNo') || get(raw,'RefNumber') ||
      get(raw,'DocNoDisplay'),
    tranType: get(raw,'TranType') || '',
    customer, billing, shipping, lines,
  };
}

// Fields we’ll try to match DocNo against (string only)
const DOC_FIELDS = ['DocNo','DocumentNo','DocNumber','Number','RefNo','RefNumber','DocNoDisplay'];

// Several tenants use different numeric enums for SO header. We’ll try these, in order.
const RECORD_TYPE_ENUMS = [130, 135, 131, 140, 7];

async function listFindByDocNo(docNo, debug=false) {
  // Build string-only candidate values (SO- prefix & zero-pad variants included)
  const s = String(docNo || '').trim();
  const cands = new Set([s]);
  if (s && !/^SO[-\s]/i.test(s)) { cands.add(`SO-${s}`); cands.add(`SO ${s}`); }
  if (/^\d+$/.test(s)) {
    const n = s.length; for (const w of [6,7,8]) if (w>n) cands.add(s.padStart(w,w));
  }
  const candidates = [...cands].map(x => String(x));

  // Try RecordTypeEnum payload with FilterValue (singular, string). Equals (0) first, then Contains (12).
  const attempts = [];
  for (const RecordTypeEnum of RECORD_TYPE_ENUMS) {
    for (const op of [0,12]) {
      for (const v of candidates) {
        const Filters = DOC_FIELDS.map(p => ({
          PropertyName: p,
          Operator: op,              // 0 = equals, 12 = contains
          FilterValue: v             // singular value, STRING
        }));

        const body = {
          RecordTypeEnum,            // <-- critical for your tenant
          NumberOfRecords: 1,
          PageNumber: 1,
          SortOrder: { PropertyName: DOC_FIELDS[0], Direction: 1 },
          Filters
        };

        const resp = await otPost('/list', body);
        attempts.push({ url: resp.url, status: resp.status, sample: resp.text?.slice?.(0,160) });

        if (resp.ok && resp.json) {
          const rows = normalizeListResult(resp.json);
          if (rows?.length) {
            return { row: rows[0], attempts };
          }
        }
      }
    }
  }

  return { row: null, attempts };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { docNo, debug } = req.query;
    if (!docNo) return res.status(400).json({ error: 'Missing ?docNo=' });

    ensureEnv();

    const found = await listFindByDocNo(docNo, debug === '1');
    if (!found.row) {
      if (debug === '1') {
        return res.status(404).json({ error: `DocNo not found: ${docNo}`, attempts: found.attempts });
      }
      return res.status(404).json({ error: `DocNo not found: ${docNo}` });
    }

    // Some tenants return enough columns in /list that you can build the full order.
    // If not, the row will at least have Id / CustomerRef etc. We’ll return the row as-is under raw.
    const order = normalizeSalesOrder(found.row);
    return res.status(200).json({ ok: true, order, raw: found.row });

  } catch (e) {
    const msg = e?.stack ? `${e.message}\n${e.stack}` : String(e || 'Server error');
    return res.status(500).json({ error: msg });
  }
}
