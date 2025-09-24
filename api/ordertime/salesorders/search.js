// /api/ordertime/salesorders/search.js
const { listSearch, getSalesOrderByDocNo } = require('../../_ot');

module.exports = async function handler(req, res) {
  try {
    const raw = String(req.query.q || '').trim();
    if (!raw) return res.status(200).json([]);

    // If the user typed a number, try an exact DocNumber fetch first.
    const maybeNum = Number(raw);
    if (Number.isFinite(maybeNum)) {
      try {
        const so = await getSalesOrderByDocNo(maybeNum);
        if (so && so.Id) {
          return res.status(200).json([{
            id: so.Id,
            docNo: so.DocNumber || so.Number || String(maybeNum),
            customer: so.CustomerRef?.Name || so.CustomerName || '',
            status: so.Status || so.DocStatus || '',
            date: so.TxnDate || so.Date || '',
          }]);
        }
      } catch { /* fall through to generic search */ }
    }

    // Generic tokenized search (NO fragile filters on nested fields)
    const rows = await listSearch({
      type: 'SalesOrder',
      q: raw,
      columns: [
        'DocNumber',       // some tenants use this
        'Number',          // others use this
        'CustomerRef.Name',
        'CustomerName',
        'Status', 'DocStatus', 'Memo'
      ],
      sortProp: 'Id',
      dir: 'Desc',
      pageSize: 100,
      maxPages: 15,
    });

    const seen = new Set();
    const out = [];
    for (const r of rows) {
      if (seen.has(r.Id)) continue;
      seen.add(r.Id);
      out.push({
        id: r.Id,
        docNo: r.DocNumber || r.Number || '',
        customer: r.CustomerRef?.Name || r.CustomerName || '',
        status: r.Status || r.DocStatus || '',
        date: r.TxnDate || r.Date || '',
      });
      if (out.length >= 50) break;
    }

    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: `API GET /ordertime/salesorders/search failed: ${err.message || err}` });
  }
};
