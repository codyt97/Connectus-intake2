// /api/ordertime/customers/search.js
const { listSearch } = require('../../_ot');

module.exports = async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    // Avoid server-side filter loop for Customers; rely on safe post-filter.
// This eliminates noisy OT "Object reference ..." warnings.
let rows = [];
try {
  // Prefer precise server-side filters for relevance
  rows = await listSearch({
    type: 'Customer',
    q,
    columns: ['Name','CompanyName'], // tight, less OT flakiness
    sortProp: 'Name',
    dir: 'Asc',
    pageSize: 100,
    maxPages: 5
  });
} catch (_) {
  // Fallback: deep post-filter (quiet + robust)
  rows = await listSearch({
    type: 'Customer',
    q,
    columns: [],
    sortProp: 'Id',
    dir: 'Asc',
    pageSize: 200,
    maxPages: 5
  });
}



    res.status(200).json(rows.map(x => ({
      id: x.Id,
      company: x.CompanyName || x.Name || '',
      email: x.Email || x.BillingEmail || '',
      phone: x.Phone || x.BillingPhone || '',
      city: x.BillingCity || x.City || '',
      state: x.BillingState || x.State || '',
    })));
  } catch (err) {
    res.status(500).json({ error: `API GET /ordertime/customers/search failed: ${err.message || err}` });
  }
};
