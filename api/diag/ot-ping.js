// Keep ping simple: hit a tiny page and confirm auth
const { otPost } = require('../_ot');

module.exports = async function handler(_req, res) {
  try {
    const rows = await otPost('/list', {
      Type: 'Customer',
      PageNumber: 1,
      NumberOfRecords: 1,
      Sortation: { PropertyName: 'Id', Direction: 'Asc' }
    });
    const list = Array.isArray(rows?.Records) ? rows.Records : (Array.isArray(rows) ? rows : []);
    res.status(200).json({ ok: true, count: list.length, sample: list[0] || null });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
};
