// CJS import
const { otListSmart, like, filterRows } = require('../../_ot');

module.exports = async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    const filters = [
      like('Name', q),
      like('CompanyName', q),
      like('Email', q),
      like('Phone', q),
    ];

    const rows = await otListSmart({ type: 'Customer', filters, sortProp: 'Name', desc: false, take: 50 });

    // Post-filter to guarantee relevance even if OT ignores filters
    const filtered = filterRows(rows, q, r => [
      r.Name, r.CompanyName, r.Email, r.Phone, r.BillingEmail, r.BillingPhone
    ]);

    const out = filtered.map(x => ({
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
