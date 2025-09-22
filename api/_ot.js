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
function normalizeListResult(data) {
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
export async function searchSalesOrders(criteria = {}, page = 1, pageSize = 50) {
  assertEnv();

  const {
    q = '',
    docNo = '',
    customer = '',
    status = '',
    dateFrom = '',  // ISO 'YYYY-MM-DD' recommended
    dateTo = '',
  } = criteria;

  // Most common SO header types I see in OT tenants.
  const CANDIDATE_TYPES = [130, 135, 131]; // try several; first working wins

  // Field name variants across tenants/schemas.
  const F = {
    DocNo:        ['DocNo', 'DocumentNo', 'DocNumber'],
    CustomerName: ['CustomerName', 'Customer', 'CustName'],
    Status:       ['Status', 'DocStatus'],
    DocDate:      ['DocDate', 'Date', 'DocumentDate'],
    Total:        ['Total', 'GrandTotal', 'DocTotal'],
    Id:           ['Id', 'ID', 'id'],
  };

  // Build LIKE filters for a given prop list and a value.
  const likeFilters = (props, val) =>
    (!val || !String(val).trim()) ? [] :
    props.map(p => ({ PropertyName: p, Operator: 12, FilterValueArray: String(val) }));

  // Build date filters if provided (fallback to LIKE if BETWEEN isn’t supported in your tenant).
  const dateFilters = [];
  if (dateFrom && dateTo) {
    // 7 := between (common), with 2-element array
    dateFilters.push({ PropertyName: F.DocDate[0], Operator: 7, FilterValueArray: [dateFrom, dateTo] });
  } else if (dateFrom) {
    // 3 := >=
    dateFilters.push({ PropertyName: F.DocDate[0], Operator: 3, FilterValueArray: dateFrom });
  } else if (dateTo) {
    // 5 := <=
    dateFilters.push({ PropertyName: F.DocDate[0], Operator: 5, FilterValueArray: dateTo });
  }

  const filters =
    [
      ...likeFilters(F.DocNo, docNo || q),
      ...likeFilters(F.CustomerName, customer || ''),
      ...likeFilters(F.Status, status || ''),
      ...(q && !docNo ? likeFilters(F.CustomerName, q) : []),
      ...dateFilters,
    ];

  // Try each candidate type until one returns items or a definite 200
  let lastErr = null;
  for (const TYPE of CANDIDATE_TYPES) {
    const body = {
      Type: TYPE,
      NumberOfRecords: Math.min(Math.max(Number(pageSize) || 50, 1), 100),
      PageNumber: Number(page) || 1,
      SortOrder: { PropertyName: F.DocNo[0], Direction: 1 },
      Filters: filters.length ? filters : likeFilters(F.DocNo, q || ''), // default to q on DocNo
    };

    try {
      const out = await tryPost('/list', body);
      if (!out.ok) { lastErr = new Error(`/list ${out.status}: ${out.text.slice(0,180)}`); continue; }

      const rows = normalizeListResult(out.json);
      // Map results to a normalized shape
      const mapped = rows.map(r => ({
        id:        r[F.Id.find(k => k in r)] ?? null,
        docNo:     r[F.DocNo.find(k => k in r)] ?? '',
        customer:  r[F.CustomerName.find(k => k in r)] ?? '',
        status:    r[F.Status.find(k => k in r)] ?? '',
        date:      r[F.DocDate.find(k => k in r)] ?? '',
        total:     r[F.Total.find(k => k in r)] ?? null,
        raw:       r, // keep raw in case UI needs extra fields
      }));

      // Accept on first 200; if array is empty and you passed a non-empty query, still return (it’s a valid 200)
      return mapped;
    } catch (e) {
      lastErr = e;
      continue;
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

  // Normalize to the structure your UI expects
  return {
    company: x.Company || x.CompanyName || x.Name || '',
    billing: {
      contact: x.BillingContact || '',
      phone:   x.BillingPhone   || '',
      email:   x.BillingEmail   || '',
      street:  x.BillingAddress1 || x.BillingAddress || '',
      suite:   x.BillingAddress2 || '',
      city:    x.BillingCity     || '',
      state:   x.BillingState    || '',
      zip:     x.BillingZip      || '',
    },
    shipping: {
      company:   x.ShipToCompany || x.Company || '',
      contact:   x.ShipToContact || '',
      phone:     x.ShipToPhone   || '',
      email:     x.ShipToEmail   || '',
      street:    x.ShipToAddress1 || '',
      suite:     x.ShipToAddress2 || '',
      city:      x.ShipToCity     || '',
      state:     x.ShipToState    || '',
      zip:       x.ShipToZip      || '',
      residence: !!x.ShipToIsResidential,
    },
    payment: {
      method:    x.DefaultPaymentMethod || '',
      terms:     x.PaymentTerms         || '',
      taxExempt: !!x.IsTaxExempt,
      agreement: !!x.HasPurchaseAgreement,
    },
    shippingOptions: {
      pay:      x.DefaultShipPaymentMethod || '',
      speed:    x.DefaultShipSpeed         || '',
      shortShip: x.ShortShipPolicy || '',
    },
    carrierRep: { name: x.CarrierRepName || '', email: x.CarrierRepEmail || '' },
    rep:        { primary: x.PrimaryRepName || '', secondary: x.SecondaryRepName || '' },
  };
}
