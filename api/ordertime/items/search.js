// /api/ordertime/items/search.js
export default async function handler(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "Missing q" });

    const tokens = q.split(/\s+/).filter(Boolean);

    // Build a body OT /api/list understands for PartItem
    const makeBody = (vals) => ({
      Type: "PartItem",
      ListOptions: {
        Page: 1,
        PageSize: 50,                // show more on the first page
        // AND across all tokens on Description
        Filters: vals.map((v) => ({
          Field: "Description",
          Operator: "like",
          Value: v
        })),
        // Keep columns minimal & safe — unnecessary columns or bad field
        // names are what produced "filter skipped ..." warnings earlier.
        Columns: [
          "ID",
          "ItemNumber",
          "Name",
          "Description",
          "ManufacturerPartNo",
          "UPCCode",
          "SKU"
        ],
        Sort: [{ Field: "Description", Direction: "Asc" }]
      }
    });

    const callList = async (body) => {
      const r = await fetch("https://services.ordertime.com/api/list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // use your secret or proxy; same header you use elsewhere
          Authorization: `Bearer ${process.env.ORDERTIME_TOKEN}`
        },
        body: JSON.stringify(body)
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(
          `OT list failed ${r.status}: ${typeof data === "object" ? JSON.stringify(data) : data}`
        );
      }
      // OT returns either { Data, Total } or sometimes { data } depending on account
      return (data && (data.Data || data.data)) || [];
    };

    // Pass 1: AND all tokens on Description
    let results = await callList(makeBody(tokens));

    // Pass 2 (fallback): OR across tokens if AND returned nothing
    if (results.length === 0 && tokens.length > 1) {
      const all = await Promise.all(
        tokens.map((t) => callList(makeBody([t])).catch(() => []))
      );
      const dedup = new Map();
      for (const arr of all.flat()) {
        const key = arr.ID ?? arr.ItemID ?? arr.ItemNumber ?? arr.Id ?? arr.id;
        if (!dedup.has(key)) dedup.set(key, arr);
      }
      results = [...dedup.values()];
    }

    res.status(200).json({ items: results });
  } catch (err) {
    console.error("items/search error:", err);
    res.status(500).json({ error: "items search failed" });
  }
}
