// /api/_ot.js
const BASE = (process.env.OT_BASE_URL || 'https://services.ordertime.com/api').replace(/\/+$/, '');
const KEY  = process.env.OT_API_KEY;

function qs(obj = {}) {
  if (!KEY) throw new Error('Missing OT_API_KEY');
  return new URLSearchParams({ ...obj, apikey: KEY }).toString();
}

async function otGet(path, params) {
  const url = `${BASE}${path}?${qs(params)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const txt = await res.text();
  let json; try { json = txt ? JSON.parse(txt) : null; } catch { json = null; }
  if (!res.ok) throw new Error(`GET ${path} ${res.status}: ${txt || res.statusText}`);
  return json;
}

// Optional: list fallback (rarely needed once REST is set)
async function otList(body) {
  const url = `${BASE}/list?${qs()}`; // BASE already ends with /api
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`POST /list ${res.status}: ${JSON.stringify(json)}`);
  return json?.Data ?? json?.data ?? [];
}

async function getSalesOrderById(id) {
  return otGet(`/SalesOrder/${id}`);
}

async function getSalesOrderByDocNo(docNo) {
  const v = String(docNo).trim();

  // Try common REST shapes first
  const attempts = [
    () => otGet(`/SalesOrder`, { DocNumber: v }),
    () => otGet(`/SalesOrder`, { docNumber: v }),
    () => otGet(`/SalesOrder`, { DocNo: v }),
    () => otGet(`/SalesOrder`, { Number: v }),

    // Last-ditch: use /list to resolve the internal ID, then fetch by ID
    async () => {
      const rows = await otList({
        Type: 'SalesOrder',
        ListOptions: {
          Page: 1, PageSize: 1,
          Filters: [{ Field: 'DocNumber', Operator: 'eq', Value: v }],
          Columns: ['ID'],
        },
      });
      if (rows?.[0]?.ID) return getSalesOrderById(rows[0].ID);
      return null;
    },
  ];

  for (const run of attempts) {
    try {
      const data = await run();
      if (data && (data.ID || data.Id || data.DocNumber)) return data;
    } catch { /* try the next form */ }
  }
  throw new Error(`Sales order not found for docNo=${v}`);
}

module.exports = { getSalesOrderById, getSalesOrderByDocNo };
