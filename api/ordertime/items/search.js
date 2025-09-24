// /api/ordertime/items/search.js
export async function GET(req) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) return new Response(JSON.stringify({ items: [] }), { status: 200 });

  const tokens = q.split(/\s+/).filter(Boolean);
  const PAGE_SIZE = 50;

  // 1) AND across tokens on Description (matches OT UI “two Description like rows”)
  const andDescriptionFilters = tokens.map(v => ({
    Field: 'Description', Operator: 'like', Value: v
  }));

  let items = await queryList('PartItem', andDescriptionFilters, PAGE_SIZE).catch(() => []);
  items = mapPartItems(items);

  // 2) Fallback: OR across fields by issuing one request per field and merging
  if (items.length === 0) {
    const fields = ['Name', 'Number', 'SKU', 'UPCCode', 'MfgPartNo', 'Description'];
    const pages = await Promise.all(
      fields.map(f =>
        queryList('PartItem', [{ Field: f, Operator: 'like', Value: q }], PAGE_SIZE)
          .catch(() => [])
      )
    );
    const uniq = new Map();
    for (const rows of pages) {
      for (const it of mapPartItems(rows)) uniq.set(it.id, it);
    }
    items = [...uniq.values()];
  }

  return new Response(JSON.stringify({ items }), { status: 200 });
}

async function queryList(listName, filters, pageSize = 50, pageIndex = 1) {
  const body = {
    ListName: listName,
    Columns: [
      'PartId', 'Name', 'Description', 'Number', 'SKU',
      'UPCCode', 'MfgPartNo', 'Manufacturer'
    ],
    Filters: filters,
    PageIndex: pageIndex,
    PageSize: pageSize,
    Sort: [{ Field: 'Name', Direction: 'Ascending' }],
  };

  const resp = await fetch('https://services.ordertime.com/api/list', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // whatever you use today to auth against OT:
      Authorization: `Bearer ${process.env.ORDERTIME_TOKEN}`,
    },
    body: JSON.stringify(body),
    // OT can be slow; give it a little time
    // signal: AbortSignal.timeout(20000)  // Node 18+, optional
  });

  if (!resp.ok) throw new Error(`OT list ${listName} failed: ${resp.status}`);
  const data = await resp.json();
  // OT returns rows under several names depending on list; normalize to array
  return data?.Items || data?.items || data?.Rows || data || [];
}

function mapPartItems(rows) {
  return rows.map(r => ({
    id: String(r.PartId ?? r.ID ?? r.Id ?? r.PartID),
    name: r.Name ?? r.ItemName ?? r.Number ?? '',
    description: r.Description ?? '',
    sku: r.SKU ?? r.Number ?? '',
    upc: r.UPCCode ?? '',
    mfgPartNo: r.MfgPartNo ?? r.ManufacturerPartNo ?? '',
    manufacturer: r.Manufacturer ?? '',
  }));
}
