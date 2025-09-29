// /api/_ot.js
const BASE    = process.env.OT_BASE_URL || 'https://services.ordertime.com/api';
const API_KEY = process.env.OT_API_KEY;
const EMAIL   = process.env.OT_EMAIL;
const PASS    = process.env.OT_PASSWORD;
const DEVKEY  = process.env.OT_DEV_KEY;
const DEBUG   = String(process.env.OT_DEBUG || '').toLowerCase() === '1' || String(process.env.OT_DEBUG || '').toLowerCase() === 'true';

function assertEnv() {
  if (!BASE)    throw new Error('Missing OT_BASE_URL');
  if (!API_KEY) throw new Error('Missing OT_API_KEY');
  if (!EMAIL)   throw new Error('Missing OT_EMAIL');
  if (!PASS && !DEVKEY) throw new Error('Provide OT_PASSWORD or OT_DEV_KEY');
}

function authHeaders() {
  const h = { ApiKey: API_KEY, Email: EMAIL };
  if (DEVKEY) h.DevKey = DEVKEY; else h.Password = PASS;
  return h;
}


async function tryPost(path, body) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  if (DEBUG) console.log(`[OT] POST ${path} -> ${res.status} ${text.slice(0, 220)}`);
  return { ok: res.ok, status: res.status, text, json: safeJSON(text) };
}

function safeJSON(t) { try { return JSON.parse(t); } catch { return null; } }

// Replace the whole function with this:
export function normalizeListResult(raw) {
  if (!data) return [];

  // Common direct array
  if (Array.isArray(data)) return data;

  // Common container keys (handle many tenants)
  const keys = [
    'Items', 'items',
    'List', 'list',
    'Results', 'results',
    'Rows', 'rows'
  ];
  for (const k of keys) {
    if (Array.isArray(data[k])) return data[k];
  }

  // Sometimes wrapped as { Data: { Items: [...] } } or { data: { List: [...] } }
  const containers = ['Data', 'data', 'Result', 'result', 'Payload', 'payload'];
  for (const c of containers) {
    const v = data[c];
    if (v && typeof v === 'object') {
      for (const k of keys) {
        if (Array.isArray(v[k])) return v[k];
      }
      if (Array.isArray(v)) return v;
    }
  }

  return [];
}


/* ---------- Public helpers ---------- */

// Multi-strategy list search for Customers
export async function listCustomersByName(q, page = 1, pageSize = 25) {
  assertEnv();

  const paths   = ['/list', '/List']; // some tenants care about casing
  const fields  = ['Name', 'CompanyName']; // common name fields
  const payloads = [];

  // Build multiple payload variants (string vs array; Name vs CompanyName)
  for (const field of fields) {
    // Variant A: FilterValueArray as string
    payloads.push({
      Type: 120, // Customer
      Filters: [{ PropertyName: field, Operator: 12, FilterValueArray: q || '' }], // 12 = contains
      PageNumber: Number(page) || 1,
      NumberOfRecords: Math.min(Math.max(Number(pageSize) || 25, 1), 100)
    });
    // Variant B: FilterValueArray as array
    payloads.push({
      Type: 120,
      Filters: [{ PropertyName: field, Operator: 12, FilterValueArray: [q || ''] }],
      PageNumber: Number(page) || 1,
      NumberOfRecords: Math.min(Math.max(Number(pageSize) || 25, 1), 100)
    });
  }

  let lastErr = null;
  for (const p of paths) {
    for (const body of payloads) {
      try {
        const out = await tryPost(p, body);
        if (out.ok) {
          const items = normalizeListResult(out.json);
          if (items.length || q === '') return items; // accept empty only if blank search
          // If 200 but 0 items, keep trying other combos
        } else {
          lastErr = new Error(`${p} ${out.status}: ${out.text.slice(0,200)}`);
        }
      } catch (e) {
        lastErr = e;
      }
    }
  }
  if (lastErr) throw lastErr;
  return []; // fallback
}

