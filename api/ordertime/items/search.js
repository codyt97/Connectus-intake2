// /api/ordertime/items/search.js

// Support either naming convention; yours are OT_*.
const OT_BASE =
  process.env.OT_BASE_URL ||
  process.env.ORDERTIME_BASE_URL ||
  "https://services.ordertime.com";
 
const OT_KEY =
  process.env.OT_API_KEY ||
  process.env.ORDERTIME_API_KEY;

function otHeaders() {
  if (!OT_KEY) throw new Error("Missing OT_API_KEY");
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    apikey: OT_KEY,       // OrderTime accepts this header
    "x-apikey": OT_KEY,   // …and this one too (belt & suspenders)
  };
}

async function callList(body) {
  const url = `${OT_BASE}/api/list`;
  const r = await fetch(url, {
    method: "POST",
    headers: otHeaders(),
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

    // tokenized keyword search: "iphone 14" => ["iphone","14"]
    const tokens = q.split(/\s+/).filter(Boolean);

    const makeBody = (vals) => ({
      Type: "PartItem",
      ListOptions: {
        Page: 1,
        PageSize: 50,
        // AND all tokens against Description (mirrors your OT UI example)
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

    // Pass 1: AND across tokens
    let results = await callList(makeBody(tokens));

    // Pass 2: if nothing, OR across tokens and de-dupe
    if (results.length === 0 && tokens.length > 1) {
      const chunks = await Promise.all(
        tokens.map((t) => callList(makeBody([t])).catch(() => []))
      );
      const seen = new Map();
      for (const row of chunks.flat()) {
        const key = row.ID ?? row.ItemID ?? row.ItemNumber ?? row.Id ?? row.id;
        if (!seen.has(key)) seen.set(key, row);
      }
      results = [...seen.values()];
    }

    res.status(200).json({ items: results });
  } catch (err) {
    console.error("items/search error:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
}
