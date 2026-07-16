// Stores guide requests as GitHub issues so the live Vercel app does not need
// a database or an email service. Public users may submit; listing remains
// protected by the same manager passphrase used by /api/refresh.

const REQUEST_PREFIX = '[Guide Request]';
const REQUEST_MARKER = '<!-- inland-guide-request -->';
const VALID_TYPES = new Set(['Feature', 'Change', 'Problem', 'Other']);
const recentSubmissions = new Map();

function clean(value, maxLength) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function multiline(value, maxLength) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, maxLength);
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function requestIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return clean(Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '').split(',')[0], 80) || 'unknown';
}

function issueField(body, label) {
  const match = String(body || '').match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`));
  return match ? match[1].trim() : '';
}

async function github(path, options = {}) {
  const { GH_TOKEN, GH_REPO = 'hoodlover/InlandGuide' } = process.env;
  if (!GH_TOKEN) throw Object.assign(new Error('Request service is not configured (missing GH_TOKEN).'), { status: 500 });
  const response = await fetch(`https://api.github.com/repos/${GH_REPO}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'inland-guide-requests',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const permissionHint = response.status === 403
      ? ' Give GH_TOKEN Issues read/write permission.'
      : '';
    throw Object.assign(new Error(`${data.message || `GitHub responded ${response.status}.`}${permissionHint}`), { status: 502 });
  }
  return data;
}

async function submitRequest(req, res, body) {
  // A hidden field catches basic form bots without giving them useful feedback.
  if (body.website) return res.status(200).json({ ok: true });

  const type = VALID_TYPES.has(body.type) ? body.type : 'Other';
  const title = clean(body.title, 120);
  const details = multiline(body.details, 4000);
  const submittedBy = clean(body.submittedBy, 100) || 'Anonymous';
  const page = clean(body.page, 200) || '/';
  if (title.length < 4) return res.status(400).json({ error: 'Please add a short title.' });
  if (details.length < 10) return res.status(400).json({ error: 'Please tell us a little more about the request.' });

  const ip = requestIp(req);
  const now = Date.now();
  const last = recentSubmissions.get(ip) || 0;
  if (now - last < 30_000) return res.status(429).json({ error: 'Please wait a moment before sending another request.' });
  recentSubmissions.set(ip, now);

  const issue = await github('/issues', {
    method: 'POST',
    body: JSON.stringify({
      title: `${REQUEST_PREFIX} ${title}`,
      body: [
        REQUEST_MARKER,
        `**Type:** ${type}`,
        `**Submitted by:** ${submittedBy}`,
        `**Page:** ${page}`,
        '',
        '## Request',
        details,
      ].join('\n'),
    }),
  });

  return res.status(201).json({ ok: true, id: issue.number });
}

async function listRequests(res, body) {
  if (!body.passphrase || body.passphrase !== process.env.REFRESH_PASSPHRASE) {
    return res.status(401).json({ error: 'Wrong passphrase.' });
  }
  const issues = await github('/issues?state=all&per_page=100&sort=created&direction=desc');
  const requests = issues
    .filter(issue => !issue.pull_request && issue.title.startsWith(REQUEST_PREFIX) && issue.body?.includes(REQUEST_MARKER))
    .map(issue => {
      const bodyText = issue.body.replace(REQUEST_MARKER, '').trim();
      return {
        id: issue.number,
        title: issue.title.slice(REQUEST_PREFIX.length).trim(),
        type: issueField(bodyText, 'Type'),
        submittedBy: issueField(bodyText, 'Submitted by'),
        page: issueField(bodyText, 'Page'),
        details: bodyText.split('## Request')[1]?.trim() || bodyText,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        state: issue.state,
        url: issue.html_url,
      };
    });
  return res.status(200).json({ ok: true, requests });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = parseBody(req);
  try {
    if (body.action === 'list') return await listRequests(res, body);
    return await submitRequest(req, res, body);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Request service failed.' });
  }
};
