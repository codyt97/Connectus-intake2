const { listSearch, getSalesOrderByDocNo } = require('../../_ot');

module.exports = async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    // 1) Fast path: numeric docNo -> direct GET (bypasses /list entirely)
    if (/^\d+$/.test(q)) {
      try {
        const so = await getSalesOrderByDocNo(parseInt(q, 10));
        if (so?.Id) {
          return res.status(200).json([{
            id: so.Id,
            docNo: so.DocNumber || so.Number || q,
            customer: so.CustomerRef?.Name || '',
            status:  so.Status || so.DocStatus || '',
            date:    so.TxnDate || so.Date || '',
          }]);
        }
      } catch (e) {
        // Not found via direct GET — fall through to list scan
        console.warn('salesorders/search docNo GET fallback', String(e?.message || e));
      }
    }

    // 2) Resilient list scan + local filter
    const rows = await listSearch({
      type: 'SalesOrder',
      q,
      columns: ['DocNumber', 'Number', 'CustomerRef.Name', 'CustomerName'],
      sortProp: 'Id',
      dir: 'Desc',
      pageSize: 200,
      maxPages: 25,
      take: 50,
      tryServerFilters: false, // OT filters for SalesOrder are flaky on some tenants
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
    console.error('salesorders/search', err);
    res.status(500).json({ error: `API GET /ordertime/salesorders/search failed: ${err.message || err}` });
  }
};
