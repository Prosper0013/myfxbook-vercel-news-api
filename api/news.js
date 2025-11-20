const CACHE_SECONDS = parseInt(process.env.CACHE_SECONDS || "60", 10);
let cache = { ts: 0, data: null };

async function safeFetch(url, opts = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...opts,
      signal: controller.signal,
      credentials: "omit"
    });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function myfxLogin(email, password) {
  const loginUrl =
    `https://www.myfxbook.com/api/login.json?email=${encodeURIComponent(email)}` +
    `&password=${encodeURIComponent(password)}`;

  const res = await safeFetch(loginUrl, {
    method: "GET",
    headers: {
      "User-Agent": "myfxbook-vercel-news-api/1.0",
      "Accept": "application/json"
    }
  });

  if (!res.ok) throw new Error(`Login failed with status ${res.status}`);

  const j = await res.json();
  if (j.error) throw new Error("Login error: " + j.message);
  if (!j.session) throw new Error("No session returned from MyFXBook");

  return j.session;
}

async function myfxCalendar(session) {
  const url =
    `https://www.myfxbook.com/api/get-economic-calendar.json?session=${encodeURIComponent(session)}`;
  
  const res = await safeFetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "myfxbook-vercel-news-api/1.0",
      "Accept": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error(`Calendar fetch failed with status ${res.status}`);
  }

  return await res.json();
}

function filterCalendar(raw) {
  const items = raw.calendar || raw.data || raw;
  if (!Array.isArray(items)) return [];

  return items
    .filter(ev => {
      const impact = Number(ev.impact || ev.impactLevel || 0);
      const currency = (ev.country || ev.currency || '').toUpperCase();
      return impact === 3 && (currency === "USD" || currency === "CAD");
    })
    .map(ev => ({
      currency: (ev.country || ev.currency || '').toUpperCase(),
      event: ev.title || ev.event || "",
      impact: 3,
      time: ev.datetime || ev.date || "",
    }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

module.exports = async function (req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");

    const now = Math.floor(Date.now() / 1000);

    if (cache.data && now - cache.ts < CACHE_SECONDS) {
      return res.status(200).send(JSON.stringify({
        cached: true,
        age: now - cache.ts,
        data: cache.data
      }));
    }

    const email = process.env.MYFX_EMAIL;
    const password = process.env.MYFX_PASSWORD;

    if (!email || !password) {
      return res
        .status(500)
        .send(JSON.stringify({ error: true, message: "Missing env vars" }));
    }

    const session = await myfxLogin(email, password);
    const raw = await myfxCalendar(session);
    const filtered = filterCalendar(raw);

    cache = { ts: now, data: filtered };

    return res.status(200).send(JSON.stringify({
      cached: false,
      data: filtered
    }));

  } catch (err) {
    return res.status(500).send(JSON.stringify({
      error: true,
      message: String(err)
    }));
  }
};
