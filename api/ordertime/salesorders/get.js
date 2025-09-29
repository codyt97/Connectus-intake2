// /api/ordertime/salesorders/get.js
//
// Your tenant rejects numeric Type and expects ObjectType strings.
// We probe common Sales Order object names and query /api/list using:
//   { ObjectType: "<name>", Filters: [{ PropertyName, Operator, FilterValue }] }
//
// We DO NOT call /api/document/get (it's 404 on your tenant).
// On success we normalize the row to your UI shape and return it.

const RAW_BASE =
  process.env.OT_BASE_URL ||
  process.env.ORDERTIME_BASE_URL ||
  process.env.ORDERTIME_BASE ||
  'https://services.ordertime.com';

const BASE_ROOT = String(RAW_BASE).replace(/\/+$/,'').replace(/\/api$/,'');
const BASE_API  = `${BASE_ROOT}/api`;

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
  const h = { 'Content-Type':'application/json', 'Accept':'application/json', 'ApiKey':API_KEY, 'Email':EMAIL };
  if (DEVKEY) h.DevKey = DEVKEY; else h.Password = PASS;
  return h;
}

function pickObjectTypes(force) {
  if (!force) return SO_OBJECT_TYPES;
  // Put the forced one first, still try the rest after
  const set = new Set([force, ...SO_OBJECT_TYPES]);
  return [...set];
}

async function otPost(path, body) {
  const url = `${BASE_API}${path.startsWith('/') ? '' : '/'}${path}`;
  const r = await fetch(url, { method:'POST', headers: otHeaders(), body: JSON.stringify(body||{}) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { url, ok:r.ok, status:r.status, text, json };
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

// Candidate object names for Sales Order header on different tenants
// Try a broad set of Sales Order header object names used across OT tenants
const SO_OBJECT_TYPES = [
  'SalesOrderHeader',
  'SalesOrder',
  'Sales Order',
  'SalesOrders',
  'Sales Order Header',
  'Sales_Order_Header',
  'Sales Order Headers',
  'SalesOrderHeaders',
  'OrderHeader',
  'Order Header',
  'SOHeader',
  'SO Header',
  'SOHeaders',
  'Sales Document Header',
  'SalesDocumentHeader',
  'Sales Documents',
  'SalesDocument',
  'Sales_Document_Header'
];


const DOC_FIELDS = [
  'DocNo','DocumentNo','DocNumber','Number','RefNo','RefNumber','DocNoDisplay',
  'OrderNo','SalesOrderNo','OrderNumber','SalesOrderNumber','DocumentNumber','DocNum','Doc_No'
];
;

function buildCandidates(input) {
  const s = String(input || '').trim();
  const set = new Set([s]);
  if (s && !/^SO[-\s]/i.test(s)) { set.add(`SO-${s}`); set.add(`SO ${s}`); }
  if (/^\d+$/.test(s)) {
    const n = s.length; for (const w of [6,7,8]) if (w>n) set.add(s.padStart(w,w));
  }
  return [...set].map(String);
}

async function listByObjectType(objectType, docNo) {
  const candidates = buildCandidates(docNo);
  // equals (0) first, then contains (12)
  for (const op of [0,12]) {
    for (const v of candidates) {
      const Filters = DOC_FIELDS.map(p => ({
        PropertyName: p,
        Operator: op,
        FilterValue: v   // singular, STRING
      }));
      const body = {
        ObjectType: objectType,
        NumberOfRecords: 1,
        PageNumber: 1,
        SortOrder: { PropertyName: DOC_FIELDS[0], Direction: 1 },
        Filters
      };
      const r = await otPost('/list', body);
      if (!r.ok) continue;
      const rows = normalizeListResult(r.json);
      if (rows?.length) return { row: rows[0], attempt: { objectType, op, value: v } };
    }
  }
  return { row: null, attempt: null };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { docNo, debug } = req.query;
    if (!docNo) return res.status(400).json({ error: 'Missing ?docNo=' });

    ensureEnv();

    // Probe object types in order until one returns a row
    // Optional: allow ?objectType=SalesOrderHeader to force a specific name
const { objectType: force } = req.query;
const orderTypes = pickObjectTypes(force);

const attempts = [];
for (const objectType of orderTypes) {
  const out = await listByObjectType(objectType, docNo);
  attempts.push({ objectType, hit: !!out.row });
  if (out.row) {
    const order = normalizeSalesOrder(out.row);
    return res.status(200).json({ ok: true, order, objectTypeUsed: objectType });
  }
}


    if (debug === '1') {
      return res.status(404).json({ error: `DocNo not found: ${docNo}`, attempts });
    }
    return res.status(404).json({ error: `DocNo not found: ${docNo}` });

  } catch (e) {
    const msg = e?.stack ? `${e.message}\n${e.stack}` : String(e || 'Server error');
    return res.status(500).json({ error: msg });
  }
}
