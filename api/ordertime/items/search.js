// /api/ordertime/items/search.js
import { searchPartItems } from '../../_ot';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { q = '', take = '50' } = req.query;
    if (!q.trim()) return res.status(400).json({ error: 'Missing query ?q=' });

    const items = await searchPartItems(q.trim(), take);
    return res.status(200).json(items);
  } catch (err) {
    console.error('items/search error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
export async function searchPartItems(q, take = 50) {
  assertEnv();
  const body = {
    Type: 115,                // Items
    NumberOfRecords: Number(take) || 50,
    PageNumber: 1,
    SortOrder: { PropertyName: 'Name', Direction: 1 },
    Filters: [
      { PropertyName: 'Name',              Operator: 12, FilterValueArray: q },
      { PropertyName: 'Description',       Operator: 12, FilterValueArray: q },
      { PropertyName: 'ManufacturerPartNo',Operator: 12, FilterValueArray: q },
      { PropertyName: 'UPC',               Operator: 12, FilterValueArray: q },
    ],
  };
  const out = await tryPost('/list', body);
  if (!out.ok) throw new Error(`/list ${out.status}: ${out.text.slice(0,180)}`);
  const rows = normalizeListResult(out.json) || (out.json?.List ?? []);
  return rows.map(r => ({
    id:   r.Id ?? r.ID ?? r.id,
    name: r.Name ?? r.name ?? '',
    description: r.Description ?? '',
    mfgPartNo:   r.ManufacturerPartNo ?? '',
    upc:         r.UPC ?? '',
    uom:         r.UomRef?.Name ?? r.uom ?? '',
    price:       r.Price ?? r.price ?? null,
  }));
}
