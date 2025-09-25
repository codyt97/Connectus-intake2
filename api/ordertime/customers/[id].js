// /api/ordertime/customers/[id].js
const { getCustomerById } = require('../../_ot');

function pick(...vals){ for (const v of vals) if (v!==undefined && v!==null && String(v).trim()!=='') return v; return ''; }
function normAddr(src={}){
  return {
    company: pick(src.CompanyName, src.Name, src.company),
    contact: pick(src.Contact, src.Attention, src.contact),
    phone:   pick(src.Phone, src.phone),
    email:   pick(src.Email, src.email),
    street:  pick(src.Address1, src.Street, src.Line1, src.street),
    suite:   pick(src.Address2, src.Suite,  src.Line2, src.suite),
    city:    pick(src.City, src.city),
    state:   pick(src.State, src.Region, src.state),
    zip:     pick(src.PostalCode, src.Zip, src.zip),
    residence: !!(src.IsResidential || src.residence)
  };
}

module.exports = async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const raw = await getCustomerById(id);

    const billing  = normAddr(raw.BillingAddress  || raw.BillTo  || {});
    const shipping = normAddr(raw.ShippingAddress || raw.ShipTo  || {});

    res.status(200).json({
      id: raw.Id,
      company: pick(raw.CompanyName, raw.Name),
      billing,
      shipping,
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
      rep: { primary: pick(raw.PrimarySalesRep, raw.Rep1), secondary: pick(raw.SecondarySalesRep, raw.Rep2) },
      carrierRep: { name: pick(raw.CarrierRepName), email: pick(raw.CarrierRepEmail) }
    });
  } catch (e) {
    res.status(500).json({ error: 'Customer fetch failed: ' + (e.message || e) });
  }
};
