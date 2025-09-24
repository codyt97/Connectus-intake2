const { listSearchWithFallback } = require('../../_ot');

module.exports = async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    const rows = await listSearchWithFallback({
      type: 'Customer',
      q,
      columns: ['Name', 'CompanyName', 'Email', 'Phone'],
      sortProp: 'Name',
      desc: false,
      take: 50,
      fallbackTake: 400
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
    res.status(500).json({ error: `API GET /ordertime/customers/search failed: ${err.message || err}` });
  }
};
