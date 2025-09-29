// /api/ordertime/salesorders/search.js
import { searchSalesOrders } from '../../_ot';

// /api/ordertime/salesorders/search.js
import { searchSalesOrders } from '../../_ot';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const qRaw = (req.query.q || '').toString().trim();
    if (!qRaw) return res.status(200).json({ results: [] });

    const rows = await searchSalesOrders({ q: qRaw }, 1, 25);
    const results = rows.map(r => ({
      id: r.id || r.docNo || '',
      number: r.docNo || '',
      customerName: r.customer || '',
      date: r.date || '',
      status: r.status || '',
    }));
    return res.status(200).json({ results });
  } catch (err) {
    return res.status(200).json({ results: [], error: err?.message || 'Search failed' });
  }
}

