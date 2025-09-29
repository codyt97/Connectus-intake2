// /api/ordertime/salesorders/search.js
import { searchSalesOrders } from '../../_ot';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const qRaw = (req.query.q || '').toString().trim();
    if (!qRaw) return res.status(200).json({ results: [] });

    // Uses _ot.js → asserts OT_* env and does the POST /list logic for multiple types
    const rows = await searchSalesOrders({ q: qRaw }, 1, 25);

    // Map to the UI shape your drawer renders (number, customerName, date, status)
    const results = (rows || []).map(r => ({
      id:           r.id || r.docNo || '',
      number:       r.docNo || '',
      customerName: r.customer || '',
      date:         r.date || '',
      status:       r.status || '',
    }));

    return res.status(200).json({ results });
  } catch (err) {
    // Never 500 the browser; let UI show "No matches"
    return res.status(200).json({ results: [], error: err?.message || 'Search failed' });
  }
}
