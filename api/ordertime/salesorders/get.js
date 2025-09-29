// /api/ordertime/salesorders/get.js
const RAW_BASE =
  process.env.OT_BASE_URL ||
  process.env.ORDERTIME_BASE_URL ||
  process.env.ORDERTIME_BASE ||
  process.env.ORDERTIME_BASE_URL_FALLBACK ||
  'https://services.ordertime.com';

const OT_KEY =
  process.env.OT_API_KEY ||
  process.env.ORDERTIME_API_KEY;

function cleanBase(u) {
  // strip trailing slashes and a trailing /api if present
  return String(u || '')
    .replace(/\/+$/,'')
    .replace(/\/api\/?$/,'');
}

const OT_BASE = cleanBase(RAW_BASE);

function otHeaders() {
  if (!OT_KEY) throw new Error("Missing ORDERTIME_API_KEY");
  return {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "apikey": OT_KEY,
    "x-apikey": OT_KEY,
  };
}

// Normalize raw OT response into a shape the UI can drop into fields
function normalizeSalesOrder(r) {
  const get = (obj, path, d='') => { try { return path.split('.').reduce((o,k)=>o?.[k], obj) ?? d; } catch { return d; } };

  const billing = {
    company: get(r, 'CustomerRef.Name') || get(r, 'CustomerName') || '',
    contact: get(r, 'BillTo.ContactName'),
    phone:   get(r, 'BillTo.Phone'),
    email:   get(r, 'BillTo.Email'),
    street:  get(r, 'BillTo.Address1'),
    suite:   get(r, 'BillTo.Address2'),
    city:    get(r, 'BillTo.City'),
    state:   get(r, 'BillTo.State'),
    zip:     get(r, 'BillTo.Zip'),
  };

  const shipping = {
    company: get(r, 'ShipTo.Company') || billing.company || '',
    contact: get(r, 'ShipTo.ContactName'),
    phone:   get(r, 'ShipTo.Phone'),
    email:   get(r, 'ShipTo.Email'),
    street:  get(r, 'ShipTo.Address1'),
    suite:   get(r, 'ShipTo.Address2'),
    city:    get(r, 'ShipTo.City'),
    state:   get(r, 'ShipTo.State'),
    zip:     get(r, 'ShipTo.Zip'),
    residence: !!get(r, 'ShipTo.Residential', false),
  };

  const customer = {
    id:      get(r, 'CustomerRef.Id') || get(r, 'CustomerId'),
    name:    get(r, 'CustomerRef.Name') || get(r, 'CustomerName'),
    po:      get(r, 'PONumber') || '',
    terms:   get(r, 'Terms') || '',
  };

  const lines = (r?.Lines || r?.LineItems || []).map((L) => {
    const qty  = Number(get(L, 'Quantity', 0));
    const up   = Number(get(L, 'UnitPrice', 0));
    const ext  = Number(get(L, 'Amount', qty * up));
    return {
      lineId:      get(L, 'LineId') || get(L, 'Id') || get(L, 'LineNo'),
      itemId:      get(L, 'ItemRef.Id') || get(L, 'ItemId') || get(L, 'Item.ID'),
      item:        get(L, 'ItemRef.Name') || get(L, 'ItemName') || '',
      sku:         get(L, 'ItemRef.Code') || get(L, 'ItemCode') || get(L, 'SKU') || '',
      description: get(L, 'Description') || '',
      qty,
      unitPrice:   up,
      extPrice:    ext,
      attributes: {
        carrier:     get(L, 'Custom.Carrier') || get(L, 'Carrier') || '',
        lteWifiBoth: get(L, 'Custom.LTE_WiFi_Both') || get(L, 'LTE_WiFi_Both') || '',
        condition:   get(L, 'Custom.New_CPO') || get(L, 'New_CPO') || '',
      }
    };
  });

  return {
    docNo:    get(r, 'DocNo') || get(r, 'DocumentNumber'),
    tranType: get(r, 'TranType') || '',
    customer,
    billing,
    shipping,
    lines,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { docNo } = req.query;
    if (!docNo) return res.status(400).json({ error: 'Missing ?docNo=' });

    // Try singular then plural paths (tenants vary)
    const paths = [
      `${OT_BASE}/api/salesorder/get?docNo=${encodeURIComponent(docNo)}`,
      `${OT_BASE}/api/salesorders/get?docNo=${encodeURIComponent(docNo)}`
    ];

    let lastErr = null;
    for (const url of paths) {
      const r = await fetch(url, { headers: otHeaders() });
      const text = await r.text();
      if (r.ok) {
        const raw = JSON.parse(text);
        const data = Array.isArray(raw) ? raw[0] : raw;
        return res.status(200).json({ ok: true, order: normalizeSalesOrder(data) });
      }
      lastErr = new Error(`OT get failed ${r.status}: ${text}`);
      // try next path on 404/400
      if (r.status === 404 || r.status === 400) continue;
      break; // other errors, bail
    }

    return res.status(404).json({ error: String(lastErr?.message || lastErr || 'Not found') });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
