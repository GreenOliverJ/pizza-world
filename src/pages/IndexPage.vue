<template>
  <q-page class="pizza-page q-pa-md">
    <div class="row q-col-gutter-md full-height">
      <div class="col-12 col-md-4">
        <q-card flat bordered class="glass-panel full-height">
          <q-card-section>
            <div class="text-h6 text-weight-bold">Best Pizza Finder</div>
            <div class="text-caption text-grey-4">Search by pizza, city, country or pizzeria</div>
          </q-card-section>

          <q-card-section class="q-pt-none">
            <q-input
              v-model="search"
              dark
              outlined
              dense
              clearable
              color="primary"
              label="Search pizza spots"
              placeholder="Naples, margherita, etc."
            >
              <template #prepend>
                <q-icon name="search" />
              </template>
            </q-input>

            <div
              v-if="googleSearchLoading && search.trim().length > 0"
              class="text-caption text-grey-4 q-mt-sm"
            >
              Searching Google...
            </div>
            <div v-else-if="googleSearchError" class="text-negative q-mt-sm text-caption">
              {{ googleSearchError }}
            </div>
          </q-card-section>

          <q-separator dark />

          <q-scroll-area style="height: 40vh">
            <q-list separator dark>
              <q-item
                v-for="spot in filteredSpots"
                :key="spot.id"
                clickable
                :active="selectedSpot?.id === spot.id"
                active-class="selected-item"
                @click="selectSpot(spot)"
              >
                <q-item-section avatar>
                  <q-icon name="local_pizza" :color="spot.source === 'local' ? 'warning' : 'negative'" />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-weight-medium">{{ spot.pizzaName }}</q-item-label>
                  <q-item-label caption class="text-grey-4">
                    <template v-if="spot.city || spot.country">
                      {{ spot.pizzeria }} · {{ spot.city }}, {{ spot.country }}
                    </template>
                    <template v-else-if="spot.address">
                      {{ spot.pizzeria }} · {{ spot.address }}
                    </template>
                    <template v-else>
                      {{ spot.pizzeria }}
                    </template>
                  </q-item-label>
                </q-item-section>
              </q-item>
            </q-list>
          </q-scroll-area>

          <q-separator dark />

          <q-card-section>
            <div class="text-subtitle2 q-mb-sm">Add your favorite pizzeria</div>
            <q-form class="column q-gutter-sm" @submit.prevent="addLocalSpot">
              <q-input v-model="form.country" dense outlined dark label="Country" />
              <q-input v-model="form.city" dense outlined dark label="City" />
              <q-input v-model="form.pizzeria" dense outlined dark label="Pizzeria" />
              <q-input v-model="form.pizzaName" dense outlined dark label="Best Pizza" />
              <div class="row q-col-gutter-sm">
                <div class="col">
                  <q-input v-model.number="form.lat" type="number" step="any" dense outlined dark label="Latitude" />
                </div>
                <div class="col">
                  <q-input v-model.number="form.lng" type="number" step="any" dense outlined dark label="Longitude" />
                </div>
              </div>
              <q-btn type="submit" color="warning" text-color="dark" icon="add" label="Save locally" />
            </q-form>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12 col-md-8">
        <q-card flat bordered class="glass-panel full-height">
          <q-card-section class="row items-center justify-between">
            <div>
              <div class="text-h6 text-weight-bold">Pizza Planet Map</div>
              <div class="text-caption text-grey-4">Blue = API seed (Google/Overpass), Gold = your local additions</div>
            </div>
            <q-chip color="negative" text-color="white" icon="place">{{ filteredSpots.length }} spots</q-chip>
          </q-card-section>

          <q-card-section class="q-pt-none">
            <div class="row items-center justify-between q-mb-sm">
              <div class="text-caption text-grey-4">
                Current center: {{ center[0].toFixed(2) }}, {{ center[1].toFixed(2) }}
              </div>
              <q-btn
                color="primary"
                text-color="white"
                :loading="overpassLoading"
                :disable="overpassLoading"
                icon="place"
                label="Load pizzerias (Overpass)"
                @click="requestOverpassPizzerias"
              />
            </div>

            <div v-if="overpassError" class="text-negative q-mb-sm">
              {{ overpassError }}
            </div>
            <div v-else-if="overpassLoadedCount > 0" class="text-caption text-grey-4 q-mb-sm">
              Overpass loaded: {{ overpassLoadedCount }} pizzerias
            </div>

            <div class="row items-center justify-between q-mb-sm">
              <div class="text-caption text-grey-4">Google = rating & popularity</div>
              <q-btn
                color="secondary"
                text-color="white"
                :loading="googleLoading"
                :disable="googleLoading"
                icon="star"
                label="Load best pizzerias (Google)"
                @click="requestGoogleBestPizzerias"
              />
            </div>

            <div v-if="googleError" class="text-negative q-mb-sm">
              {{ googleError }}
            </div>
            <div v-else-if="googleLoadedCount > 0" class="text-caption text-grey-4 q-mb-sm">
              Google loaded: {{ googleLoadedCount }} pizzerias
            </div>

            <l-map
              v-model:zoom="zoom"
              :center="center"
              :use-global-leaflet="false"
              class="pizza-map"
              :style="{ height: '70vh' }"
            >
              <l-tile-layer :url="tileUrl" :attribution="tileAttribution" />
              <l-circle-marker
                v-for="spot in filteredSpots"
                :key="spot.id"
                :lat-lng="[spot.lat, spot.lng]"
                :radius="8"
                :color="spot.source === 'local' ? '#F2C037' : '#C10015'"
                :fill-color="spot.source === 'local' ? '#F2C037' : '#1976D2'"
                :fill-opacity="0.85"
                @click="selectSpot(spot)"
              >
                <l-popup>
                  <div class="text-body2">
                    <strong>{{ spot.pizzaName }}</strong><br>
                    {{ spot.pizzeria }}<br>
                    <template v-if="typeof spot.rating === 'number'">
                      Rating: {{ spot.rating.toFixed(1) }} ({{ spot.reviewCount ?? 0 }} reviews)<br>
                    </template>
                    <template v-if="spot.city || spot.country">
                      {{ spot.city }}, {{ spot.country }}
                    </template>
                    <template v-else-if="spot.address">
                      {{ spot.address }}
                    </template>
                  </div>
                </l-popup>
              </l-circle-marker>
            </l-map>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { LCircleMarker, LMap, LPopup, LTileLayer } from '@vue-leaflet/vue-leaflet';
