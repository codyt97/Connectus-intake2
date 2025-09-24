const { listSearch, getSalesOrderByDocNo } = require('../../_ot');

module.exports = async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    // If q is a number, prefer the reliable endpoint
    if (/^\d+$/.test(q)) {
      try {
        const so = await getSalesOrderByDocNo(parseInt(q, 10));
        if (so && (so.Id || so.DocNumber)) {
          return res.status(200).json([{
            id: so.Id,
            docNo: so.DocNumber || so.Number || '',
            customer: so.CustomerRef?.Name || so.CustomerName || '',
            status: so.Status || so.DocStatus || '',
            date: so.TxnDate || so.Date || '',
          }]);
        }
      } catch (_) { /* fall through to name search */ }
    }

    // Fallback: client-side match across pages (OT list filters are flaky for SalesOrder)
    const rows = await listSearch({
      type: 'SalesOrder',
      q,
      columns: ['DocNumber','Number','CustomerRef.Name','CustomerName','Memo','Status'],
      sortProp: 'DocNumber',
      dir: 'Desc',
      pageSize: 200,
      maxPages: 15,
      minHits: 200
    });

    const seen = new Set();
    const out = rows
      .filter(r => (seen.has(r.Id) ? false : (seen.add(r.Id), true)))
      .map(r => ({
        id: r.Id,
        docNo: r.DocNumber || r.Number || '',
        customer: r.CustomerRef?.Name || r.CustomerName || '',
        status: r.Status || r.DocStatus || '',
        date: r.TxnDate || r.Date || '',
      }));

    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: `API GET /ordertime/salesorders/search failed: ${err.message || err}` });
  }
};
