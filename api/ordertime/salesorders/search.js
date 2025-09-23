const { otListSmart, like, filterRows } = require('../../_ot');

module.exports = async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    const [byDoc, byCust] = await Promise.all([
      otListSmart({ type: 'SalesOrder', filters: [like('DocNumber', q)], sortProp: 'DocNumber', desc: true, take: 50 }),
      otListSmart({ type: 'SalesOrder', filters: [like('CustomerRef.Name', q)], sortProp: 'DocNumber', desc: true, take: 50 }),
    ]);

    let rows = [...byDoc, ...byCust];

    // Guaranteed relevance
    rows = filterRows(rows, q, r => [r.DocNumber, r.DocNo, r.Number, r.CustomerRef?.Name]);

    const seen = new Set();
    const out = rows
      .filter(r => (seen.has(r.Id) ? false : (seen.add(r.Id), true)))
      .map(r => ({
        id: r.Id,
        docNo: r.DocNumber || r.DocNo || r.Number || '',
        customer: r.CustomerRef?.Name || '',
        status: r.Status || r.DocStatus || '',
        date: r.TxnDate || r.Date || '',
      }));

    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: `API GET /ordertime/salesorders/search failed: ${err.message || err}` });
  }
};
