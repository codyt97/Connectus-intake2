import { searchSalesOrders } from '../../_ot';
export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).end();
  const { q='', customer='', page='1', take='25' } = req.query;
  if(!q && !customer) return res.status(400).json({ error:'Provide ?q or ?customer' });
  try{
    const rows = await searchSalesOrders({ q:q||undefined, customer:customer||undefined, page:+page, take:+take });
    const items = rows.map(x => ({
      id: x.Id ?? x.DocNo,
      docNo: x.DocNo,
      date: x.Date ?? x.Doc?.Date ?? null,
      customer: x.CustomerRef?.Name ?? null,
      status: x.StatusRef?.Name ?? null,
      total: x.TotalAmount ?? null,
    }));
    res.json({ items });
  }catch(e){ console.error(e); res.status(500).json({ error:'Sales order search failed' }); }
}
