const { listSearch } = require('../../_ot');

module.exports = async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    const rows = await listSearch({
      type: 'SalesOrder',
      q,
      columns: ['DocNumber','CustomerRef.Name'],
      sortProp: 'DocNumber',
      dir: 'Desc'
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
