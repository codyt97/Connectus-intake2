// /api/ordertime/salesorders/get.js
// Strategy: (1) list by DocNo => get Id, (2) fetch by Id, (3) normalize.

const BASE = (process.env.OT_BASE_URL || 'https://services.ordertime.com/api').replace(/\/+$/, '');
const API_KEY = process.env.OT_API_KEY;
const EMAIL   = process.env.OT_EMAIL;
const PASS    = process.env.OT_PASSWORD;
const DEVKEY  = process.env.OT_DEV_KEY;

function assertEnv() {
  if (!API_KEY) throw new Error('Missing OT_API_KEY');
  if (!EMAIL)   throw new Error('Missing OT_EMAIL');
  if (!PASS && !DEVKEY) throw new Error('Provide OT_PASSWORD or OT_DEV_KEY');
}

function otHeaders() {
  const h = { 'Content-Type': 'application/json', ApiKey: API_KEY, Email: EMAIL };
  if (DEVKEY) h.DevKey = DEVKEY; else h.Password = PASS;
  return h;
}

async function post(path, body) {
  const url = `${BASE}${path.startsWith('/') ? '' : '/'}${path}`;
  const r = await fetch(url, { method: 'POST', headers: otHeaders(), body: JSON.stringify(body || {}) });
  const text = await r.text();
  return { ok: r.ok, status: r.status, text, json: safeJSON(text) };
}
function safeJSON(t){ try{ return JSON.parse(t); } catch { return null; } }

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

// ---- NORMALIZER (same shape your UI expects)
function normalizeSalesOrder(r) {
  const get = (o,p,d='') => { try { return p.split('.').reduce((x,k)=>x?.[k], o) ?? d; } catch { return d; } };
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
    docNo:    get(r,'DocNo') || get(r,'DocumentNumber'),
    tranType: get(r,'TranType') || '',
    customer, billing, shipping, lines,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { docNo } = req.query;
    if (!docNo) return res.status(400).json({ error: 'Missing ?docNo=' });
    assertEnv();

    // 1) Resolve Id via /list (exact DocNo)
    const TYPES = [130,135,131]; // SO headers
    const F_DOC = ['DocNo','DocumentNo','DocNumber'];
    const F_ID  = ['Id','ID','id'];

    let found = null;
    for (const TYPE of TYPES) {
      // Try scalar and array forms (some tenants require array)
      for (const v of [docNo, [docNo]]) {
        const body = {
          Type: TYPE,
          NumberOfRecords: 1,
          PageNumber: 1,
          Filters: F_DOC.map(p => ({ PropertyName: p, Operator: 0, FilterValueArray: v })) // 0 = equals
        };
        const out = await post('/list', body);
        if (!out.ok) continue;
        const rows = normalizeListResult(out.json);
        if (rows?.length) { found = { TYPE, row: rows[0] }; break; }
      }
      if (found) break;
    }
    if (!found) return res.status(404).json({ error: `DocNo not found: ${docNo}` });

    const id = F_ID.map(k => found.row?.[k]).find(Boolean);
    if (!id) return res.status(404).json({ error: `No Id for DocNo ${docNo}` });

    // 2) Fetch by Id. Prefer generic /document/get; fallback to REST-ish /salesorder(s)/get?id=
    // 2a) /document/get
    const docGet = await post('/document/get', { Type: found.TYPE, Id: id });
    if (docGet.ok && docGet.json) {
      const raw = Array.isArray(docGet.json) ? docGet.json[0] : docGet.json;
      return res.status(200).json({ ok:true, order: normalizeSalesOrder(raw) });
    }

    // 2b) fallback GET by Id (singular/plural)
    for (const p of [`${BASE}/salesorder/get?id=${encodeURIComponent(id)}`,
                     `${BASE}/salesorders/get?id=${encodeURIComponent(id)}`]) {
      const r = await fetch(p, { headers: otHeaders() });
      const t = await r.text();
      if (r.ok) {
        const raw = JSON.parse(t);
        const data = Array.isArray(raw) ? raw[0] : raw;
        return res.status(200).json({ ok:true, order: normalizeSalesOrder(data) });
      }
    }

    return res.status(404).json({ error: `Could not fetch Sales Order Id ${id} for DocNo ${docNo}` });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
