// /api/ordertime/salesorders/search.js
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const qRaw = (req.query.q || '').toString().trim();
  if (!qRaw) return res.status(400).json({ error: 'q is required' });

  // Basic paging (optional)
  const page = Math.max(parseInt(req.query.page || '1', 10), 1);
  const take = Math.max(parseInt(req.query.take || '25', 10), 1);
  const skip = (page - 1) * take;

  const BASE   = process.env.OT_BASE_URL || 'https://services.ordertime.com/api';
  const APIKEY = process.env.OT_API_KEY;
  const EMAIL  = process.env.OT_EMAIL || '';
  const PASS   = process.env.OT_PASSWORD || '';
  const DEVKEY = process.env.OT_DEV_KEY || '';

  if (!APIKEY) return res.status(500).json({ error: 'Missing OT_API_KEY' });

  // Helper
  const pick = (...v) => v.find(x => x !== undefined && x !== null && String(x).trim() !== '') ?? '';

  // OrderTime list payload. We’ll search DocNo and CustomerName contains “q”
  const payload = {
    Take: take,
    Skip: skip,
    Sort: [{ Property: 'DocNo', Direction: 'Descending' }],
    Filters: [
      // Match DocNo or CustomerName like %q%
      {
        Property: 'DocNo',
        Operator: 'Contains',
        Value: qRaw
      },
      {
        Property: 'CustomerName',
        Operator: 'Contains',
        Value: qRaw
      }
    ],
    // Many tenants need Type (Sales Order header)
    // Common values are 130 or 135; include both as OR
    // If your tenant errors on OR groups, comment this out and keep the DocNo/CustomerName filters.
    FilterGroups: [
      {
        UseOr: true,
        Filters: [
          { Property: 'Type', Operator: 'Equals', Value: 130 },
          { Property: 'Type', Operator: 'Equals', Value: 135 }
        ]
      }
    ]
  };

  // Build headers
  const headers = { 'Content-Type': 'application/json', ApiKey: APIKEY };
  if (EMAIL)  headers.Email = EMAIL;
  if (DEVKEY) headers.DevKey = DEVKEY;
  else if (PASS) headers.Password = PASS;

  // Robust POST to /salesorder/list (fall back to /SalesOrder/list)
  async function postList(path) {
    const url = `${BASE.replace(/\/$/
