// /api/ordertime/salesorders/search.js
import { otList } from '../../_ot';

export default async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    const base = {
      Type: 'SalesOrder',
      PageNumber: 1,
      NumberOfRecords: 50,
      Sortation: { PropertyName: 'DocNumber', Direction: 'Desc' },
      // IncludeLineItems could be set true later when you need it
    };

    const [byDoc, byCust] = await Promise.all([
      otList({
        ...base,
        Filters: [{ PropertyName: 'DocNumber', FieldType: 'String', Operator: 'Contains', FilterValueArray: [q] }],
      }),
      otList({
        ...base,
        // NB: CustomerRef.Name is supported for list filtering on Sales Orders
        Filters: [{ PropertyName: 'CustomerRef.Name', FieldType: 'String', Operator: 'Contains', FilterValueArray: [q] }],
      }),
    ]);

    const rows = [...(byDoc?.Records || byDoc || []), ...(byCust?.Records || byCust || [])];
    const seen = new Set();
    const out = rows
      .filter(r => (seen.has(r.Id) ? false : (seen.add(r.Id), true)))
      .map(r => ({
        id: r.Id,
        docNo: r.DocNumber || r.Number || r.DocNo || '',
        customer: r.CustomerRef?.Name || '',
        status: r.Status || r.DocStatus || '',
        date: r.TxnDate || r.Date || '',
      }));

    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: `API GET /ordertime/salesorders/search failed: ${String(err.message || err)}` });
  }
}
