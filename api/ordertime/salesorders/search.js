// /api/ordertime/salesorders/search.js
import { searchSalesOrders } from '../../_ot';

export default async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);
    const page = Number(req.query.page) || 1;
    const take = Math.min(Number(req.query.take) || 25, 1000);

    const out = await searchSalesOrders(q, page, take);
    res.status(200).json(out);
  } catch (e) {
    console.error('salesorders/search', e);
    res.status(500).json({ error: 'SO search failed: ' + e.message });
  }
}
