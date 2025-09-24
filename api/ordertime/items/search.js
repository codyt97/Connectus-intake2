// /api/ordertime/items/search.js

const RAW_BASE =
  process.env.ORDERTIME_BASE_URL ||
  process.env.OT_BASE_URL ||
  "https://services.ordertime.com/api";

const OT_KEY =
  process.env.ORDERTIME_API_KEY ||
  process.env.OT_API_KEY;

// normalize: remove a trailing /api and trailing slashes
const OT_BASE = RAW_BASE.replace(/\/+$/, "").replace(/\/api$/i, "");

function otHeaders() {
  if (!OT_KEY) throw new Error("Missing ORDERTIME_API_KEY (or OT_API_KEY)");
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    apikey: OT_KEY,
    "x-apikey": OT_KEY,
  };
}

async function callList(body) {
  const url = `${OT_BASE}/api/list`; // <- single /api
  const r = await fetch(url, {
    method: "POST",
    headers: otHeaders(),
    // OT accepts the key via header; you don't need it in the querystring.
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`OT list failed ${r.status}: ${JSON.stringify(data)}`);
  }
  return (data && (data.Data || data.data)) || [];
}

export default async function handler(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "Missing q" });

    const tokens = q.split(/\s+/).filter(Boolean);

    const makeBody = (vals) => ({
      Type: "PartItem",
      ListOptions: {
        Page: 1,
        PageSize: 50,
        Filters: vals.map((v) => ({
          Field: "Description",
          Operator: "like",
          Value: v,
        })),
        Columns: [
          "ID",
          "ItemNumber",
          "Name",
          "Description",
          "ManufacturerPartNo",
          "UPCCode",
          "SKU",
        ],
        Sort: [{ Field: "Description", Direction: "Asc" }],
      },
    });

    // Pass 1: AND all tokens (e.g., "iphone" AND "14")
    let results = await callList(makeBody(tokens));

    // Pass 2: OR across tokens if AND returns nothing
    if (results.length === 0 && tokens.length > 1) {
      const all = await Promise.all(
        tokens.map((t) => callList(makeBody([t])).catch(() => []))
      );
      const dedup = new Map();
      for (const item of all.flat()) {
        const key = item.ID ?? item.ItemID ?? item.ItemNumber ?? item.Id ?? item.id;
        if (!dedup.has(key)) dedup.set(key, item);
      }
      results = [...dedup.values()];
    }

    res.status(200).json({ items: results });
  } catch (err) {
    console.error("items/search error:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
}
