// /api/ordertime/customers/[id].js
import { getCustomerById } from '../../_ot';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing :id' });

    const data = await getCustomerById(id); // returns normalized object
    res.status(200).json(data);
  } catch (err) {
    console.error('customers/[id]', err);
    res.status(500).json({ error: String(err.message || err) });
  }
}
