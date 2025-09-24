// /api/ordertime/items/search.js

// Env vars (supports both OT_* and ORDERTIME_* names)
 const BASE = (process.env.OT_BASE_URL || process.env.ORDERTIME_BASE_URL || 'https://services.ordertime.com')
.replace(/\/+$/, '')         // trim trailing slash
.replace(/\/api$/i, '');      // also trim a trailing /api if present

const API_KEY  = process.env.OT_API_KEY  || process.env.ORDERTIME_API_KEY || '';
const EMAIL    = process.env.OT_EMAIL    || process.env.ORDERTIME_EMAIL   || '';
const PASSWORD = process.env.OT_PASSWORD || process.env.ORDERTIME_PASSWORD|| '';

// keep an in-memory session cookie so we don’t log in on every request
let sessionCookie = null;
let cookieExpiresAt = 0;

async function loginIfNeeded() {
  if (API_KEY) return null;                  // using API key path; no cookie needed
  if (sessionCookie && Date.now() < cookieExpiresAt) return sessionCookie;

  if (!EMAIL || !PASSWORD) {
    throw new Error('Missing OT_EMAIL / OT_PASSWORD (or provide OT_API_KEY).');
  }

  const r = await fetch(`${BASE}/api/Account/Login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });

  if (!r.ok) {
    const body = await r.text();
    throw new Error(`login failed ${r.status}: ${body}`);
  }

  const setCookie = r.headers.get('set-cookie');
  if (!setCookie) throw new Error('login succeeded but no Set-Cookie returned');

  // OT typically returns .AspNet.ApplicationCookie or .AspNetCore.Identity.Application
  sessionCookie = setCookie.split(',')[0].split(';')[0];
  cookieExpiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes
  return sessionCookie;
}

function commonHeaders(extra = {}) {
  const base = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (API_KEY) {
    // OT accepts either header; send both, plus query param below.
    return { ...base, apikey: API_KEY, 'x-apikey': API_KEY, ...extra };
  }
  return { ...base, ...extra };
}

async function callList(body) {
  const cookie = await loginIfNeeded();
  const url = `${BASE}/api/list${API_KEY ? `?apikey=${encodeURIComponent(API_KEY)}` : ''}`;

  const headers = cookie
    ? commonHeaders({ Cookie: cookie })
    : commonHeaders();

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(`OrderTime /api/list failed ${res.status}: ${JSON.stringify(data)}`);
  }
  return data.Data || data.data || [];
}

export default async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Missing q' });

    const tokens = q.split(/\s+/).filter(Boolean);

    const makeBody = (vals) => ({
      Type: 'PartItem',
      ListOptions: {
        Page: 1,
        PageSize: 50,
        // AND across tokens (Description like token1 AND token2 ...)
        Filters: vals.map(v => ({ Field: 'Description', Operator: 'like', Value: v })),
        Columns: ['ID', 'ItemNumber', 'Name', 'Description', 'ManufacturerPartNo', 'UPCCode', 'SKU'],
        Sort: [{ Field: 'Description', Direction: 'Asc' }]
      }
    });

    // Pass 1: AND all tokens
    let results = await callList(makeBody(tokens));

    // Pass 2: OR across tokens if AND returns nothing
    if (!results.length && tokens.length > 1) {
      const chunks = await Promise.all(tokens.map(t => callList(makeBody([t])).catch(() => [])));
      const dedup = new Map();
      for (const item of chunks.flat()) {
        const key = item.ID ?? item.ItemID ?? item.ItemNumber ?? item.Id ?? item.id ?? JSON.stringify(item);
        if (!dedup.has(key)) dedup.set(key, item);
      }
      results = [...dedup.values()];
    }

    res.status(200).json({ items: results });
  } catch (err) {
    console.error('items/search error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
}
