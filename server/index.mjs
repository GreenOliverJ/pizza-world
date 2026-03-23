import http from 'node:http';
import { URL, fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT ?? 3003);
let GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// Load a simple `.env` file (no external deps) for local development.
// This keeps the API key out of the browser, while still allowing
// `npm run dev:places-api` to work after creating `.env`.
try {
  // Resolve `.env` relative to this file so it works no matter
  // what the current working directory is.
  const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      let value = line.slice(eqIdx + 1).trim();
      value = value.replace(/^['"]|['"]$/g, '');
      if (!key) continue;
      // Only override when the env var is missing or empty.
      // This avoids situations where an empty var exists in the environment.
      if (process.env[key] === undefined || process.env[key] === '') {
        process.env[key] = value;
      }
    }
  }
} catch {
  // Ignore; missing .env is fine if GOOGLE_PLACES_API_KEY is already set.
}

// Re-read in case `.env` was loaded above.
GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(body));
}

function sendCorsPreflight(res) {
  res.statusCode = 204;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end();
}

function parseNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function fetchGoogleNearbyPizzerias({ lat, lng, radius, max }) {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error('Missing GOOGLE_PLACES_API_KEY env var');
  }

  // Nearby Search with `keyword=pizzeria` tends to return pizzeria/restaurant results.
  // Docs: https://developers.google.com/maps/documentation/places/web-service/search-nearby
  const googleUrl = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
  googleUrl.searchParams.set('location', `${lat},${lng}`);
  googleUrl.searchParams.set('radius', String(radius));
  googleUrl.searchParams.set('keyword', 'pizzeria');
  googleUrl.searchParams.set('type', 'restaurant');
  googleUrl.searchParams.set('key', GOOGLE_PLACES_API_KEY);

  // Note: We intentionally omit pagination (`next_page_token`) to keep this simple.
  // This endpoint returns the first page of results only.

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    let resp;
    try {
      resp = await fetch(googleUrl, { signal: controller.signal });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to reach Google Places: ${message}`);
    }
    const data = await resp.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      const msg = data.error_message ? `: ${data.error_message}` : '';
      throw new Error(`Google Places error (${data.status})${msg}`);
    }

    const results = Array.isArray(data.results) ? data.results : [];

    const normalized = results
      .map((r) => {
        const id = r.place_id;
        const name = r.name;
        const location = r.geometry?.location;

        const latNum = Number(location?.lat);
        const lngNum = Number(location?.lng);

        if (!id || !name || !Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;

        const ratingNum = typeof r.rating === 'number' ? r.rating : Number(r.rating);
        const reviewCountNum =
          typeof r.user_ratings_total === 'number'
            ? r.user_ratings_total
            : Number(r.user_ratings_total);

        const address =
          typeof r.vicinity === 'string'
            ? r.vicinity
            : typeof r.formatted_address === 'string'
              ? r.formatted_address
              : '';

        return {
          id: String(id),
          country: '',
          city: '',
          pizzeria: String(name),
          pizzaName: String(name),
          lat: latNum,
          lng: lngNum,
          source: 'seed',
          rating: Number.isFinite(ratingNum) ? ratingNum : undefined,
          reviewCount: Number.isFinite(reviewCountNum) ? reviewCountNum : undefined,
          address
        };
      })
      .filter(Boolean);

    // Rank “best” by rating (desc), then review count (desc).
    normalized.sort((a, b) => {
      const ar = a.rating ?? 0;
      const br = b.rating ?? 0;
      if (br !== ar) return br - ar;
      const ac = a.reviewCount ?? 0;
      const bc = b.reviewCount ?? 0;
      return bc - ac;
    });

    return normalized.slice(0, max);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGoogleTextSearchPizzerias({ query, lat, lng, radius, max }) {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error('Missing GOOGLE_PLACES_API_KEY env var');
  }

  const trimmed = String(query ?? '').trim();
  if (!trimmed) return [];

  // If user didn't mention pizza explicitly, bias towards pizzerias.
  const qLower = trimmed.toLowerCase();
  const googleQuery =
    /pizza|pizzeria/.test(qLower) ? trimmed : `${trimmed} pizza`;

  // Docs: https://developers.google.com/maps/documentation/places/web-service/search-text
  const googleUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  googleUrl.searchParams.set('query', googleQuery);
  googleUrl.searchParams.set('type', 'restaurant');
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    googleUrl.searchParams.set('location', `${lat},${lng}`);
    googleUrl.searchParams.set('radius', String(radius));
  }
  googleUrl.searchParams.set('key', GOOGLE_PLACES_API_KEY);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    let resp;
    try {
      resp = await fetch(googleUrl, { signal: controller.signal });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to reach Google Places: ${message}`);
    }

    const data = await resp.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      const msg = data.error_message ? `: ${data.error_message}` : '';
      throw new Error(`Google Places error (${data.status})${msg}`);
    }

    const results = Array.isArray(data.results) ? data.results : [];

    const normalized = results
      .map((r) => {
        const id = r.place_id;
        const name = r.name;
        const location = r.geometry?.location;

        const latNum = Number(location?.lat);
        const lngNum = Number(location?.lng);

        if (!id || !name || !Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;

        const ratingNum = typeof r.rating === 'number' ? r.rating : Number(r.rating);
        const reviewCountNum =
          typeof r.user_ratings_total === 'number'
            ? r.user_ratings_total
            : Number(r.user_ratings_total);

        const address =
          typeof r.formatted_address === 'string'
            ? r.formatted_address
            : (typeof r.vicinity === 'string' ? r.vicinity : '');

        return {
          id: String(id),
          country: '',
          city: '',
          pizzeria: String(name),
          pizzaName: String(name),
          lat: latNum,
          lng: lngNum,
          source: 'seed',
          rating: Number.isFinite(ratingNum) ? ratingNum : undefined,
          reviewCount: Number.isFinite(reviewCountNum) ? reviewCountNum : undefined,
          address
        };
      })
      .filter(Boolean);

    normalized.sort((a, b) => {
      const ar = a.rating ?? 0;
      const br = b.rating ?? 0;
      if (br !== ar) return br - ar;
      const ac = a.reviewCount ?? 0;
      const bc = b.reviewCount ?? 0;
      return bc - ac;
    });

    return normalized.slice(0, max);
  } finally {
    clearTimeout(timeout);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) return sendJson(res, 404, { error: 'Not found' });

    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const method = req.method ?? 'GET';

    if (method === 'OPTIONS') return sendCorsPreflight(res);
    if (method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });

    if (url.pathname === '/health') {
      return sendJson(res, 200, { ok: true });
    }

    if (url.pathname === '/api/best-pizzerias') {
      const lat = parseNumber(url.searchParams.get('lat'), NaN);
      const lng = parseNumber(url.searchParams.get('lng'), NaN);
      const radius = parseNumber(url.searchParams.get('radius'), 20000);
      const max = Math.max(1, Math.min(parseNumber(url.searchParams.get('max'), 20), 60));

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return sendJson(res, 400, { error: 'lat and lng are required and must be numbers' });
      }

      const spots = await fetchGoogleNearbyPizzerias({ lat, lng, radius, max });
      return sendJson(res, 200, { spots });
    }

    if (url.pathname === '/api/search-pizzerias') {
      const q = url.searchParams.get('query') ?? '';
      const lat = parseNumber(url.searchParams.get('lat'), NaN);
      const lng = parseNumber(url.searchParams.get('lng'), NaN);
      const radius = parseNumber(url.searchParams.get('radius'), 20000);
      const max = Math.max(1, Math.min(parseNumber(url.searchParams.get('max'), 20), 60));

      if (!String(q).trim()) {
        return sendJson(res, 400, { error: 'query is required' });
      }

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return sendJson(res, 400, { error: 'lat and lng are required and must be numbers' });
      }

      const spots = await fetchGoogleTextSearchPizzerias({
        query: q,
        lat,
        lng,
        radius,
        max
      });
      return sendJson(res, 200, { spots });
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown server error';
    return sendJson(res, 500, { error: message });
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[places-proxy] Listening on http://localhost:${PORT}`);
});

