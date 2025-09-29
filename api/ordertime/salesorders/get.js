// /api/ordertime/salesorders/get.js
const OT_BASE = process.env.ORDERTIME_BASE_URL || process.env.ORDERTIME_BASE || process.env.ORDERTIME_BASE_URL_FALLBACK || "https://services.ordertime.com";
const OT_KEY  = process.env.ORDERTIME_API_KEY;

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
  // Defensive getters (OT objects vary by tenant/version)
  const get = (obj, path, d='') => {
    try {
      return path.split('.').reduce((o,k)=>o?.[k], obj) ?? d;
    } catch { return d; }
  };

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

    // The actual OT endpoint may differ (DocNo vs docNo). Keep this fetch simple and let server map it.
    const url = `${OT_BASE}/api/salesorder/get?docNo=${encodeURIComponent(docNo)}`;
    const r = await fetch(url, { headers: otHeaders() });
    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ error: `OT get failed ${r.status}: ${text}` });
    }

    const raw = await r.json();
    const data = Array.isArray(raw) ? raw[0] : raw;
    return res.status(200).json({ ok: true, order: normalizeSalesOrder(data) });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
