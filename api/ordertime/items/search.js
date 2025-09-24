// /api/ordertime/items/search.js  — CommonJS, no enums, no "_ot" globals
const { listSearch } = require('../../_ot');   // 👈 correct relative path

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    const words = q.split(/\s+/).filter(Boolean);

    // 0) Identifier-first pass (SKU / Mfg / UPC / ItemNumber)
    const identCols = ['ItemNumber', 'Number', 'SKU', 'MfgPartNo', 'ManufacturerPartNumber', 'UpcCode', 'UPC'];
    const ident = await listSearch({ type: 'PartItem', q, columns: identCols });

    // 1) Phrase across name/description
    const phrase = await listSearch({ type: 'PartItem', q, columns: ['Name', 'ItemName', 'Description'] });

    // 2) If multi-word, AND the words client-side to catch “iphone 14”
    let multi = [];
    if (words.length > 1) {
      const first = await listSearch({ type: 'PartItem', q: words[0], columns: ['Name', 'ItemName', 'Description'] });
      const J = r => JSON.stringify(r || {}).toLowerCase();
      multi = first.filter(r => words.every(w => J(r).includes(w.toLowerCase())));
    }

    // merge + dedupe
    const seen = new Set();
    const merged = [...ident, ...phrase, ...multi].filter(r => {
      if (!r) return false;
      if (seen.has(r.Id)) return false;
      seen.add(r.Id);
      return true;
    });

    // normalize for the UI
    const out = merged.slice(0, 100).map(x => ({
      id:   x.Id,
      name: x.Name || x.ItemName || '',
      description: x.Description || '',
      sku:  x.SKU || x.ItemNumber || x.Number || '',
      mfgPart: x.MfgPartNo || x.ManufacturerPartNumber || '',
      upc:  x.UpcCode || x.UPC || '',
      price: Number(x.Price ?? x.SalesPrice ?? x.StdPrice ?? 0)
    }));

    return res.status(200).json(out);
  } catch (err) {
    console.error('items/search', err);
    return res.status(500).json({ error: String(err.message || err) });
  }
};
