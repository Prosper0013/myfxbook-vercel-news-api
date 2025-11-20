// api/news.js
const CACHE_SECONDS = 30 * 60; // 30 minutes
let cache = { ts: 0, data: null };

async function safeFetch(url) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 10000);
    try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        clearTimeout(id);
        throw err;
    }
}

// Filter for high-impact USD/CAD news
function filterNews(data) {
    return data
        .filter(ev => ev.impact === 3 && (ev.country === "USD" || ev.country === "CAD"))
        .map(ev => ({
            currency: ev.country,
            event: ev.title,
            impact: ev.impact,
            date: ev.date
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = async function (req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");

    const now = Date.now() / 1000;
    if (cache.data && now - cache.ts < CACHE_SECONDS) {
        return res.status(200).send(JSON.stringify({ cached: true, data: cache.data }));
    }

    try {
        const raw = await safeFetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json");
        const filtered = filterNews(raw);
        cache = { ts: now, data: filtered };
        return res.status(200).send(JSON.stringify({ cached: false, data: filtered }));
    } catch (err) {
        if (cache.data) {
            return res.status(200).send(JSON.stringify({
                cached: true,
                warning: "Returned cached data due to fetch error",
                data: cache.data
            }));
        }
        return res.status(500).send(JSON.stringify({ error: true, message: err.toString() }));
    }
};
