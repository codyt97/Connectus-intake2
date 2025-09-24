// /api/ordertime/items/search.js  (CommonJS)
const _ot = require('../_ot');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    const words = q.split(/\s+/).filter(Boolean);

    // 1) Broad, phrase match across common text columns
    const broad = await _ot.listSearch({
      type: 'PartItem',
      q,
      columns: ['Name', 'ItemName', 'Description', 'Number', 'ItemNumber', 'MfgPartNo', 'ManufacturerPartNumber', 'UpcCode', 'SKU']
    });

    // 2) If multi-word, also AND the words client-side to tighten results
    let multi = [];
    if (words.length > 1) {
      const rows = await _ot.listSearch({
        type: 'PartItem',
        q: words[0],
        columns: ['Name', 'ItemName', 'Description']
      });
      const hasAll = r => words.every(w =>
        _ot.__rowContainsAnyString ? _ot.__rowContainsAnyString(r, w.toLowerCase()) :
        JSON.stringify(r).toLowerCase().includes(w.toLowerCase())
      );
      multi = rows.filter(hasAll);
    }

    // 3) Exact match fields for SKUs and identifiers
    const exactFields = ['Number','ItemNumber','SKU','MfgPartNo','ManufacturerPartNumber','UpcCode','UPC'];
    const exact = await Promise.all(exactFields.map(async (f) => {
      try {
        return await _ot.listSearch({ type: 'PartItem', q, columns: [f] });
      } catch { return []; }
    }));

    // Merge & normalize
    const seen = new Set();
    const merged = [...broad, ...multi, ...exact.flat()].filter(r => {
      const id = r.Id;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    const out = merged.slice(0, 100).map(x => ({
      id:   x.Id,
      name: x.Name || x.ItemName || '',
      description: x.Description || '',
      sku:  x.SKU || x.Number || x.ItemNumber || '',
      mfgPart: x.MfgPartNo || x.ManufacturerPartNumber || '',
      upc:  x.UpcCode || x.UPC || '',
      price: Number(x.Price ?? x.SalesPrice ?? 0)
    }));

    res.status(200).json(out);
  } catch (err) {
    console.error('items/search', err);
    res.status(500).json({ error: String(err.message || err) });
  }
};
