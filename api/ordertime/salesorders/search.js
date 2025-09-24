// /api/ordertime/salesorders/search.js
const { listSearch, getSalesOrderByDocNo } = require('../../_ot');

module.exports = async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    // Fast path: numeric doc number
    if (/^\d+$/.test(q)) {
      try {
        const so = await getSalesOrderByDocNo(Number(q));
        if (so && (so.Id || so.DocNumber || so.Number)) {
          return res.status(200).json([{
            id: so.Id,
            docNo: so.DocNumber || so.Number || String(q),
            customer: (so.CustomerRef && so.CustomerRef.Name) || so.CustomerName || '',
            status: so.Status || so.DocStatus || '',
            date: so.TxnDate || so.Date || ''
          }]);
        }
      } catch (_) { /* fall back to listSearch if not found */ }
    }

    const rows = await listSearch({
      type: 'SalesOrder',
      q,
      // only simple fields here; nested (CustomerRef.Name) will be caught by fallback
      columns: ['DocNumber', 'Number', 'DocNo', 'CustomerName'],
      sortProp: 'Id',
      dir: 'Desc'
    });

    const seen = new Set();
    const out = rows
      .filter(r => (seen.has(r.Id) ? false : (seen.add(r.Id), true)))
      .map(r => ({
        id: r.Id,
        docNo: r.DocNumber || r.Number || r.DocNo || '',
        customer: r.CustomerName || (r.CustomerRef && r.CustomerRef.Name) || '',
        status: r.Status || r.DocStatus || '',
        date: r.TxnDate || r.Date || '',
      }));

    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: `API GET /ordertime/salesorders/search failed: ${err.message || err}` });
  }
};
