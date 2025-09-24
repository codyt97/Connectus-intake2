const { scanList, val, getSalesOrderByDocNo } = require('../../_ot');

module.exports = async function handler(req, res) {
  try {
    const qRaw = String(req.query.q || '').trim();
    if (!qRaw) return res.status(200).json([]);

    // Fast path: a pure number => fetch by DocNo directly
    if (/^\d+$/.test(qRaw)) {
      try {
        const so = await getSalesOrderByDocNo(parseInt(qRaw, 10));
        if (so && (so.Id || so.id)) {
          const doc = so.DocNumber || so.DocNo || so.Number || '';
          return res.status(200).json([{
            id: so.Id || so.id,
            docNo: String(doc),
            customer: val(so, 'CustomerName') || val(so, 'CustomerRef.Name'),
            status: so.Status || so.DocStatus || '',
            date: so.TxnDate || so.Date || ''
          }]);
        }
      } catch (_) { /* fall back to scan below */ }
    }

    // Otherwise: scan and token-match locally
    const terms = qRaw.toLowerCase().split(/\s+/).filter(Boolean);

    const rows = await scanList({
      type: 'SalesOrder',
      sortProp: 'DocNumber', // or 'Id' if DocNumber is flaky
      dir: 'Desc',
      pageSize: 50,
      maxPages: 40
    });

    const FIELDS = [
      'DocNumber', 'DocNo', 'Number',
      'CustomerName', 'CustomerRef.Name',
      'Status', 'Memo'
    ];

    const out = [];
    const seen = new Set();

    for (const r of rows) {
      const hay = FIELDS.map(f => val(r, f)).join(' ').toLowerCase();
      if (!terms.every(t => hay.includes(t))) continue;

      if (seen.has(r.Id)) continue;
      seen.add(r.Id);

      out.push({
        id: r.Id,
        docNo: String(r.DocNumber || r.DocNo || r.Number || ''),
        customer: val(r, 'CustomerName') || val(r, 'CustomerRef.Name'),
        status: r.Status || r.DocStatus || '',
        date: r.TxnDate || r.Date || ''
      });

      if (out.length >= 200) break;
    }

    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: `API GET /ordertime/salesorders/search failed: ${err.message || err}` });
  }
};
