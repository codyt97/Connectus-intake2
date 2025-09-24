import { searchCustomersByName } from '../../_ot';
export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).end();
  const { q='', page='1', take='25' } = req.query;
  if(!q.trim()) return res.status(400).json({ error: 'Missing ?q' });
  try{
    const rows = await searchCustomersByName(q.trim(), +page, +take);
    const items = rows.map(x => ({
      id: x.Id,
      name: x.Name,
      email: x.Email ?? null,
      phone: x.Phone ?? null,
      isActive: x.IsActive ?? true,
    }));
    res.json({ items });
  }catch(e){ console.error(e); res.status(500).json({ error:'Customer search failed' }); }
}