import 'leaflet/dist/leaflet.css';

type SpotSource = 'seed' | 'local';

interface PizzaSpot {
  id: string;
  country: string;
  city: string;
  pizzeria: string;
  pizzaName: string;
  lat: number;
  lng: number;
  source: SpotSource;
  rating?: number;
  reviewCount?: number;
  address?: string;
}

const LOCAL_STORAGE_KEY = 'pizza-world-local-spots';

const seedSpotsFallback: PizzaSpot[] = [
  {
    id: 'seed-1',
    country: 'Italy',
    city: 'Naples',
    pizzeria: "L'Antica Pizzeria da Michele",
    pizzaName: 'Margherita',
    lat: 40.8518,
    lng: 14.2681,
    source: 'seed'
  },
  {
    id: 'seed-2',
    country: 'United States',
    city: 'New York',
    pizzeria: "Joe's Pizza",
    pizzaName: 'New York Slice',
    lat: 40.7303,
    lng: -74.0021,
    source: 'seed'
  },
  {
    id: 'seed-3',
    country: 'Japan',
    city: 'Tokyo',
    pizzeria: 'Pizzeria da Peppe Napoli Sta Ca',
    pizzaName: 'Bufalina',
    lat: 35.6762,
    lng: 139.6503,
    source: 'seed'
  }
];

const seedSpots = ref<PizzaSpot[]>(seedSpotsFallback);

const seedApiUrl = import.meta.env.VITE_SEED_API_URL as string | undefined;

const localSpots = ref<PizzaSpot[]>([]);
const selectedSpot = ref<PizzaSpot | null>(null);
const search = ref('');
// Center on a seed pizzeria so it’s obvious the map is working immediately.
const zoom = ref(4);
const center = ref<[number, number]>([40.8518, 14.2681]); // Naples

const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const tileAttribution = '&copy; OpenStreetMap contributors';

