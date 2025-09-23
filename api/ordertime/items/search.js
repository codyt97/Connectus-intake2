const { otListSmart, like, filterRows } = require('../../_ot');

module.exports = async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    const [byName, byNumber, byMfg] = await Promise.all([
      otListSmart({ type: 'PartItem', filters: [like('Name', q)],              sortProp: 'Name', desc: false, take: 50 }),
      otListSmart({ type: 'PartItem', filters: [like('Number', q)],            sortProp: 'Name', desc: false, take: 50 }),
      otListSmart({ type: 'PartItem', filters: [like('ManufacturerPartNo', q)], sortProp: 'Name', desc: false, take: 50 }),
    ]);

    let rows = [...byName, ...byNumber, ...byMfg];

    // Guaranteed relevance
    rows = filterRows(rows, q, r => [r.Name, r.Number, r.Description, r.ManufacturerPartNo, r.UPC]);

    const seen = new Set();
    const out = rows
      .filter(r => (seen.has(r.Id) ? false : (seen.add(r.Id), true)))
      .map(x => ({
        id: x.Id,
        name: x.Name || x.ItemName || '',
        description: x.Description || '',
        mfgPart: x.ManufacturerPartNo || '',
        upc: x.UPC || '',
        price: x.SalesPrice ?? x.Price ?? 0,
        sku: x.Number || '',
      }));

    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: `API GET /ordertime/items/search failed: ${err.message || err}` });
  }
};
