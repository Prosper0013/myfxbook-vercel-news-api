// Repository: myfxbook-vercel-news-api
// Files included below separated by comments.

/* ==================================================================
   File: api/news.js
   (Vercel Serverless Function - Node.js minimal, uses global fetch)
   ================================================================== */

// IMPORTANT: Set the following environment variables in Vercel Project Settings:
// MYFX_EMAIL  - your MyFXBook login email
// MYFX_PASSWORD - your MyFXBook password
// Optional: CACHE_SECONDS (default 60)

const CACHE_SECONDS = parseInt(process.env.CACHE_SECONDS || "60", 10);
let cache = { ts: 0, data: null };

// Helper: safe fetch with timeout
async function safeFetch(url, opts = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// Login to MyFXBook and return session string
async function myfxLogin(email, password) {
  const loginUrl = `https://www.myfxbook.com/api/login.json?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
  const res = await safeFetch(loginUrl, { method: 'GET', headers: { 'User-Agent': 'myfxbook-vercel-news-api/1.0' } });
  if (!res.ok) throw new Error(`Login failed with status ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(`MyFXBook login error: ${j.message || JSON.stringify(j)}`);
  if (!j.session) throw new Error('MyFXBook did not return a session string');
  return j.session;
}

// Fetch calendar using a session id
async function myfxCalendar(session) {
  const url = `https://www.myfxbook.com/api/get-economic-calendar.json?session=${encodeURIComponent(session)}`;
  const res = await safeFetch(url, { method: 'GET', headers: { 'User-Agent': 'myfxbook-vercel-news-api/1.0' } });
  if (!res.ok) throw new Error(`Calendar fetch failed with status ${res.status}`);
  const j = await res.json();
  return j;
}

// Convert MyFXBook calendar to compact filtered JSON
function filterCalendar(raw) {
  // MyFXBook calendar structure may vary; try to be defensive.
  const items = raw.calendar || raw.data || raw;
  if (!Array.isArray(items)) return [];

  const wanted = items
    .filter(ev => {
      // impact sometimes appears as number or string
      const impact = Number(ev.impact || ev.impactLevel || ev.impact_id || 0);
      const currency = (ev.country || ev.currency || ev.symbol || '').toString().toUpperCase();
      return impact === 3 && (currency === 'USD' || currency === 'CAD');
    })
    .map(ev => {
      // Standardize fields
      const currency = (ev.country || ev.currency || ev.symbol || '').toString().toUpperCase();
      // MyFXBook uses date strings in many formats; attempt to normalize
      const rawTime = ev.datetime || ev.date || ev.time || ev.localTime || ev.utc || ev.timestamp || ev.start;
      // Try common formats; if already ISO-like use as-is
      const time = rawTime ? rawTime.toString() : null;
      return {
        currency: currency,
        event: (ev.title || ev.event || ev.name || ev.title_text || ev.headline || '').toString(),
        impact: Number(ev.impact || ev.impactLevel || 3),
        time: time,
        raw: ev
      };
    })
    // sort by time if possible (strings that are comparable), otherwise keep API order
    .sort((a,b) => {
      if(!a.time || !b.time) return 0;
      return a.time.localeCompare(b.time);
    });

  return wanted;
}

// Vercel serverless handler
module.exports = async function handler(req, res) {
  try {
    // Simple CORS - allow from anywhere (your EA will call it)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Content-Type', 'application/json');

    // Serve from cache when fresh
    const now = Math.floor(Date.now() / 1000);
    if (cache.data && (now - cache.ts) < CACHE_SECONDS) {
      return res.status(200).send(JSON.stringify({ cached: true, age: now - cache.ts, data: cache.data }));
    }

    const email = process.env.MYFX_EMAIL;
    const password = process.env.MYFX_PASSWORD;
    if (!email || !password) {
      return res.status(500).send(JSON.stringify({ error: true, message: 'Missing MYFX_EMAIL or MYFX_PASSWORD environment variables' }));
    }

    // Login
    const session = await myfxLogin(email, password);

    // Fetch calendar
    const raw = await myfxCalendar(session);

    // Filter for high impact USD/CAD
    const filtered = filterCalendar(raw);

    // Save cache
    cache = { ts: now, data: filtered };

    return res.status(200).send(JSON.stringify({ cached: false, age: 0, data: filtered }));
  } catch (err) {
    // On error, if we have cached data, return it with error flag
    if (cache.data) {
      return res.status(200).send(JSON.stringify({ cached: true, age: Math.floor(Date.now()/1000) - cache.ts, data: cache.data, warning: 'Returned cached data due to error', error: String(err) }));
    }
    return res.status(500).send(JSON.stringify({ error: true, message: String(err) }));
  }
};