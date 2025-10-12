// /api/ordertime/salesorders/search.js
import { searchSalesOrders } from '../../_ot';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const {
      q = '',
      docNo = '',
      customer = '',
      status = '',
      dateFrom = '',
      dateTo = '',
      page = '1',
      take = '50',
    } = req.query;

    if (!q.trim() && !docNo.trim() && !customer.trim()) {
      return res.status(400).json({ error: 'Provide ?q= or ?docNo= or ?customer=' });
    }

    const rows = await searchSalesOrders(
      { q: q.trim(), docNo: docNo.trim(), customer: customer.trim(), status: status.trim(), dateFrom, dateTo },
      Number(page) || 1,
      Number(take) || 50
    );

    return res.status(200).json(rows);
  } catch (err) {
    console.error('salesorders/search error:', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
