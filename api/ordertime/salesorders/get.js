// /api/ordertime/salesorders/get.js
//
// FINAL: Call OrderTime /salesorder?docNo=<Int32> (GET) and normalize the result.
// No /list, no /document/get, no RecordTypeEnum/ObjectType guessing.
//
// Docs:
// - /salesorder supports GET with ?docNo=<Int32> to fetch a specific order. (Order Time REST API > Sales Order) 
// - All endpoints live under https://services.ordertime.com/api and require apiKey/email/password (or DevKey). 
//
// Returns: { ok: true, order: { docNo, tranType, customer, billing, shipping, lines[] }, raw }

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
  if (!API_KEY) throw new Error('Missing API key (OT_API_KEY or ORDERTIME_API_KEY)');
  if (!EMAIL)   throw new Error('Missing email (OT_EMAIL or ORDERTIME_EMAIL)');
  if (!PASS && !DEVKEY) throw new Error('Missing password/devkey (OT_PASSWORD/ORDERTIME_PASSWORD or OT_DEV_KEY/ORDERTIME_DEV_KEY)');
}

function otHeaders() {
  const h = { 'Accept': 'application/json', 'apiKey': API_KEY, 'email': EMAIL };
  // Order Time allows either Password or DevKey
  if (DEVKEY) h.DevKey = DEVKEY;
  else h.password = PASS;
  return h;
}

async function otGet(pathWithQuery) {
  const url = `${BASE_API}${pathWithQuery.startsWith('/') ? '' : '/'}${pathWithQuery}`;
  const r = await fetch(url, { method: 'GET', headers: otHeaders() });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { url, ok: r.ok, status: r.status, text, json };
}

function normalizeSalesOrder(raw) {
  const get = (o,p,d='') => { try { return p.split('.').reduce((x,k)=>x?.[k], o) ?? d; } catch { return d; } };

  const billing = {
    company: get(raw,'CustomerRef.Name') || get(raw,'CustomerName') || '',
    contact: get(raw,'BillAddress.Contact'),
    phone:   get(raw,'BillAddress.Phone'),
    email:   get(raw,'BillAddress.Email'),
    street:  get(raw,'BillAddress.Addr1'),
    suite:   get(raw,'BillAddress.Addr2'),
    city:    get(raw,'BillAddress.City'),
    state:   get(raw,'BillAddress.State'),
    zip:     get(raw,'BillAddress.Zip'),
  };

    const shipping = {
    company: get(raw,'CustomerRef.Name') || billing.company || '',
    contact: get(raw,'ShipAddress.Contact'),
    phone:   get(raw,'ShipAddress.Phone'),
    email:   get(raw,'ShipAddress.Email'),
    street:  get(raw,'ShipAddress.Addr1'),
    suite:   get(raw,'ShipAddress.Addr2'),
    city:    get(raw,'ShipAddress.City'),
    state:   get(raw,'ShipAddress.State'),
    zip:     get(raw,'ShipAddress.Zip'),

    // NEW: shipping options pulled from OT (with extra fallbacks)
    // Adjust these once you see the exact field names in the debug payload.
    method:
      get(raw,'ShipMethodRef.Name') ||
      get(raw,'ShipViaRef.Name')    ||   // common alternate
      get(raw,'ShipVia')            ||
      get(raw,'ShipMethod')         ||
      '',

    payMethod:
      get(raw,'ShipPaymentMethod')  ||
      get(raw,'ShipPmtMethod')      ||   // if your tenant uses a shorter name
      '',

    freightType:
      get(raw,'FreightType')        ||
      get(raw,'ShipFreightType')    ||   // alternate guess
      '',

    upsAccount:
      get(raw,'UPSAccountNo')       ||
      get(raw,'UPSAcctNo')          ||
      '',

    fedexAccount:
      get(raw,'FedExAccountNo')     ||
      get(raw,'FedexAccountNo')     ||
      '',
  };


  const customer = {
    id:   get(raw,'CustomerRef.Id') || get(raw,'CustomerId'),
    name: get(raw,'CustomerRef.Name') || get(raw,'CustomerName'),
    po:   get(raw,'CustomerPO') || '',
    terms:get(raw,'TermRef.Name') || get(raw,'Terms') || '',
  };

  const lines = (raw?.LineItems || raw?.Lines || []).map(L => {
    const g = (p,d='') => get(L,p,d);
    const qty = Number(g('Quantity', 0));
    const price = Number(g('Price', 0)) || Number(g('UnitPrice',0));
    const ext   = Number(g('Amount', qty * price));
    return {
      lineId: g('Id') || g('LineId') || g('LineNo'),
      itemId: g('ItemRef.Id') || g('ItemId'),
      item:   g('ItemRef.Name') || g('ItemName') || '',
      sku:    g('ItemRef.Code') || g('ItemCode') || g('SKU') || '',
      description: g('Description') || '',
      qty: qty,
      unitPrice: price,
      extPrice: ext,
      attributes: {} // keep space for any custom fields you map later
    };
  });

  return {
    docNo:   get(raw,'DocNo') || get(raw,'DocumentNo') || get(raw,'DocNumber') || get(raw,'Number'),
    tranType: 'SalesOrder',
    customer, billing, shipping, lines,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { docNo, debug } = req.query;
    if (!docNo) return res.status(400).json({ error: 'Missing ?docNo=' });

    ensureEnv();

    // DocNo must be an Int32 per docs. Coerce and validate.
    const n = Number(docNo);
    if (!Number.isInteger(n) || n < 0) {
      return res.status(400).json({ error: `Invalid docNo '${docNo}'. Expected positive integer.` });
    }

    // Single, canonical call per docs:
    const resp = await otGet(`/salesorder?docNo=${encodeURIComponent(n)}`);

    if (!resp.ok) {
      // If OT returns 404, bubble that up clearly so the UI can show "not found".
      const body = resp.text?.slice?.(0, 300) || '';
      const error = `/salesorder GET ${resp.status}: ${body}`;
      if (debug === '1') return res.status(resp.status).json({ error, urlTried: resp.url });
      return res.status(resp.status).json({ error });
    }

    // Some tenants return a single object; others wrap it — handle both
    const raw = Array.isArray(resp.json) ? resp.json[0] : resp.json;
    if (!raw) {
      if (debug === '1') return res.status(404).json({ error: 'Empty response from OrderTime', urlTried: resp.url });
      return res.status(404).json({ error: 'Sales order not found' });
    }

    const order = normalizeSalesOrder(raw);
    // If the API returned but still no docNo, treat as not found
    if (!order.docNo) {
      if (debug === '1') return res.status(404).json({ error: 'Order returned without DocNo', raw, urlTried: resp.url });
      return res.status(404).json({ error: 'Sales order not found' });
    }

    return res.status(200).json({ ok: true, order, raw });

  } catch (e) {
    const msg = e?.stack ? `${e.message}\n${e.stack}` : String(e || 'Server error');
    return res.status(500).json({ error: msg });
  }
}
