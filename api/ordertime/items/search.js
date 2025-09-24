// /api/ordertime/items/search.js
const OT_BASE = "https://services.ordertime.com/api/list";
const COLUMNS_PARTITEM = [
  "PartId", "Name", "Description", "Number", "SKU",
  "UPCCode", "MfgPartNo", "ManufacturerPartNo", "Manufacturer"
];

export async function GET(req) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return json200({ items: [] });

  // Split "iphone 14" -> ["iphone","14"]; match *both* (AND) on Description.
  const tokens = q.split(/\s+/).filter(Boolean);
  const filtersAND = tokens.map((v) => ({ Field: "Description", Operator: "like", Value: v }));

  // Try: Description AND tokens (mirrors OT UI with two Description rows)
  let rows = await listPages("PartItem", filtersAND, 1, 100).catch(() => []);

  // Fallbacks if nothing came back (be tolerant, but deterministic)
  if (!rows.length) {
    // Try tokens against Name as well (still AND across tokens)
    const nameAND = tokens.map((v) => ({ Field: "Name", Operator: "like", Value: v }));
    rows = await listPages("PartItem", nameAND, 1, 100).catch(() => []);
  }
  if (!rows.length && tokens.length > 1) {
    // Last resort: OR the tokens on Description
    const orFilters = tokens.map((v) => ({ Field: "Description", Operator: "like", Value: v }));
    rows = await listPages("PartItem", orFilters, 1, 100, "Or").catch(() => []);
  }

  return json200({ items: mapPartItems(rows) });
}

/* ---------- helpers ---------- */

async function listPages(type, filters, pages = 1, pageSize = 50, join = "And") {
  const all = [];
  for (let page = 1; page <= pages; page++) {
    const payload = {
      Type: type,
      Page: page,
      PageSize: pageSize,
      // both keys below are accepted by OrderTime; keep both for safety
      FilterJoin: join,
      FilterOperator: join,
      Filters: filters,
      Columns: COLUMNS_PARTITEM
    };

    const res = await fetch(OT_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Your env vars (must be set on Vercel)
        "ot-rest-key": process.env.ORDERTIME_API_KEY,
        "ot-company": process.env.ORDERTIME_COMPANY
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`OT /api/list ${res.status}: ${txt}`);
    }

    const data = await res.json();
    const rows =
      data?.Items || data?.items || data?.Rows || data?.rows || data || [];
    if (Array.isArray(rows) && rows.length) all.push(...rows);

    // If the API returns paging info, stop when there's no more.
    const totalPages = data?.TotalPages ?? data?.totalPages ?? undefined;
    if (totalPages && page >= totalPages) break;
  }
  return all;
}

function mapPartItems(rows) {
  return rows.map((r) => ({
    id: String(r.PartId ?? r.ID ?? r.Id ?? r.PartID ?? ""),
    name: r.Name ?? r.ItemName ?? r.Number ?? "",
    description: r.Description ?? "",
    sku: r.SKU ?? r.Number ?? "",
    upc: r.UPCCode ?? "",
    mfgPartNo: r.MfgPartNo ?? r.ManufacturerPartNo ?? "",
    manufacturer: r.Manufacturer ?? ""
  }));
}

function json200(obj) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
