export default async function handler(req, res) {
  const BASE = process.env.OT_BASE_URL;
  const KEY  = process.env.OT_API_KEY;

  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json({ results: [] });

    const like = (prop) => ({
      PropertyName: prop,
      FieldType: 1,      // String
      Operator: 12,      // Like
      FilterValueArray: `%${q}%`
    });

    const body = {
      Type: 115, // Item All
      NumberOfRecords: 50,
      PageNumber: 1,
      Sortation: { PropertyName: 'Name', Direction: 1 }, // Asc
      Filters: [
        like('Name'),
        like('Description'),
        like('ManufacturerPartNo'),
        like('UPC'),
      ]
    };

    const r = await fetch(`${BASE}/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ApiKey: KEY },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(data));

    const results = (data?.List || data || []).map(row => ({
      id: row.Id ?? row.id,
      name: row.Name ?? row.name,
      description: row.Description ?? row.description,
      upc: row.UPC ?? row.upc,
      mfgPart: row.ManufacturerPartNo ?? row.manufacturerPartNo,
      price: row.Price ?? row.price,
      uom: row.UomRef?.Name ?? row.uom
    }));
    res.status(200).json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Item search failed' });
  }
}
