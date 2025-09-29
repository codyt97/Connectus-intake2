// /api/ordertime/salesorders/search.js
import { normalizeListResult } from '../../_ot';

export default async function handler(req, res) {
  // Always respond 200 with {results:[]} on errors so the UI shows "No matches" instead of a 500
  const safeFail = (msg) => res.status(200).json({ results: [], error: msg });

  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const qRaw = (req.query.q || '').toString().trim();
    if (!qRaw) return res.status(200).json({ results: [] });

    // Strategy:
    //  1) If looks like a DocNo (digits or starts with SO-), try targeted lookup
    //  2) Fallback to broad search by customer/name
    const isDocNo = /^[0-9]+$/.test(qRaw) || /^SO[-\s]?\d+/i.test(qRaw);

    // Call upstream OrderTime list/search endpoints. If you already have helpers, use them here.
    // These two calls are intentionally tolerant; if either throws, we fall back to empty.
    const OT_BASE = process.env.ORDERTIME_BASE_URL || process.env.ORDERTIME_BASE || 'https://services.ordertime.com';
    const APIKEY  = process.env.ORDERTIME_API_KEY;
    if (!APIKEY) return safeFail('Missing ORDERTIME_API_KEY');

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'apikey': APIKEY,
      'x-apikey': APIKEY,
    };

    let results = [];

    if (isDocNo) {
      // Try exact (or contains) DocNo match via a list endpoint
      try {
        const body = {
          pageNumber: 1,
          pageSize: 25,
          filters: [{ field: 'DocNo', operator: 'Contains', value: qRaw }]
        };
        const r = await fetch(`${OT_BASE}/api/salesorder/list`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (r.ok) {
          const raw = await r.json();
          const list = normalizeListResult(raw);
          results = list.map(x => ({
            id: x.Id || x.id || x.DocNo || x.docNo,
            number: x.DocNo || x.docNo || '',
            customerName: x.CustomerName || x.Customer || '',
            date: x.TxDate || x.Date || '',
            status: x.Status || x.DocStatus || '',
          }));
        }
      } catch (_) {}
    }

    if (results.length === 0) {
      // Fallback: search by CustomerName (broad text)
      try {
        const body = {
          pageNumber: 1,
          pageSize: 25,
          filters: [{ field: 'CustomerName', operator: 'Contains', value: qRaw }]
        };
        const r = await fetch(`${OT_BASE}/api/salesorder/list`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (r.ok) {
          const raw = await r.json();
          const list = normalizeListResult(raw);
          results = list.map(x => ({
            id: x.Id || x.id || x.DocNo || x.docNo,
            number: x.DocNo || x.docNo || '',
            customerName: x.CustomerName || x.Customer || '',
            date: x.TxDate || x.Date || '',
            status: x.Status || x.DocStatus || '',
          }));
        }
      } catch (_) {}
    }

    // Final guard: always a 200 with {results:[]}
    return res.status(200).json({ results });
  } catch (err) {
    // Never surface a 500 to the browser for a search miss
    return res.status(200).json({ results: [], error: err?.message || 'Search failed' });
  }
}
