// /api/ordertime/customers/search.js
import { otList } from '../../_ot';

export default async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);

    // See "Basic Object Types → ListInfo / FilterField" for these fields
    // Operator/FieldType accept enum names per docs.
    const listInfo = {
      Type: 'Customer',                 // RecordTypeEnum
      PageNumber: 1,
      NumberOfRecords: 50,
      Sortation: { PropertyName: 'Name', Direction: 'Asc' },
      Filters: [
        { PropertyName: 'Name',       FieldType: 'String', Operator: 'Contains', FilterValueArray: [q] },
        { PropertyName: 'Company',    FieldType: 'String', Operator: 'Contains', FilterValueArray: [q] },
        { PropertyName: 'Email',      FieldType: 'String', Operator: 'Contains', FilterValueArray: [q] },
        { PropertyName: 'Phone',      FieldType: 'String', Operator: 'Contains', FilterValueArray: [q] },
      ],
    };

    const r = await otList(listInfo);

    // Normalize just what the UI needs
    const out = (r?.Records || r || []).map(x => ({
      id: x.Id,
      name: x.Name || x.Company || '',
      email: x.Email || x.BillingEmail || '',
      phone: x.Phone || x.BillingPhone || '',
      billing: x.BillAddress || x.BillingAddress || null,
      shipping: x.ShipAddress || x.ShippingAddress || null,
    }));

    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: `API GET /ordertime/customers/search failed: ${String(err.message || err)}` });
  }
}
