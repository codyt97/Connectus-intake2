// /api/ordertime/salesorders/get.js
//
// Get a Sales Order by *DocNo* (human number) in two steps:
//   1) Resolve internal Id via POST /list using tolerant filters
//      (multi-type, multi-field, equals/contains, scalar/array, SO- prefix & zero-padding).
//   2) Fetch the full document by Id via POST /document/get.
// Returns a normalized object your UI can apply directly.

import { tryPost, normalizeListResult } from '../../_ot';

// ---------- Safe JSON ----------
const safeJSON = (t) => { try { return JSON.parse(t); } catch { return null; } };

// ---------- Normalization (shape your UI expects) ----------
function normalizeSalesOrder(r) {
  const get = (o, p, d = '') => { try { return p.split('.').reduce((x, k) => x?.[k], o) ?? d; } catch { return d; } };

  const billing = {
    company: get(r, 'CustomerRef.Name') || get(r, 'CustomerName') || '',
    contact: get(r, 'BillTo.ContactName'),
    phone:   get(r, 'BillTo.Phone'),
    email:   get(r, 'BillTo.Email'),
    street:  get(r, 'BillTo.Address1'),
    suite:   get(r, 'BillTo.Address2'),
    city:    get(r, 'BillTo.City'),
    state:   get(r, 'BillTo.State'),
    zip:     get(r, 'BillTo.Zip'),
  };

  const shipping = {
    company: get(r, 'ShipTo.Company') || billing.company || '',
    contact: get(r, 'ShipTo.ContactName'),
    phone:   get(r, 'ShipTo.Phone'),
    email:   get(r, 'ShipTo.Email'),
    street:  get(r, 'ShipTo.Address1'),
    suite:   get(r, 'ShipTo.Address2'),
    city:    get(r, 'ShipTo.City'),
    state:   get(r, 'ShipTo.State'),
    zip:     get(r, 'ShipTo.Zip'),
    residence: !!get(r, 'ShipTo.Residential', false),
  };

  const customer = {
    id:    get(r, 'CustomerRef.Id') || get(r, 'CustomerId'),
    name:  get(r, 'CustomerRef.Name') || get(r, 'CustomerName'),
    po:    get(r, 'PONumber') || '',
    terms: get(r, 'Terms') || '',
  };

  const lines = (r?.Lines || r?.LineItems || []).map((L) => {
    const g = (p, d = '') => get(L, p, d);
    const qty = Number(g('Quantity', 0));
    const up  = Number(g('UnitPrice', 0));
    const ext = Number(g('Amount', qty * up));
    return {
      lineId:      g('LineId') || g('Id') || g('LineNo'),
      itemId:      g('ItemRef.Id') || g('ItemId') || g('Item.ID'),
      item:        g('ItemRef.Name') || g('ItemName') || '',
      sku:         g('ItemRef.Code') || g('ItemCode') || g('SKU') || '',
      description: g('Description') || '',
      qty,
      unitPrice:   up,
      extPrice:    ext,
      attributes: {
        carrier:     g('Custom.Carrier') || g('Carrier') || '',
        lteWifiBoth: g('Custom.LTE_WiFi_Both') || g('LTE_WiFi_Both') || '',
        condition:   g('Custom.New_CPO') || g('New_CPO') || '',
      },
    };
  });

  return {
    docNo:
      get(r, 'DocNo') ||
      get(r, 'DocumentNo') ||
      get(r, 'DocNumber') ||
      get(r, 'Number') ||
      get(r, 'RefNo') ||
      get(r, 'RefNumber') ||
      get(r, 'DocNoDisplay'),
    tranType: get(r, 'TranType') || '',
    customer,
    billing,
    shipping,
    lines,
  };
}

// ---------- DocNo → Id resolver using /list via tryPost (same auth as other routes) ----------
async function resolveIdByDocNo(docNo) {
  const TYPES = [130, 135, 131, 140, 7]; // common SO header-ish types
  const F_DOC = ['DocNo', 'DocumentNo', 'DocNumber', 'Number', 'RefNo', 'RefNumber', 'DocNoDisplay'];
  const F_ID  = ['Id', 'ID', 'id'];

  // Candidate values: raw, SO- prefixed, zero-padded numeric
  const candidates = (() => {
    const raw = String(docNo || '').trim();
    const set = new Set([raw]);
    if (raw && !/^SO[-\s]/i.test(raw)) {
      set.add(`SO-${raw}`);
      set.add(`SO ${raw}`);
    }
    if (/^\d+$/.test(raw)) {
      const n = raw.length;
      for (const w of [6, 7, 8]) if (w > n) set.add(raw.padStart(w, w));
    }
    return [...set];
  })();

  for (const TYPE of TYPES) {
    for (const asArray of [false, true]) {
      for (const op of [0, 12]) { // 0 = equals, 12 = contains
        for (const v of candidates) {
          const fv = asArray ? [v] : v;
          const Filters = F_DOC.map((p) => ({ PropertyName: p, Operator: op, FilterValueArray: fv }));
          const body = {
            Type: TYPE,
            NumberOfRecords: 1,
            PageNumber: 1,
            SortOrder: { PropertyName: F_DOC[0], Direction: 1 },
            Filters,
          };

          const out = await tryPost('/list', body);
          if (!out.ok) continue;

          const rows = normalizeListResult(out.json);
          if (rows && rows.length) {
            const row = rows[0];
            const id = F_ID.map((k) => row?.[k]).find(Boolean);
            if (id) return { id, TYPE, row };
          }
        }
      }
    }
  }
  return null;
}

// ---------- Route Handler ----------
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { docNo, debug } = req.query;
    if (!docNo) return res.status(400).json({ error: 'Missing ?docNo=' });

    // 1) Resolve internal Id for the provided DocNo
    const resolved = await resolveIdByDocNo(docNo);

    // Optional: debug probe to see what /list returns on your tenant
    if (!resolved && debug === '1') {
      const F_DOC = ['DocNo','DocumentNo','DocNumber','Number','RefNo','RefNumber','DocNoDisplay'];
      const candidates = [String(docNo), `SO-${docNo}`, `SO ${docNo}`];
      const Filters = F_DOC.flatMap(p => candidates.map(v => ({
        PropertyName: p, Operator: 12, FilterValueArray: [v]
      })));
      const probe = await tryPost('/list', { Type: 130, NumberOfRecords: 5, PageNumber: 1, Filters });
      return res.status(probe.ok ? 200 : 500).json({
        debug: true,
        request: { Type: 130, Filters },
        response: probe.json || probe.text,
      });
    }

    if (!resolved) return res.status(404).json({ error: `DocNo not found: ${docNo}` });

    const { id, TYPE } = resolved;

    // 2) Fetch full document by Id via /document/get
    const getRes = await tryPost('/document/get', { Type: TYPE, Id: id });
    if (getRes.ok && getRes.json) {
      const raw = Array.isArray(getRes.json) ? getRes.json[0] : getRes.json;
      return res.status(200).json({ ok: true, order: normalizeSalesOrder(raw) });
    }

    // If /document/get failed, surface its response
    return res.status(getRes.status || 502).json({
      error: `document/get failed ${getRes.status}: ${getRes.text?.slice?.(0, 300) || 'No body'}`,
    });
  } catch (e) {
    const msg = e?.stack ? `${e.message}\n${e.stack}` : String(e || 'Server error');
    return res.status(500).json({ error: msg });
  }
}
