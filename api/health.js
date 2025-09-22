// /api/health.js
export default async function handler(_req, res) {
  res.status(200).json({ ok: true, ts: new Date().toISOString() });
}
