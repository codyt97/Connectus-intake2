const { listSearch } = require('../../_ot');

module.exports = async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    const rows = await listSearch({
      type: 'Customer',
      q,
      columns: ['Name', 'CompanyName', 'Email', 'Phone', 'BillingCity', 'BillingState'],
      sortProp: 'Id',
      dir: 'Asc',
      pageSize: 200,
      maxPages: 20,
      take: 50,
      tryServerFilters: true, // customer filters tend to be OK, but errors are swallowed anyway
    });

    const out = rows.map(x => ({
      id: x.Id,
      company: x.CompanyName || x.Name || '',
      email: x.Email || x.BillingEmail || '',
      phone: x.Phone || x.BillingPhone || '',
      city: x.BillingCity || x.City || '',
      state: x.BillingState || x.State || '',
    }));

    res.status(200).json(out);
  } catch (err) {
    console.error('customers/search', err);
    res.status(500).json({ error: `API GET /ordertime/customers/search failed: ${err.message || err}` });
  }
};
