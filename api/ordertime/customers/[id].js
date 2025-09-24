// /api/ordertime/customers/[id].js  (CommonJS)
const { getCustomerById } = require('../../_ot');

function pick(...vals){ for(const v of vals){ if(v!==undefined && v!==null && String(v).trim()!=='') return v; } return ''; }

function normAddr(r, keyPrefix, obj){
  const A = obj || {};
  const pref = s => pick(A[s], r[`${keyPrefix}${s}`]);
  return {
    company: pick(A.CompanyName, A.Name, r.CompanyName, r.Name),
    contact: pick(A.Contact, A.Name, r[`${keyPrefix}Contact`]),
    phone:   pick(A.Phone, r[`${keyPrefix}Phone`]),
    email:   pick(A.Email, r[`${keyPrefix}Email`]),
    street:  pick(A.Addr2, A.Address1, r[`${keyPrefix}Address1`], r[`${keyPrefix}Street`]),
    suite:   pick(A.Addr3, A.Address2, r[`${keyPrefix}Address2`], r[`${keyPrefix}Suite`]),
    city:    pick(A.City,  r[`${keyPrefix}City`]),
    state:   pick(A.State, r[`${keyPrefix}State`]),
    zip:     pick(A.PostalCode, A.Zip, r[`${keyPrefix}PostalCode`], r[`${keyPrefix}Zip`])
  };
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing :id' });

    const raw = await getCustomerById(id);

    // OT often nests addresses; support both nested & flat
    const billing  = normAddr(raw, 'Billing',  raw.BillingAddress  || raw.Billing);
    const shipping = normAddr(raw, 'Shipping', raw.ShippingAddress || raw.ShipTo);

    const normalized = {
      id: raw.Id,
      company: pick(raw.CompanyName, raw.Name),
      billing,
      shipping: { ...shipping, residence: !!(raw.IsResidential || raw.ShipResidential) },
      payment: {
        method:   pick(raw.DefaultPaymentMethod, raw.PaymentMethod),
        terms:    pick(raw.PaymentTerms, raw.Terms),
        taxExempt: !!(raw.IsTaxExempt || raw.TaxExempt),
        agreement: !!raw.PurchaseAgreement
      },
      shippingOptions: {
        pay:       pick(raw.ShipPaymentMethod, raw.ShippingPaymentMethod),
        speed:     pick(raw.ShipSpeed, raw.ShippingSpeed),
        shortShip: pick(raw.ShortShipPolicy, raw.ShortShip)
      },
      carrierRep: { name: pick(raw.CarrierRepName), email: pick(raw.CarrierRepEmail) },
      rep:        { primary: pick(raw.PrimarySalesRep, raw.Rep1), secondary: pick(raw.SecondarySalesRep, raw.Rep2) }
    };

    res.status(200).json(normalized);
  } catch (err) {
    console.error('customers/[id]', err);
    res.status(500).json({ error: String(err.message || err) });
  }
};
