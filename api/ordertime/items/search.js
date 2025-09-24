// /api/ordertime/items/search.js  (CommonJS, no enums)
// correct relative path from /api/ordertime/items/ → /api/_ot.js
const { ot, listSearch, listSearchTextFilter } = require('../../_ot');


module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    const words = q.split(/\s+/).filter(Boolean);

    // 0) Exact-ish identifiers (SKU / Mfg / UPC). listSearch is LIKE behind the scenes,
    // but we bias to identifier columns first.
    const identCols = ['ItemNumber', 'Number', 'SKU', 'MfgPartNo', 'ManufacturerPartNumber', 'UpcCode', 'UPC'];
    const ident = await _ot.listSearch({ type: 'PartItem', q, columns: identCols });

    // 1) Phrase search across name/desc
    const phrase = await _ot.listSearch({
      type: 'PartItem',
      q,
      columns: ['Name', 'ItemName', 'Description']
    });

    // 2) If multi-word, AND the words client-side (listSearch ANDs on the server across columns);
    // we do an extra pass to make sure "iphone 14" doesn’t miss.
    let multi = [];
    if (words.length > 1) {
      const firstPass = await _ot.listSearch({ type: 'PartItem', q: words[0], columns: ['Name', 'ItemName', 'Description'] });
      const j = s => JSON.stringify(s || {}).toLowerCase();
      multi = firstPass.filter(r => words.every(w => j(r).includes(w.toLowerCase())));
    }

    // merge + dedupe
    const seen = new Set();
    const merged = [...ident, ...phrase, ...multi].filter(r => {
      const id = r.Id;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    // normalize to front-end
    const out = merged.slice(0, 100).map(x => ({
      id:   x.Id,
      name: x.Name || x.ItemName || '',
      description: x.Description || '',
      sku:  x.SKU || x.ItemNumber || x.Number || '',
      mfgPart: x.MfgPartNo || x.ManufacturerPartNumber || '',
      upc:  x.UpcCode || x.UPC || '',
      price: Number(x.Price ?? x.SalesPrice ?? x.StdPrice ?? 0)
    }));

    res.status(200).json(out);
  } catch (err) {
    console.error('items/search', err);
    res.status(500).json({ error: String(err.message || err) });
  }
};
