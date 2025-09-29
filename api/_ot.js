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
export function normalizeListResult(data) {
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

/* ---------- Sales Orders helper (multi-strategy, tolerant) ---------- */
export async function searchSalesOrders(criteria = {}, page = 1, pageSize = 50) {
  assertEnv();

  const {
    q = '',
    docNo = '',
    customer = '',
    status = '',
    dateFrom = '',
    dateTo = '',
  } = criteria;

  // Try several list endpoints (tenants vary)
  const PATHS = ['/list', '/document/list', '/salesorder/list'];

  // Most common SO header types seen across tenants
  const TYPES = [130, 135, 131, 140, 7]; // keep yours and add a couple more

  // Field variants across tenants
  const F = {
    DocNo:        ['DocNo', 'DocumentNo', 'DocNumber'],
    CustomerName: ['CustomerName', 'Customer', 'CustName'],
    Status:       ['Status', 'DocStatus'],
    DocDate:      ['DocDate', 'Date', 'DocumentDate'],
    Total:        ['Total', 'GrandTotal', 'DocTotal'],
    Id:           ['Id', 'ID', 'id'],
  };

  const looksNumeric = (v) => /^[0-9\-]+$/.test(String(v || '').trim());

  // LIKE filters (string or array variant)
  const likeFilters = (props, val, asArray = false) => {
    const v = (val == null ? '' : String(val)).trim();
    if (!v) return [];
    const fv = asArray ? [v] : v;
    return props.map(p => ({ PropertyName: p, Operator: 12, FilterValueArray: fv })); // 12: contains
  };

  // EQUALS filters (for exact DocNo match when numeric-looking)
  const eqFilters = (props, val, asArray = false) => {
    const v = (val == null ? '' : String(val)).trim();
    if (!v) return [];
    const fv = asArray ? [v] : v;
    return props.map(p => ({ PropertyName: p, Operator: 0, FilterValueArray: fv }));  // 0: equals
  };

  // Date range filters
  const dateFiltersFor = (asArray) => {
    const filters = [];
    if (dateFrom && dateTo) {
      filters.push({ PropertyName: F.DocDate[0], Operator: 7, FilterValueArray: [dateFrom, dateTo] }); // between
    } else if (dateFrom) {
      filters.push({ PropertyName: F.DocDate[0], Operator: 3, FilterValueArray: dateFrom }); // >=
    } else if (dateTo) {
      filters.push({ PropertyName: F.DocDate[0], Operator: 5, FilterValueArray: dateTo });   // <=
    }
    return filters;
  };

  const qDoc = (docNo || q || '').trim();
  const tryAsArray = [false, true]; // scalar first, then array
  let lastErr = null;

  for (const path of PATHS) {
    for (const TYPE of TYPES) {
      for (const arr of tryAsArray) {
        // Build filters per variant
        const base = [
          ...likeFilters(F.CustomerName, customer, arr),
          ...likeFilters(F.Status, status, arr),
          ...(q && !docNo ? likeFilters(F.CustomerName, q, arr) : []),
          ...dateFiltersFor(arr),
        ];

        // Prefer DocNo match; if numeric-looking, try equals before like
        const docFilters = looksNumeric(qDoc)
          ? [...eqFilters(F.DocNo, qDoc, arr), ...likeFilters(F.DocNo, qDoc, arr)]
          : likeFilters(F.DocNo, qDoc, arr);

        const Filters = (docFilters.length || base.length) ? [...docFilters, ...base] : likeFilters(F.DocNo, qDoc, arr);

        const body = {
          Type: TYPE,
          NumberOfRecords: Math.min(Math.max(Number(pageSize) || 50, 1), 100),
          PageNumber: Number(page) || 1,
          SortOrder: { PropertyName: F.DocNo[0], Direction: 1 },
          Filters,
        };

        try {
          const out = await tryPost(path, body);
          if (!out.ok) { lastErr = new Error(`${path} ${out.status}: ${out.text.slice(0,180)}`); continue; }

          const rows = normalizeListResult(out.json);
          const mapped = rows.map(r => ({
            id:        r[F.Id.find(k => k in r)] ?? null,
            docNo:     r[F.DocNo.find(k => k in r)] ?? '',
            customer:  r[F.CustomerName.find(k => k in r)] ?? '',
            status:    r[F.Status.find(k => k in r)] ?? '',
            date:      r[F.DocDate.find(k => k in r)] ?? '',
            total:     r[F.Total.find(k => k in r)] ?? null,
            raw:       r,
          }));

          return mapped; // accept first 200 (even if empty array)
        } catch (e) {
          lastErr = e;
          continue;
        }
      }
    }
  }

  if (lastErr) throw lastErr;
  return [];
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
