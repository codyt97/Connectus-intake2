const { getSalesOrderById } = require('../../_ot');

module.exports = async function handler(req, res) {
  try {
    const id = Number(req.query.id);
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const so = await getSalesOrderById(id);
    res.status(200).json(so);
  } catch (e) {
    res.status(500).json({ error: 'SO fetch failed: ' + e.message });
  }
};
