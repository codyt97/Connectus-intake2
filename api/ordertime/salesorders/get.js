// /api/ordertime/salesorders/get.js
const { getSalesOrderByDocNo } = require('../../_ot');

module.exports = async function handler(req, res) {
  try {
    const docNo = String(req.query.docNo || '').trim();   // ← keep as string
    if (!docNo) return res.status(400).json({ error: 'docNo is required' });
    const so = await getSalesOrderByDocNo(docNo);
    res.status(200).json(so);
  } catch (err) {
    console.error('salesorders/get', err);
    res.status(500).json({ error: 'Fetch sales order failed: ' + (err.message || err) });
  }
};
