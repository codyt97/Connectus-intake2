// api/ordertime/salesorders/search.js
const { getSalesOrderByDocNo } = require('../../_ot');

module.exports = async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    // Pull out a number (e.g. from "SO-25068" or "25068")
    const m = q.match(/(\d{3,})$/);
    if (!m) return res.status(200).json([]); // avoid /list entirely on this tenant

    const docNo = parseInt(m[1], 10);
    const so = await getSalesOrderByDocNo(docNo);
    if (!so || !so.Id) return res.status(200).json([]);

    res.status(200).json([{
      id: so.Id,
      docNo: so.DocNumber || so.Number || docNo,
      customer: so.CustomerRef?.Name || so.Customer?.Name || '',
      status: so.Status || so.DocStatus || '',
      date: so.TxnDate || so.Date || ''
    }]);
  } catch (err) {
    res.status(500).json({ error: `API GET /ordertime/salesorders/search failed: ${err.message || err}` });
  }
};