const overpassApiUrl = (import.meta.env.VITE_OVERPASS_API_URL as string | undefined) ?? 'https://overpass-api.de/api/interpreter';
const overpassRadiusMeters = ref(10000);
const overpassLoading = ref(false);
const overpassError = ref<string | null>(null);
const overpassLoadedCount = ref(0);

const overpassSpots = ref<PizzaSpot[]>([]);

const googleSpots = ref<PizzaSpot[]>([]);
const googleSearchSpots = ref<PizzaSpot[]>([]);
const googleLoading = ref(false);
const googleSearchLoading = ref(false);
const googleError = ref<string | null>(null);
const googleSearchError = ref<string | null>(null);
const googleLoadedCount = ref(0);
const googleSearchLoadedFor = ref<string | null>(null);

const placesApiBaseUrl =
  (import.meta.env.VITE_PLACES_API_BASE_URL as string | undefined) ?? 'http://localhost:3004';
const googleMaxResults = 20;
const googleSearchDebounceMs = 450;

const form = ref({
  country: '',
  city: '',
  pizzeria: '',
  pizzaName: '',
  lat: null as number | null,
  lng: null as number | null
});

const allSpots = computed(() => [
  ...seedSpots.value,
  ...overpassSpots.value,
  ...googleSpots.value,
  ...localSpots.value
]);

const filteredSpots = computed(() => {
  const termRaw = search.value.trim();
  const term = termRaw.toLowerCase();
  if (!term) return allSpots.value;

  const spotMatchesTerm = (spot: PizzaSpot): boolean => {
    return (
      spot.country.toLowerCase().includes(term) ||
      spot.city.toLowerCase().includes(term) ||
      spot.pizzeria.toLowerCase().includes(term) ||
      spot.pizzaName.toLowerCase().includes(term)
    );
  };

  // If we already have Google results for the exact current query, use them.
  if (googleSearchLoadedFor.value === term && googleSearchSpots.value.length > 0) {
    const localMatches = localSpots.value.filter(spotMatchesTerm);
    const combined = [...googleSearchSpots.value, ...localMatches];
    return Array.from(new Map(combined.map((s) => [s.id, s])).values());
  }

  // Fallback while Google is loading (or if there are no results).
  return allSpots.value.filter(spotMatchesTerm);
});

function selectSpot(spot: PizzaSpot): void {
  selectedSpot.value = spot;
  center.value = [spot.lat, spot.lng];
  zoom.value = 11;
}

function addLocalSpot(): void {
  if (
    !form.value.country ||
    !form.value.city ||
    !form.value.pizzeria ||
    !form.value.pizzaName ||
    form.value.lat === null ||
    form.value.lng === null
  ) {
    return;
  }

  const spot: PizzaSpot = {
    id: `local-${Date.now()}`,
    country: form.value.country.trim(),
    city: form.value.city.trim(),
    pizzeria: form.value.pizzeria.trim(),
    pizzaName: form.value.pizzaName.trim(),
    lat: Number(form.value.lat),
    lng: Number(form.value.lng),
    source: 'local'
  };

  localSpots.value = [spot, ...localSpots.value];
  persistLocalSpots();
  form.value = { country: '', city: '', pizzeria: '', pizzaName: '', lat: null, lng: null };
  selectSpot(spot);
}

function persistLocalSpots(): void {
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localSpots.value));
}

function loadLocalSpots(): void {
  const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw) as PizzaSpot[];
    localSpots.value = parsed.filter((spot) => spot.source === 'local');
  } catch {
    localSpots.value = [];
  }
}

let googleSearchDebounceTimer: number | undefined;

