// /api/ordertime/salesorders/search.js
const { listSearch, getSalesOrderByDocNo } = require('../../_ot');

module.exports = async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    // If it's a pure doc number (or nearly), go straight to the entity GET
    const digitsOnly = q.replace(/\D+/g, '');
    if (digitsOnly && digitsOnly.length >= 3 && /^\d+$/.test(digitsOnly)) {
      try {
        const so = await getSalesOrderByDocNo(parseInt(digitsOnly, 10));
        if (so && (so.Id || so.DocNumber)) {
          return res.status(200).json([{
            id: so.Id,
            docNo: so.DocNumber || so.Number || digitsOnly,
            customer: so.CustomerRef?.Name || '',
            status: so.Status || so.DocStatus || '',
            date: so.TxnDate || so.Date || '',
          }]);
        }
      } catch (_) {
        // fall back to list search if not found
      }
    }

    // Text search (tokenized AND across columns)
    const rows = await listSearch({
      type: 'SalesOrder',
      q,
      columns: ['DocNumber','CustomerRef.Name'],
      sortProp: 'DocNumber',
      dir: 'Desc',
      pageSize: 100,
      maxPages: 8,
      targetCount: 50
    });

    const seen = new Set();
    const out = rows
      .filter(r => (seen.has(r.Id) ? false : (seen.add(r.Id), true)))
      .map(r => ({
        id: r.Id,
        docNo: r.DocNumber || r.Number || '',
        customer: r.CustomerRef?.Name || '',
        status: r.Status || r.DocStatus || '',
        date: r.TxnDate || r.Date || '',
      }));

    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: `API GET /ordertime/salesorders/search failed: ${err.message || err}` });
  }
};
