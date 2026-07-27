// Vercel serverless function: emails submitted US rail-cut results to QS Rail.
//
// Required env var (Vercel > Project > Settings > Environment Variables):
//   FORWARD_EMAIL_ALIAS_PASSWORD
//     Generated alias password for ERD@hapagidt.com. Keep this server-side only.

const FORWARD_EMAIL_API = 'https://api.forwardemail.net/v1/emails';
const FROM_ADDRESS = 'erd@hapagidt.com';
const TO_ADDRESS = 'QSCRail@hlag.com';
const SUBJECT_PREFIX = 'ERD Cutoff Form has been submitted Booking ';
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
const RATE_LIMIT_MS = 10 * 1000;

// Best-effort protection for repeat clicks handled by the same warm function.
// The browser also suppresses repeat submissions for the same booking/results.
const recentSubmissions = new Map();
const recentIps = new Map();

function clean(value, maxLength) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function cleanText(value, maxLength) {
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

function purgeExpired(map, now, maxAge) {
  for (const [key, at] of map) {
    if (now - at > maxAge) map.delete(key);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const password = String(
    process.env.FORWARD_EMAIL_ALIAS_PASSWORD || process.env.FORWARD_EMAIL_PASSWORD || ''
  ).trim();
  if (!password) {
    return res.status(500).json({ error: 'Rail email is not configured yet.' });
  }

  const body = parseBody(req);
  const bookingNumber = clean(body.bookingNumber, 50);
  const text = cleanText(body.text, 6000);

  if (bookingNumber.length < 3) {
    return res.status(400).json({ error: 'A booking number is required to email QS Rail.' });
  }
  const expectedLines = [
    'Here are the ramp cuts you requested:',
    'Earliest Return Date (ERD):',
    'Latest Return Date (LRD):',
    'Ramp Cut Time:',
    'FCL Cut:',
  ];
  if (!expectedLines.every(line => text.includes(line))) {
    return res.status(400).json({ error: 'The rail-cut results are incomplete.' });
  }

  const now = Date.now();
  const ip = requestIp(req);
  const submissionKey = `${bookingNumber.toUpperCase()}|${text}`;
  purgeExpired(recentSubmissions, now, DUPLICATE_WINDOW_MS);
  purgeExpired(recentIps, now, RATE_LIMIT_MS);

  if (recentSubmissions.has(submissionKey)) {
    return res.status(200).json({ ok: true, duplicate: true });
  }
  if (recentIps.has(ip)) {
    return res.status(429).json({ error: 'Please wait a few seconds before sending another rail email.' });
  }
  recentIps.set(ip, now);

  const authorization = Buffer.from(`${FROM_ADDRESS}:${password}`, 'utf8').toString('base64');
  const message = new URLSearchParams({
    from: `Inland Cutoff Guide <${FROM_ADDRESS}>`,
    to: TO_ADDRESS,
    subject: `${SUBJECT_PREFIX}${bookingNumber}`,
    text,
  });

  try {
    const response = await fetch(FORWARD_EMAIL_API, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authorization}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: message.toString(),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.is_rejected) {
      console.error('[rail-email] Forward Email rejected submission:', response.status, result.message || result.status || 'unknown');
      return res.status(502).json({ error: 'Forward Email could not accept the rail-cut message.' });
    }

    recentSubmissions.set(submissionKey, now);
    return res.status(200).json({
      ok: true,
      status: result.status || 'queued',
      messageId: result.id || result.messageId || '',
    });
  } catch (error) {
    console.error('[rail-email] delivery request failed:', error.message);
    return res.status(502).json({ error: 'The rail-cut email service could not be reached.' });
  }
};
