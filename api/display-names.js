// Public, read-only copy of the display-name overrides published by the
// Managers Hub. These are labels only; no routing or calculation data lives
// here. The local ERD Floater uses this endpoint to share the same names.
const names = require('../frontend/src/data/name-overrides.json');

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400');
  if (req.method === 'HEAD') {
    res.status(204).end();
    return;
  }
  res.status(200).json({ schema: 1, ...names });
};
