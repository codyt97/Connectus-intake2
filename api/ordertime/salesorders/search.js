import { otList, like } from '../../_ot';

export default async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    const base = { Type: 'SalesOrder', Page: 1, Take: 50, SortParams: [{ PropertyName: 'DocNumber', SortDirection: 1 }] }; // 1 = Desc

    // run two separate filters then de-dupe
    const [byDoc, byCust] = await Promise.all([
      otList({ ...base, FilterParams: [like('DocNumber', q)] }),
      otList({ ...base, FilterParams: [like('CustomerRef.Name', q)] }), // OT supports dotted path here
    ]);

    const rows = [
      ...(Array.isArray(byDoc?.Records) ? byDoc.Records : Array.isArray(byDoc) ? byDoc : []),
      ...(Array.isArray(byCust?.Records) ? byCust.Records : Array.isArray(byCust) ? byCust : []),
    ];

    const seen = new Set();
    const out = rows
      .filter(r => (seen.has(r.Id) ? false : (seen.add(r.Id), true)))
      .map(r => ({
        id: r.Id,
        docNo: r.DocNumber || r.DocNo || r.Number || '',
        customer: r.CustomerRef?.Name || '',
        status: r.Status || r.DocStatus || '',
        date: r.TxnDate || r.Date || '',
      }));

    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: `API GET /ordertime/salesorders/search failed: ${err.message || err}` });
  }
}
