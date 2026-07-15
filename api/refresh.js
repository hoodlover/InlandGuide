// Vercel serverless function: securely triggers the "Refresh CPKC port schedules"
// GitHub Action. The GitHub token and passphrase live in Vercel env vars, never in
// the browser bundle, so exposing this endpoint is safe.
//
// Required env vars (set in Vercel → Project → Settings → Environment Variables):
//   REFRESH_PASSPHRASE  the shared secret the app asks for
//   GH_TOKEN            a GitHub token with Actions read/write on the repo
// Optional overrides: GH_REPO (default "hoodlover/InlandGuide"),
//   GH_WORKFLOW ("refresh-cpkc.yml"), GH_REF ("main").
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const {
    REFRESH_PASSPHRASE,
    GH_TOKEN,
    GH_REPO = 'hoodlover/InlandGuide',
    GH_WORKFLOW = 'refresh-cpkc.yml',
    GH_REF = 'main',
  } = process.env;

  if (!REFRESH_PASSPHRASE || !GH_TOKEN) {
    res.status(500).json({ error: 'Server not configured (missing REFRESH_PASSPHRASE or GH_TOKEN).' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const passphrase = body && body.passphrase;

  if (!passphrase || passphrase !== REFRESH_PASSPHRASE) {
    res.status(401).json({ error: 'Wrong passphrase.' });
    return;
  }

  try {
    const gh = await fetch(
      `https://api.github.com/repos/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GH_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'icg-refresh',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: GH_REF }),
      }
    );
    if (gh.status === 204) {
      res.status(200).json({ ok: true });
      return;
    }
    const detail = (await gh.text()).slice(0, 300);
    const reasons = {
      401: 'GitHub token expired or was revoked.',
      403: 'GitHub token does not have Actions write permission.',
      404: 'Repository/workflow was not found, or the token cannot access it.',
      422: 'GitHub rejected the configured branch or workflow dispatch.',
    };
    res.status(502).json({
      error: reasons[gh.status] || `GitHub responded ${gh.status}.`,
      detail,
    });
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach GitHub', detail: String(err).slice(0, 300) });
  }
};
