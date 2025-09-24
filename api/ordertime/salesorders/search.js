// /api/ordertime/salesorders/search.js
const OT_BASE = process.env.OT_BASE_URL || 'https://services.ordertime.com/api';

function otHeaders() {
  const { OT_API_KEY, OT_EMAIL, OT_PASSWORD, OT_DEVKEY } = process.env;
  const h = { 'Content-Type': 'application/json', apiKey: OT_API_KEY, email: OT_EMAIL };
  if (OT_DEVKEY) h.DevKey = OT_DEVKEY; else h.password = OT_PASSWORD;
  return h;
}

const cache = new Map();
async function getRecordType(name) {
  const k = `rt:${name}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const res = await fetch(`${OT_BASE}/enums/RecordTypeEnum`, { headers: otHeaders() });
  if (!res.ok) throw new Error(`enums failed ${res.status}`);
  const map = await res.json(); // { "7":"SalesOrder", ... }
  const reverse = Object.fromEntries(Object.entries(map).map(([code, n]) => [n, Number(code)]));
  cache.set(k, reverse[name]);
  return reverse[name];
}

async function list(listInfo) {
  const r = await fetch(`${OT_BASE}/list`, {
    method: 'POST',
    headers: otHeaders(),
    body: JSON.stringify(listInfo),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`/list ${r.status} ${t}`);
  }
  return r.json();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing ?q' });

  try {
    // Fast path: pure numeric → fetch by DocNo directly
    if (/^\d+$/.test(q)) {
      const r = await fetch(`${OT_BASE}/SalesOrder?docNo=${encodeURIComponent(q)}`, {
        headers: otHeaders(),
      });
      if (r.ok) {
        const so = await r.json();
        const item = {
          id: so.Id ?? so.Doc?.Id,
          docNo: so.DocNo ?? so.Doc?.DocNo ?? q,
          customer: so.CustomerRef?.Name ?? null,
          status: so.StatusRef?.Name ?? null,
          date: so.Date ?? so.Doc?.Date ?? null,
        };
        return res.json([item]);
      }
      // fall through to list search if not found
    }

    const Type = await getRecordType('SalesOrder');

    // Tokenize text for better matches (e.g., "Acme West")
    const tokens = q.split(/\s+/).filter(Boolean);

    // OT /list applies AND across Filters, so we’ll try two runs and merge:
    // 1) DocNo LIKE whole query
    // 2) CustomerRef.Name must contain ALL tokens (multiple LIKEs)
    const results = [];
    const seen = new Set();

    // #1 DocNo LIKE
    const byDoc = await list({
      Type,
      Filters: [{ PropertyName: 'DocNo', Operator: 12, FilterValueArray: q }],
      PageNumber: 1,
      NumberOfRecords: 50,
      Sortation: { PropertyName: 'DocNo', Direction: 2 },
    });

    for (const x of byDoc || []) {
      const id = x.Id ?? x.Doc?.Id ?? x.DocNo;
      if (seen.has(id)) continue;
      seen.add(id);
      results.push({
        id,
        docNo: x.DocNo ?? x.Doc?.DocNo,
        customer: x.CustomerRef?.Name ?? null,
        status: x.StatusRef?.Name ?? null,
        date: x.Date ?? x.Doc?.Date ?? null,
      });
    }

    // #2 CustomerRef.Name LIKE for each token (AND)
    const nameFilters = tokens.map(t => ({
      PropertyName: 'CustomerRef.Name',
      Operator: 12,
      FilterValueArray: t,
    }));

    const byCust = await list({
      Type,
      Filters: nameFilters,
      PageNumber: 1,
      NumberOfRecords: 50,
      Sortation: { PropertyName: 'DocNo', Direction: 2 },
    });

    for (const x of byCust || []) {
      const id = x.Id ?? x.Doc?.Id ?? x.DocNo;
      if (seen.has(id)) continue;
      seen.add(id);
      results.push({
        id,
        docNo: x.DocNo ?? x.Doc?.DocNo,
        customer: x.CustomerRef?.Name ?? null,
        status: x.StatusRef?.Name ?? null,
        date: x.Date ?? x.Doc?.Date ?? null,
      });
    }

    return res.json(results);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