watch(search, (newValue) => {
  const termRaw = newValue.trim();
  const term = termRaw.toLowerCase();

  // Reset for short queries.
  if (term.length < 3) {
    googleSearchLoading.value = false;
    googleSearchError.value = null;
    googleSearchSpots.value = [];
    googleSearchLoadedFor.value = null;
    return;
  }

  // Debounce so we don't hit Google on every keystroke.
  if (googleSearchDebounceTimer) window.clearTimeout(googleSearchDebounceTimer);

  googleSearchDebounceTimer = window.setTimeout(() => {
    googleSearchLoading.value = true;
    googleSearchError.value = null;
    googleSearchSpots.value = [];

    void (async () => {
      try {
        const [lat, lng] = center.value;
        const radius = overpassRadiusMeters.value;
        const max = googleMaxResults;

        const url = new URL('/api/search-pizzerias', placesApiBaseUrl);
        url.searchParams.set('query', termRaw);
        url.searchParams.set('lat', String(lat));
        url.searchParams.set('lng', String(lng));
        url.searchParams.set('radius', String(radius));
        url.searchParams.set('max', String(max));

        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Google proxy failed: ${res.status} ${res.statusText}`);
        }

        const payload: unknown = await res.json();
        const spotsCandidate = (payload as { spots?: unknown }).spots;
        if (!Array.isArray(spotsCandidate)) {
          throw new Error('Google proxy response did not include a spots array');
        }

        type RawGoogleSpot = {
          id?: unknown;
          country?: unknown;
          city?: unknown;
          pizzeria?: unknown;
          pizzaName?: unknown;
          lat?: unknown;
          lng?: unknown;
          rating?: unknown;
          reviewCount?: unknown;
          address?: unknown;
        };

        const normalized = spotsCandidate
          .map((s: unknown): PizzaSpot | null => {
            const spot = s as RawGoogleSpot;
            const id = typeof spot.id === 'string' ? spot.id : null;
            const pizzeria =
              typeof spot.pizzeria === 'string' ? spot.pizzeria : (typeof spot.pizzaName === 'string' ? spot.pizzaName : null);

            const pizzaName =
              typeof spot.pizzaName === 'string' ? spot.pizzaName : (typeof spot.pizzeria === 'string' ? spot.pizzeria : pizzeria);

            const latNum = Number(spot.lat);
            const lngNum = Number(spot.lng);
            if (!id || !pizzeria || !Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;

            const ratingNum = typeof spot.rating === 'number' ? spot.rating : Number(spot.rating);
            const reviewCountNum =
              typeof spot.reviewCount === 'number' ? spot.reviewCount : Number(spot.reviewCount);

            const country = typeof spot.country === 'string' ? spot.country : '';
            const city = typeof spot.city === 'string' ? spot.city : '';
            const address = typeof spot.address === 'string' ? spot.address : '';

            const out: PizzaSpot = {
              id,
              country,
              city,
              pizzeria,
              pizzaName: typeof pizzaName === 'string' ? pizzaName : pizzeria,
              lat: latNum,
              lng: lngNum,
              source: 'seed'
            };

            if (Number.isFinite(ratingNum)) out.rating = ratingNum;
            if (Number.isFinite(reviewCountNum)) out.reviewCount = reviewCountNum;
            if (address) out.address = address;

            return out;
          })
          .filter(Boolean) as PizzaSpot[];

        if (term !== search.value.trim().toLowerCase()) {
          // Query changed while request was in-flight.
          return;
        }

        googleSearchSpots.value = normalized;
        googleSearchLoadedFor.value = term;
      } catch (err) {
        if (term !== search.value.trim().toLowerCase()) return;
        googleSearchError.value =
          err instanceof Error ? err.message : 'Failed to search pizzerias via Google';
      } finally {
        if (term === search.value.trim().toLowerCase()) {
          googleSearchLoading.value = false;
        }
      }
    })();
  }, googleSearchDebounceMs);
});

function requestOverpassPizzerias(): void {
  void loadOverpassPizzerias();
}

function requestGoogleBestPizzerias(): void {
  void loadGoogleBestPizzerias();
}

async function loadGoogleBestPizzerias(): Promise<void> {
  googleLoading.value = true;
  googleError.value = null;
  googleLoadedCount.value = 0;
  googleSpots.value = [];

  try {
    const [lat, lng] = center.value;
    const radius = overpassRadiusMeters.value;
    const max = googleMaxResults;

    const url = new URL('/api/best-pizzerias', placesApiBaseUrl);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lng', String(lng));
    url.searchParams.set('radius', String(radius));
    url.searchParams.set('max', String(max));

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Google proxy failed: ${res.status} ${res.statusText}`);
    }

    const payload: unknown = await res.json();
    const spotsCandidate = (payload as { spots?: unknown }).spots;

    if (!Array.isArray(spotsCandidate)) {
      throw new Error('Google proxy response did not include a spots array');
    }

    type RawGoogleSpot = {
      id?: unknown;
      country?: unknown;
      city?: unknown;
      pizzeria?: unknown;
      pizzaName?: unknown;
      lat?: unknown;
      lng?: unknown;
      rating?: unknown;
      user_ratings_total?: unknown;
      reviewCount?: unknown;
      address?: unknown;
    };

    const normalized = spotsCandidate
      .map((s: unknown): PizzaSpot | null => {
        const spot = s as RawGoogleSpot;

        const id = typeof spot.id === 'string' ? spot.id : null;
        const pizzeria = typeof spot.pizzeria === 'string' ? spot.pizzeria : null;
        const pizzaName =
          typeof spot.pizzaName === 'string' ? spot.pizzaName : (spot.pizzeria ?? null);

        const latNum = Number(spot.lat);
        const lngNum = Number(spot.lng);

        if (!id || !pizzeria || !Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
          return null;
        }

        const ratingNum = typeof spot.rating === 'number' ? spot.rating : Number(spot.rating);
        const reviewCountRaw = spot.reviewCount ?? spot.user_ratings_total;
        const reviewCountNum =
          typeof reviewCountRaw === 'number' ? reviewCountRaw : Number(reviewCountRaw);

        const country = typeof spot.country === 'string' ? spot.country : '';
        const city = typeof spot.city === 'string' ? spot.city : '';
        const address = typeof spot.address === 'string' ? spot.address : '';

        const spotOut: PizzaSpot = {
          id,
          country,
          city,
          pizzeria,
          pizzaName: typeof pizzaName === 'string' ? pizzaName : pizzeria,
          lat: latNum,
          lng: lngNum,
          source: 'seed'
        };

        if (Number.isFinite(ratingNum)) spotOut.rating = ratingNum;
        if (Number.isFinite(reviewCountNum)) spotOut.reviewCount = reviewCountNum;
        if (address) spotOut.address = address;

        return spotOut;
      })
      .filter(Boolean) as PizzaSpot[];

    googleSpots.value = normalized;
    googleLoadedCount.value = normalized.length;
  } catch (err) {
    googleError.value = err instanceof Error ? err.message : 'Failed to load pizzerias from Google';
    console.error('[pizza-world] Google error:', err);
  } finally {
    googleLoading.value = false;
  }
}

async function loadOverpassPizzerias(): Promise<void> {
  overpassLoading.value = true;
  overpassError.value = null;
  overpassLoadedCount.value = 0;
  overpassSpots.value = [];

  try {
    const [lat, lng] = center.value;
    const radius = overpassRadiusMeters.value;

    const query = `
[out:json][timeout:25];
(
  node["amenity"="pizzeria"](around:${radius},${lat},${lng});
  way["amenity"="pizzeria"](around:${radius},${lat},${lng});
  relation["amenity"="pizzeria"](around:${radius},${lat},${lng});
);
out center tags;
`.trim();

    const body = `data=${encodeURIComponent(query)}`;
    const res = await fetch(overpassApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    if (!res.ok) {
      throw new Error(`Overpass failed: ${res.status} ${res.statusText}`);
    }

    const payload: unknown = await res.json();
    const payloadObj = payload as { elements?: unknown };
    const elements = payloadObj.elements;

    if (!Array.isArray(elements)) {
      throw new Error('Overpass response did not include an elements array');
    }

    type OverpassElement = {
      type?: unknown;
      id?: unknown;
      lat?: unknown;
      lon?: unknown;
      center?: unknown;
      tags?: unknown;
    };

    const normalized = elements
      .map((e: unknown): PizzaSpot | null => {
        const el = e as OverpassElement;

        const type = typeof el.type === 'string' ? el.type : null;
        const id = typeof el.id === 'string' || typeof el.id === 'number' ? String(el.id) : null;
        if (!type || !id) return null;

        // Overpass node uses lat/lon, way/relation uses center.
        const latCandidate =
          typeof el.lat === 'number'
            ? el.lat
            : typeof el.lat === 'string'
              ? Number(el.lat)
              : NaN;

        const lonCandidate =
          typeof el.lon === 'number'
            ? el.lon
            : typeof el.lon === 'string'
              ? Number(el.lon)
              : NaN;

        let latNum = latCandidate;
        let lonNum = lonCandidate;

        if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
          const center = el.center as { lat?: unknown; lon?: unknown } | undefined;
          const centerLat = center?.lat;
          const centerLon = center?.lon;

          const parsedCenterLat =
            typeof centerLat === 'number'
              ? centerLat
              : typeof centerLat === 'string'
                ? Number(centerLat)
                : NaN;
          const parsedCenterLon =
            typeof centerLon === 'number'
              ? centerLon
              : typeof centerLon === 'string'
                ? Number(centerLon)
                : NaN;

          latNum = parsedCenterLat;
          lonNum = parsedCenterLon;
        }

        if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) return null;

        const tags = (el.tags ?? {}) as Record<string, unknown>;
        const name =
          typeof tags.name === 'string' && tags.name.trim() ? tags.name : 'Pizzeria';

        const country =
          typeof tags['addr:country'] === 'string' ? tags['addr:country'] : '';
        const city =
          typeof tags['addr:city'] === 'string' ? tags['addr:city'] : '';

        return {
          id: `overpass-${type}-${id}`,
          country,
          city,
          pizzeria: String(name),
          pizzaName: String(name),
          lat: latNum,
          lng: lonNum,
          source: 'seed'
        };
      })
      .filter(Boolean) as PizzaSpot[];

    // De-dup by id.
    const unique = Array.from(new Map(normalized.map((s) => [s.id, s])).values());

    overpassSpots.value = unique;
    overpassLoadedCount.value = unique.length;
  } catch (err) {
    overpassError.value = err instanceof Error ? err.message : 'Failed to load pizzerias from Overpass';
    console.error('[pizza-world] Overpass error:', err);
  } finally {
    overpassLoading.value = false;
  }
}

onMounted(() => {
  loadLocalSpots();

  // Optional: replace seed spots using a remote API.
  // Expected response: either `PizzaSpot[]` or `{ spots: PizzaSpot[] }`.
  if (!seedApiUrl) return;

  void (async () => {
    try {
      const res = await fetch(seedApiUrl);
      if (!res.ok) throw new Error(`Seed API failed: ${res.status} ${res.statusText}`);
      const data: unknown = await res.json();

      type RawSeedSpot = {
        id?: unknown;
        country?: unknown;
        city?: unknown;
        pizzeria?: unknown;
        pizzaName?: unknown;
        pizza?: unknown;
        lat?: unknown;
        lng?: unknown;
      };

      const rawSpotsCandidate = Array.isArray(data)
        ? data
        : (data as { spots?: unknown }).spots;

      if (!Array.isArray(rawSpotsCandidate)) return;

      const normalized = rawSpotsCandidate
        .map((s: unknown): PizzaSpot | null => {
          const spot = s as RawSeedSpot;
          const lat = Number(spot.lat);
          const lng = Number(spot.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

          const id =
            typeof spot.id === 'string' ? spot.id : `seed-${lat}-${lng}`;

          const country = typeof spot.country === 'string' ? spot.country : '';
          const city = typeof spot.city === 'string' ? spot.city : '';
          const pizzeria = typeof spot.pizzeria === 'string' ? spot.pizzeria : '';

          const pizzaName =
            typeof spot.pizzaName === 'string'
              ? spot.pizzaName
              : typeof spot.pizza === 'string'
                ? spot.pizza
                : '';

          return {
            id,
            country,
            city,
            pizzeria,
            pizzaName,
            lat,
            lng,
            source: 'seed'
          };
        })
        .filter(Boolean) as PizzaSpot[];

      if (normalized.length > 0) seedSpots.value = normalized;
    } catch (err) {
      // Keep showing the fallback seed spots if the API is unavailable.
      console.error('[pizza-world] Failed to load seed spots:', err);
    }
  })();
});
</script>

<style scoped>
.pizza-page {
  min-height: calc(100vh - 70px);
  background:
    radial-gradient(circle at 20% 20%, rgba(25, 118, 210, 0.35), transparent 40%),
    radial-gradient(circle at 80% 0%, rgba(193, 0, 21, 0.2), transparent 30%),
    linear-gradient(180deg, #0a1021 0%, #161616 100%);
}

.glass-panel {
  background: rgba(12, 18, 37, 0.72);
  border-color: rgba(255, 255, 255, 0.1);
  border-radius: 16px;
}

.pizza-map {
  height: 70vh;
  border-radius: 12px;
  overflow: hidden;
}

.selected-item {
  background: rgba(25, 118, 210, 0.22);
}
</style>
