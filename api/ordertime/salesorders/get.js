// /api/ordertime/salesorders/get.js
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const BASE   = process.env.OT_BASE_URL || 'https://services.ordertime.com/api';
  const APIKEY = process.env.OT_API_KEY;
  const EMAIL  = process.env.OT_EMAIL || '';
  const PASS   = process.env.OT_PASSWORD || '';
  const DEVKEY = process.env.OT_DEV_KEY || '';

  const docNo = (req.query.docNo || '').toString().trim();
  if (!docNo) return res.status(400).json({ error: 'docNo is required' });
  if (!APIKEY) return res.status(500).json({ error: 'Missing OT_API_KEY' });

  // ---- helpers ----
  const pick = (...vals) =>
    vals.find(v => v !== undefined && v !== null && String(v).trim() !== '') ?? '';

  const asJSON = (txt) => {
    try { return JSON.parse(txt); } catch { return null; }
  };

  const firstArray = (obj, keys) => {
    for (const k of keys) {
      const v = obj?.[k];
      if (Array.isArray(v)) return v;
    }
    // sometimes nested like { Data: { Lines: [...] } }
    for (const c of ['Data','data','Result','result','Payload','payload']) {
      const v = obj?.[c];
      if (v && typeof v === 'object') {
        for (const k of keys) {
          if (Array.isArray(v[k])) return v[k];
        }
      }
    }
    return [];
  };

  // ---- call OrderTime ----
  try {
    const url = `${BASE}/salesorder?docNo=${encodeURIComponent(docNo)}`;
    const headers = { ApiKey: APIKEY };
    if (EMAIL)  headers.Email = EMAIL;
    if (DEVKEY) headers.DevKey = DEVKEY;
    else if (PASS) headers.Password = PASS;

    const r = await fetch(url, { headers });
    const text = await r.text();
    const raw  = asJSON(text) ?? { errorText: text };

    if (!r.ok) {
      return res.status(r.status).json({
        error: 'OrderTime salesorder fetch failed',
        details: typeof raw === 'object' ? raw : { text }
      });
    }

    // unwrap if needed (some tenants return { Data: {...} })
    const so = raw?.Data ?? raw?.data ?? raw;

    // ---- normalize header ----
    const header = {
      docNo:        pick(so.DocNo, so.DocNumber, so.Number, so.DocRef),
      tranType:     pick(so.TranType, so.Type, so.TranTypeRef?.Id),
      date:         pick(so.Date, so.TxnDate, so.DocDate),
      status:       pick(so.Status, so.DocStatus),
      customerName: pick(so.CustomerName, so.CustomerRef?.Name),
      terms:        pick(so.TermRef?.Name, so.PaymentTerms),
      paymentMethod:pick(so.PaymentMethodRef?.Name, so.PaymentMethod),
      shipMethod:   pick(so.ShipMethodRef?.Name, so.ShipMethod),
      total:        pick(so.Total, so.GrandTotal, so.DocTotal),
    };

    // ---- normalize billing (uses BillAddress + PrimaryContact fallbacks) ----
    const billing = {
      company: pick(so.BillAddress?.CompanyName, header.customerName),
      contact: pick(
        so.BillToContact,
        (so.PrimaryContact?.FirstName && `${so.PrimaryContact?.FirstName} ${so.PrimaryContact?.LastName}`)
      ),
      phone:   pick(so.PrimaryContact?.Phone, so.BillAddress?.Phone),
      email:   pick(so.BillAddress?.Email, so.PrimaryContact?.Email),
      street:  pick(so.BillAddress?.Addr1),
      suite:   pick(so.BillAddress?.Addr2, so.BillAddress?.Addr3),
      city:    pick(so.BillAddress?.City),
      state:   pick(so.BillAddress?.State),
      zip:     pick(so.BillAddress?.Zip),
    };

    // ---- normalize shipping (PrimaryShipAddress) ----
    const shipping = {
      company: pick(so.PrimaryShipAddress?.CompanyName, header.customerName),
      contact: pick(so.ShipToContact),
      phone:   pick(so.PrimaryShipAddress?.Phone),
      email:   pick(so.PrimaryShipAddress?.Email),
      street:  pick(so.PrimaryShipAddress?.Addr1),
      suite:   pick(so.PrimaryShipAddress?.Addr2, so.PrimaryShipAddress?.Addr3),
      city:    pick(so.PrimaryShipAddress?.City),
      state:   pick(so.PrimaryShipAddress?.State),
      zip:     pick(so.PrimaryShipAddress?.Zip),
      residence: !!(so.PrimaryShipAddress?.IsResidential),
    };

    // ---- normalize lines ----
    const linesRaw = firstArray(so, ['Lines', 'Line', 'Items', 'Details']);
    const lines = linesRaw.map((ln, i) => ({
      lineNo:      pick(ln.LineNo, ln.LineNumber, i + 1),
      description: pick(ln.Description, ln.ItemDesc, ln.Item?.Description, ln.Name),
      model:       pick(ln.PartNo, ln.Model, ln.ManufacturerPartNo, ln.MfgPartNo),
      color:       pick(ln.Color, ln.Attributes?.Color),
      sku:         pick(ln.Item, ln.ItemRef?.Name, ln.ItemRef?.Id, ln.ItemNo),
      qty:         Number(pick(ln.Qty, ln.Quantity, ln.QtyOrdered, 1)) || 1,
      lteWifiBoth: pick(ln.NetworkType, ln.Attributes?.Network, ln.LTEWiFiBoth),
    }));

    return res.status(200).json({ header, billing, shipping, lines });
  } catch (err) {
    console.error('salesorders/get error', err);
    return res.status(500).json({ error: 'Normalize Sales Order failed' });
  }
}
