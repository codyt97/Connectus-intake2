// 1) Resolve Id via /list (DocNo resolution: multi-type, multi-field, multi-value, eq+like, scalar+array)
const TYPES = [130, 135, 131, 140, 7]; // broaden: sales docs used by different tenants
const F_DOC = ['DocNo', 'DocumentNo', 'DocNumber', 'Number', 'RefNo', 'RefNumber', 'DocNoDisplay'];
const F_ID  = ['Id', 'ID', 'id'];

// Build candidate display-numbers: raw and likely SO-prefixed forms
const tryVals = (() => {
  const raw = String(docNo).trim();
  const out = new Set([raw]);
  // common prefixes people see in UI
  if (!/^SO[-\s]/i.test(raw)) {
    out.add(`SO-${raw}`);
    out.add(`SO ${raw}`);
  }
  // sometimes zero-padded (try a few)
  if (/^\d+$/.test(raw)) {
    const n = raw.length;
    for (const w of [6, 7, 8]) if (w > n) out.add(raw.padStart(w, '0'));
  }
  return [...out];
})();

let found = null;
resolveLoop:
for (const TYPE of TYPES) {
  for (const asArray of [false, true]) {
    for (const op of [0, 12]) { // 0 = equals, 12 = contains
      for (const candidate of tryVals) {
        // Build filters for all possible DocNo field names
        const fv = asArray ? [candidate] : candidate;
        const Filters = F_DOC.map(p => ({ PropertyName: p, Operator: op, FilterValueArray: fv }));

        const body = {
          Type: TYPE,
          NumberOfRecords: 1,
          PageNumber: 1,
          SortOrder: { PropertyName: F_DOC[0], Direction: 1 },
          Filters
        };

        const out = await post('/list', body);
        if (!out.ok) continue;

        const rows = normalizeListResult(out.json);
        if (rows && rows.length) {
          found = { TYPE, row: rows[0] };
          break resolveLoop;
        }
      }
    }
  }
}

if (!found) {
  return res.status(404).json({ error: `DocNo not found: ${docNo}` });
}

const id = F_ID.map(k => found.row?.[k]).find(Boolean);
if (!id) return res.status(404).json({ error: `No Id for DocNo ${docNo}` });

// then continue with your existing step 2) /document/get by Id (or the REST fallbacks)…
