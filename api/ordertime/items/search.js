// Replace your current listSearch with this:
async function listSearch({
  type, q, columns,
  sortProp = 'Id', dir = 'Asc',
  pageSize = 100, maxPages = 8,
  minHits = 50        // how many client-side matches before we stop scanning
}) {
  const needleRaw = String(q || '').trim();
  const needle = normalize(needleRaw);
  const tokens = needleRaw.toLowerCase().split(/\s+/).filter(Boolean).map(normalize);
  const seen = new Set();
  let merged = [];

  // server-side filters (best effort)
  for (const col of columns) {
    try {
      const rows = await listPage({
        type,
        filters: [contains(col, needleRaw)],
        sortProp, dir, page: 1, size: pageSize
      });
      for (const r of rows) if (!seen.has(r.Id)) { seen.add(r.Id); merged.push(r); }
    } catch (e) {
      console.warn('listSearch filter skipped:', type, col, e?.message || e);
    }
  }

  // tokenized client-side match (handles "iphone 14" vs "iphone14", punctuation, etc.)
  const matches = (row) => {
    for (const c of columns) {
      const v = c.split('.').reduce((a,k)=>a?.[k], row);
      if (typeof v !== 'string') continue;
      const nv = normalize(v);
      if (nv.includes(needle)) return true;
      if (tokens.length > 1 && tokens.every(t => nv.includes(t))) return true;
    }
    return false;
  };

  const filtered = merged.filter(matches);
  if (filtered.length) return filtered;

  // fallback: scan pages without filters and match client-side
  merged = [];
  for (let p = 1; p <= maxPages; p++) {
    let rows = [];
    try {
      rows = await listPage({ type, filters: [], sortProp, dir, page: p, size: pageSize });
    } catch (e) {
      console.warn('listSearch fallback page', p, 'failed for', type, e?.message || e);
      break; // stop scanning on hard OT errors
    }
    if (!rows.length) break;
    for (const r of rows) if (matches(r)) merged.push(r);
    if (merged.length >= minHits) break;
  }
  return merged;
}
