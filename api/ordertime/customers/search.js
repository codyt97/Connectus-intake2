// /api/ordertime/customers/search.js
import { listCustomersByName } from '../../_ot';

export default async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);     // empty query → empty list (not 400)
    const page = Number(req.query.page) || 1;
    const take = Math.min(Number(req.query.take) || 25, 1000);

    const rows = await listCustomersByName(q, page, take);
    res.status(200).json(rows);
  } catch (err) {
    console.error('customers/search', err);
    res.status(500).json({ error: String(err.message || err) });
  }
}
