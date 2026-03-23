import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

const GOOGLE_PLACES_API_KEY = defineSecret('GOOGLE_PLACES_API_KEY');
const MIN_GOOGLE_RATING = 4.8;

function sendJson(res, statusCode, body) {
  res.status(statusCode);
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.send(JSON.stringify(body));
}

function parseNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getGoogleMapsUrl({ placeId, lat, lng }) {
  if (placeId) {
    return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(String(placeId))}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

function getPhotoProxyUrl(photoReference, maxwidth = 360) {
  if (!photoReference) return undefined;
  const params = new URLSearchParams({
    photoReference: String(photoReference),
    maxwidth: String(maxwidth)
  });
  return `/api/place-photo?${params.toString()}`;
}

async function fetchGoogleNearbyPizzerias({ apiKey, lat, lng, radius, max }) {
  const googleUrl = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
  googleUrl.searchParams.set('location', `${lat},${lng}`);
  googleUrl.searchParams.set('radius', String(radius));
  googleUrl.searchParams.set('keyword', 'pizzeria');
  googleUrl.searchParams.set('type', 'restaurant');
  googleUrl.searchParams.set('key', apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(googleUrl, { signal: controller.signal });
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
          typeof r.user_ratings_total === 'number' ? r.user_ratings_total : Number(r.user_ratings_total);
        const photoReference =
          Array.isArray(r.photos) && r.photos.length > 0 ? r.photos[0]?.photo_reference : undefined;
        const address =
          typeof r.vicinity === 'string'
            ? r.vicinity
            : (typeof r.formatted_address === 'string' ? r.formatted_address : '');

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
          address,
          mapsUrl: getGoogleMapsUrl({ placeId: id, lat: latNum, lng: lngNum }),
          photoUrl: getPhotoProxyUrl(photoReference)
        };
      })
      .filter(Boolean)
      .filter((s) => (s.rating ?? 0) >= MIN_GOOGLE_RATING);

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

async function fetchGoogleTextSearchPizzerias({ apiKey, query, lat, lng, radius, max }) {
  const trimmed = String(query ?? '').trim();
  if (!trimmed) return [];

  const qLower = trimmed.toLowerCase();
  const googleQuery = /pizza|pizzeria/.test(qLower) ? trimmed : `${trimmed} pizza`;

  const googleUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  googleUrl.searchParams.set('query', googleQuery);
  googleUrl.searchParams.set('type', 'restaurant');
  googleUrl.searchParams.set('location', `${lat},${lng}`);
  googleUrl.searchParams.set('radius', String(radius));
  googleUrl.searchParams.set('key', apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(googleUrl, { signal: controller.signal });
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
          typeof r.user_ratings_total === 'number' ? r.user_ratings_total : Number(r.user_ratings_total);
        const photoReference =
          Array.isArray(r.photos) && r.photos.length > 0 ? r.photos[0]?.photo_reference : undefined;
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
          address,
          mapsUrl: getGoogleMapsUrl({ placeId: id, lat: latNum, lng: lngNum }),
          photoUrl: getPhotoProxyUrl(photoReference)
        };
      })
      .filter(Boolean)
      .filter((s) => (s.rating ?? 0) >= MIN_GOOGLE_RATING);

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

export const api = onRequest(
  { region: 'us-central1', cors: true, secrets: [GOOGLE_PLACES_API_KEY] },
  async (req, res) => {
    try {
      if (req.method === 'OPTIONS') return res.status(204).send('');
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });

      const apiKey = GOOGLE_PLACES_API_KEY.value();
      if (!apiKey) return sendJson(res, 500, { error: 'Missing GOOGLE_PLACES_API_KEY secret' });

      const fullUrl = new URL(req.originalUrl, `https://${req.headers.host}`);
      const pathname = fullUrl.pathname;

      if (pathname === '/health') return sendJson(res, 200, { ok: true });

      if (pathname === '/api/best-pizzerias') {
        const lat = parseNumber(fullUrl.searchParams.get('lat'), NaN);
        const lng = parseNumber(fullUrl.searchParams.get('lng'), NaN);
        const radius = parseNumber(fullUrl.searchParams.get('radius'), 20000);
        const max = Math.max(1, Math.min(parseNumber(fullUrl.searchParams.get('max'), 20), 60));
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return sendJson(res, 400, { error: 'lat and lng are required and must be numbers' });
        }
        const spots = await fetchGoogleNearbyPizzerias({ apiKey, lat, lng, radius, max });
        return sendJson(res, 200, { spots });
      }

      if (pathname === '/api/search-pizzerias') {
        const q = fullUrl.searchParams.get('query') ?? '';
        const lat = parseNumber(fullUrl.searchParams.get('lat'), NaN);
        const lng = parseNumber(fullUrl.searchParams.get('lng'), NaN);
        const radius = parseNumber(fullUrl.searchParams.get('radius'), 20000);
        const max = Math.max(1, Math.min(parseNumber(fullUrl.searchParams.get('max'), 20), 60));
        if (!String(q).trim()) return sendJson(res, 400, { error: 'query is required' });
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return sendJson(res, 400, { error: 'lat and lng are required and must be numbers' });
        }
        const spots = await fetchGoogleTextSearchPizzerias({ apiKey, query: q, lat, lng, radius, max });
        return sendJson(res, 200, { spots });
      }

      if (pathname === '/api/place-photo') {
        const photoReference = fullUrl.searchParams.get('photoReference') ?? '';
        const maxwidth = Math.max(120, Math.min(parseNumber(fullUrl.searchParams.get('maxwidth'), 360), 1600));
        if (!photoReference.trim()) return sendJson(res, 400, { error: 'photoReference is required' });

        const photoUrl = new URL('https://maps.googleapis.com/maps/api/place/photo');
        photoUrl.searchParams.set('maxwidth', String(maxwidth));
        photoUrl.searchParams.set('photoreference', photoReference);
        photoUrl.searchParams.set('key', apiKey);

        const response = await fetch(photoUrl);
        if (!response.ok || !response.body) {
          return sendJson(res, response.status || 502, { error: 'Unable to fetch place photo' });
        }
        res.status(200);
        res.set('Cache-Control', 'public, max-age=3600');
        res.set('Content-Type', response.headers.get('content-type') ?? 'image/jpeg');
        const data = Buffer.from(await response.arrayBuffer());
        return res.send(data);
      }

      return sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown server error';
      return sendJson(res, 500, { error: message });
    }
  }
);

