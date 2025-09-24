import { searchItemsByText } from '../../_ot';
export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).end();
  const { q='', page='1', take='25' } = req.query;
  if(!q.trim()) return res.status(400).json({ error:'Missing ?q' });
  try{
    const rows = await searchItemsByText(q.trim(), +page, +take);
    const items = rows.map(x => ({
      id: x.Id,
      type: x.RecordTypeName || x.__type || null, // optional
      name: x.Name,
      sku: x.ItemNumber ?? x.Number ?? null,
      uom: x.UomRef?.Name ?? null,
      stdPrice: x.StdPrice ?? null,
      isActive: x.IsActive ?? true,
    }));
    res.json({ items });
  }catch(e){ console.error(e); res.status(500).json({ error:'Item search failed' }); }
}