/* ---------- Sales Orders helper (multi-strategy) ---------- */
export async function searchSalesOrders({ q }, page = 1, take = 25) {
  const OT_BASE =
    process.env.OT_BASE_URL ||
    process.env.ORDERTIME_BASE_URL ||
    process.env.ORDERTIME_BASE ||
    "https://services.ordertime.com";

  const APIKEY =
    process.env.OT_API_KEY ||
    process.env.ORDERTIME_API_KEY;

  if (!APIKEY) throw new Error("Missing OT_API_KEY / ORDERTIME_API_KEY");

  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "apikey": APIKEY,
    "x-apikey": APIKEY,
  };

  const post = async (url, body) => {
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!r.ok) {
      // Helpful debug
      const txt = await r.text().catch(() => "");
      if (process.env.OT_DEBUG) console.error("OT list failed", r.status, url, txt?.slice(0, 500));
      return []; // don’t throw; caller will try fallback or return []
    }
    const raw = await r.json();
    return normalizeListResult(raw);
  };

  const qRaw = (q || "").toString().trim();
  if (!qRaw) return [];

  // 1) Looks like DocNo? Try DocNo Contains first.
  const looksLikeDocNo = /^[0-9]+$/.test(qRaw) || /^SO[-\s]?\d+/i.test(qRaw);

  // Correct endpoint (singular “salesorder”)
  const URL = `${OT_BASE}/api/salesorder/list`;

  // A. DocNo contains
  if (looksLikeDocNo) {
    const list = await post(URL, {
      pageNumber: page,
      pageSize: take,
      filters: [{ field: "DocNo", operator: "Contains", value: qRaw }]
    });
    if (list.length) {
      return list.map(x => ({
        id: x.Id || x.id || x.DocNo || x.docNo,
        docNo: x.DocNo || x.docNo || "",
        customer: x.CustomerName || x.Customer || "",
        date: x.TxDate || x.Date || "",
        status: x.Status || x.DocStatus || "",
      }));
    }
  }

  // B. Fallback by CustomerName contains
  const listByCustomer = await post(URL, {
    pageNumber: page,
    pageSize: take,
    filters: [{ field: "CustomerName", operator: "Contains", value: qRaw }]
  });

  return listByCustomer.map(x => ({
    id: x.Id || x.id || x.DocNo || x.docNo,
    docNo: x.DocNo || x.docNo || "",
    customer: x.CustomerName || x.Customer || "",
    date: x.TxDate || x.Date || "",
    status: x.Status || x.DocStatus || "",
  }));
}



export async function searchPartItems(q, take = 50) {
  assertEnv();
  const body = {
    Type: 115, // Items
    NumberOfRecords: Number(take) || 50,
    PageNumber: 1,
    SortOrder: { PropertyName: 'Name', Direction: 1 }, // Asc
    Filters: [
      { PropertyName: 'Name',               Operator: 12, FilterValueArray: q },
      { PropertyName: 'Description',        Operator: 12, FilterValueArray: q },
      { PropertyName: 'ManufacturerPartNo', Operator: 12, FilterValueArray: q },
      { PropertyName: 'UPC',                Operator: 12, FilterValueArray: q },
    ],
  };

  const out = await tryPost('/list', body);
  if (!out.ok) throw new Error(`/list ${out.status}: ${out.text.slice(0,180)}`);

  const rows = normalizeListResult(out.json);
  return rows.map(r => ({
    id:   r.Id ?? r.ID ?? r.id,
    name: r.Name ?? '',
    description: r.Description ?? '',
    mfgPartNo:   r.ManufacturerPartNo ?? '',
    upc:         r.UPC ?? '',
    uom:         r.UomRef?.Name ?? r.UOM ?? r.uom ?? '',
    price:       r.Price ?? r.price ?? null,
  }));
}


export async function getCustomerById(id) {
  assertEnv();
  const res = await fetch(`${BASE}/customer?id=${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: authHeaders(),
  });
  const txt = await res.text();
  if (DEBUG) console.log(`[OT] GET /customer?id=${id} -> ${res.status} ${txt.slice(0,220)}`);
  if (!res.ok) throw new Error(`/customer ${res.status}: ${txt.slice(0,300)}`);
  const x = safeJSON(txt) || {};

  // Normalize to the structure your UI expects (per OT Customer docs)
return {
  company:
    x.CompanyName || x.Name || '',

  // OT: Primary contact is nested; build a readable string
  billing: {
    contact: [
      x.PrimaryContact?.Salutation,
      x.PrimaryContact?.FirstName,
      x.PrimaryContact?.MiddleName,
      x.PrimaryContact?.LastName
    ].filter(Boolean).join(' ').trim(),
    phone:   x.PrimaryContact?.Phone || '',       // if your tenant exposes it
    email:   x.BillAddress?.Email || '',          // OT puts email on the address block
    street:  x.BillAddress?.Addr1 || '',
    suite:   x.BillAddress?.Addr2 || x.BillAddress?.Addr3 || '',
    city:    x.BillAddress?.City || '',
    state:   x.BillAddress?.State || '',
    zip:     x.BillAddress?.Zip || ''
  },

  shipping: {
    company: x.CompanyName || x.Name || '',       // same company unless you track per-ship-to
    contact: '',                                   // fill if your tenant has ship-to contact fields
    phone:   '',                                   // fill if present
    email:   x.PrimaryShipAddress?.Email || '',
    street:  x.PrimaryShipAddress?.Addr1 || '',
    suite:   x.PrimaryShipAddress?.Addr2 || x.PrimaryShipAddress?.Addr3 || '',
    city:    x.PrimaryShipAddress?.City || '',
    state:   x.PrimaryShipAddress?.State || '',
    zip:     x.PrimaryShipAddress?.Zip || '',
    residence: false                               // set if your tenant flags residential on ship-to
  },

  payment: {
    method:  x.PaymentMethodRef?.Name || '',
    terms:   x.TermRef?.Name || '',
    taxExempt: !!(x.SalesTaxCodeRef?.Name && x.SalesTaxCodeRef.Name.toLowerCase().includes('non')),
    agreement: false
  },

  shippingOptions: {
    pay:   x.ShipMethodRef?.Name || '',
    speed: '',
    shortShip: ''
  },

  rep: {
    primary:   x.SalesRepRef?.Name || '',
    secondary: ''
  },

  carrierRep: {
    name:  '',
    email: ''
  }
};



}
