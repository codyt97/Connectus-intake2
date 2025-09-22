// api/ordertime/salesorders/search.js
import { tryPost } from '../../_ot';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { q = '', take = '50' } = req.query;
    if (!q.trim()) return res.status(400).json({ error: 'Missing query ?q=' });

    const body = {
      // Confirm the correct Type for your tenant’s Sales Order header
      Type: 130, // <-- often SO header; some tenants use 135—adjust if needed
      NumberOfRecords: Number(take) || 50,
      PageNumber: 1,
      SortOrder: { PropertyName: 'DocNo', Direction: 1 },
      Filters: [
        { PropertyName: 'DocNo',        Operator: 12, FilterValueArray: q },
        { PropertyName: 'CustomerName', Operator: 12, FilterValueArray: q },
        { PropertyName: 'Status',       Operator: 12, FilterValueArray: q },
      ],
    };

    const out = await tryPost('/list', body);
    if (!out.ok) throw new Error(out.text);

    const rows = (out.json && (out.json.Items || out.json.List)) || normalizeListResult(out.json);
    const results = rows.map(r => ({
      id: r.Id ?? r.ID,
      docNo: r.DocNo ?? r.DocumentNo ?? r.DocNumber,
      customer: r.CustomerName ?? r.Customer ?? '',
      status: r.Status ?? '',
      date: r.DocDate ?? r.Date ?? '',
      total: r.Total ?? r.GrandTotal ?? null,
    }));

    res.status(200).json({ results });
  } catch (err) {
    console.error('salesorders/search failed:', err);
    res.status(500).json({ error: 'Sales order search failed' });
  }
}
