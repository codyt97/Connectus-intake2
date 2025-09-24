// /api/ordertime/items/search.js
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
  if (cache.has(k)) return cache.get(k);
  const r = await fetch(`${OT_BASE}/enums/RecordTypeEnum`, { headers: otHeaders() });
  if (!r.ok) throw new Error(`enums ${r.status}`);
  const m = await r.json();
  const rev = Object.fromEntries(Object.entries(m).map(([c, n]) => [n, Number(c)]));
  cache.set(k, rev[name]);
  return rev[name];
}

async function list(listInfo) {
  const r = await fetch(`${OT_BASE}/list`, {
    method: 'POST',
    headers: otHeaders(),
    body: JSON.stringify(listInfo),
  });
  if (!r.ok) throw new Error(`/list ${r.status} ${await r.text().catch(()=>'')}`);
  return r.json();
}

function mapItem(x) {
  return {
    id: x.Id,
    name: x.Name ?? x.ItemName ?? null,
    description: x.Description ?? x.ItemDescription ?? '',
    sku: x.ItemNumber ?? x.Number ?? null,
    mfgPart: x.ManufacturerPartNo ?? x.MfgPartNo ?? null,
    upc: x.UPC ?? x.UPCCode ?? null,
    price: x.StdPrice ?? x.Price ?? 0,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing ?q' });

  try {
    // We’ll search BOTH Part and NonPart. Then merge + de-dupe.
    const [Part, NonPart] = await Promise.all([
      getRecordType('Part'),
      getRecordType('NonPart'),
    ]);

    const results = [];
    const seen = new Set();

    // 0) Exact SKU / Mfg / UPC equals (fast path)
    const exactFilters = [
      { PropertyName: 'ItemNumber', Operator: 1, FilterValueArray: q },
      { PropertyName: 'ManufacturerPartNo', Operator: 1, FilterValueArray: q },
      { PropertyName: 'UPC', Operator: 1, FilterValueArray: q },
      { PropertyName: 'UPCCode', Operator: 1, FilterValueArray: q },
    ];

    for (const Type of [Part, NonPart]) {
      for (const f of exactFilters) {
        try {
          const rows = await list({
            Type,
            Filters: [f],
            PageNumber: 1,
            NumberOfRecords: 50,
            Sortation: { PropertyName: 'Name' },
          });
          for (const x of rows || []) {
            const id = x.Id;
            if (seen.has(id)) continue;
            seen.add(id);
            results.push(mapItem(x));
          }
        } catch (_) { /* ignore invalid field for type */ }
      }
    }

    // 1) Tokenized Name LIKE (supports "iPhone 14")
    const tokens = q.split(/\s+/).filter(Boolean);
    const nameFilters = tokens.map(t => ({
      PropertyName: 'Name',
      Operator: 12,
      FilterValueArray: t,
    }));

    for (const Type of [Part, NonPart]) {
      const rows = await list({
        Type,
        Filters: nameFilters,
        PageNumber: 1,
        NumberOfRecords: 100,
        Sortation: { PropertyName: 'Name' },
      });
      for (const x of rows || []) {
        const id = x.Id;
        if (seen.has(id)) continue;
        seen.add(id);
        results.push(mapItem(x));
      }
    }

    return res.json(results);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
