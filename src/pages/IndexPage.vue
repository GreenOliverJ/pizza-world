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
              outlined
              dense
              clearable
              color="deep-orange-7"
              label="Search pizza spots"
              placeholder="Naples, margherita, etc."
              @clear="onClearSearch"
            >
              <template #prepend>
                <q-icon name="search" />
              </template>
            </q-input>

            <div
              v-if="googleSearchLoading && search.trim().length > 0"
              class="text-caption text-grey-4 q-mt-sm"
            >
              Searching Google for best matches...
            </div>
            <div v-else-if="googleSearchError" class="text-negative q-mt-sm text-caption">
              {{ googleSearchError }}
            </div>
          </q-card-section>

          <q-separator dark />

          <q-scroll-area style="height: 40vh">
            <q-list separator>
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
                  <q-item-label class="text-weight-medium row items-center no-wrap">
                    <span class="ellipsis">{{ spot.pizzaName }}</span>
                    <q-chip
                      v-if="typeof spot.rating === 'number'"
                      dense
                      size="sm"
                      color="amber-8"
                      text-color="white"
                      icon="star"
                      class="q-ml-xs rating-chip"
                    >
                      {{ spot.rating.toFixed(1) }}
                    </q-chip>
                  </q-item-label>
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
        </q-card>
      </div>

      <div class="col-12 col-md-8">
        <q-card flat bordered class="glass-panel full-height">
          <q-card-section class="row items-center justify-between">
            <div>
              <div class="text-h6 text-weight-bold">Pizza World Map</div>
              <div class="text-caption text-grey-7">Pepperoni markers = best matches for your search</div>
            </div>
            <q-chip color="deep-orange-8" text-color="white" icon="place">{{ filteredSpots.length }} spots</q-chip>
          </q-card-section>

          <q-card-section class="q-pt-none">
            <div class="text-caption text-grey-7 q-mb-sm">
                Current center: {{ center[0].toFixed(2) }}, {{ center[1].toFixed(2) }}
            </div>

            <l-map
              v-model:zoom="zoom"
              :center="center"
              :use-global-leaflet="false"
              class="pizza-map"
              :style="{ height: '70vh' }"
            >
              <l-tile-layer :url="tileUrl" :attribution="tileAttribution" />
              <l-marker
                v-for="spot in filteredSpots"
                :key="spot.id"
                :lat-lng="[spot.lat, spot.lng]"
                :icon="pepperoniIcon"
                @click="selectSpot(spot)"
              >
                <l-popup>
                  <div class="text-body2">
                    <img
                      v-if="spot.photoUrl"
                      :src="spot.photoUrl"
                      :alt="`${spot.pizzeria} photo`"
                      class="spot-photo q-mb-sm"
                    >
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
                    <div v-if="spot.mapsUrl" class="q-mt-sm">
                      <a :href="spot.mapsUrl" target="_blank" rel="noopener noreferrer">
                        Open in Google Maps
                      </a>
                    </div>
                  </div>
                </l-popup>
              </l-marker>
            </l-map>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { LMap, LMarker, LPopup, LTileLayer } from '@vue-leaflet/vue-leaflet';
import { divIcon, type Icon, type IconOptions } from 'leaflet';
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
  mapsUrl?: string;
  photoUrl?: string;
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

const googleSearchSpots = ref<PizzaSpot[]>([]);
const googleSearchLoading = ref(false);
const googleSearchError = ref<string | null>(null);
const googleSearchLoadedFor = ref<string | null>(null);

const googleApiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined;
const minGoogleRating = 4.8;
const googleMaxResults = 20;
const googleSearchDebounceMs = 450;
const searchRadiusMeters = 10000;

const pepperoniIcon = divIcon({
  className: 'pepperoni-marker',
  html: '<div class="pepperoni-dot"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -10]
}) as unknown as Icon<IconOptions>;

const allSpots = computed(() => [
  ...seedSpots.value,
  ...localSpots.value
]);

const filteredSpots = computed(() => {
  const termRaw = search.value.trim();
  const term = termRaw.toLowerCase();
  const meetsRatingRule = (spot: PizzaSpot): boolean => {
    // Local spots are user-managed and can stay visible.
    if (spot.source === 'local') return true;
    // For Google/API spots, enforce 4.8+ on client too.
    return typeof spot.rating === 'number' && spot.rating >= minGoogleRating;
  };
  if (!term) return allSpots.value.filter(meetsRatingRule);

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
    const localMatches = localSpots.value.filter((spot) => spotMatchesTerm(spot) && meetsRatingRule(spot));
    const combined = [...googleSearchSpots.value, ...localMatches];
    return Array.from(new Map(combined.map((s) => [s.id, s])).values());
  }

  // Fallback while Google is loading (or if there are no results).
  return allSpots.value.filter((spot) => spotMatchesTerm(spot) && meetsRatingRule(spot));
});

function selectSpot(spot: PizzaSpot): void {
  selectedSpot.value = spot;
  center.value = [spot.lat, spot.lng];
  zoom.value = 11;
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

function onClearSearch(): void {
  search.value = '';
  googleSearchLoading.value = false;
  googleSearchError.value = null;
  googleSearchSpots.value = [];
  googleSearchLoadedFor.value = null;
}

let googleSearchDebounceTimer: number | undefined;

async function searchGooglePlacesDirect({
  query,
  lat,
  lng,
  radius,
  max
}: {
  query: string;
  lat: number;
  lng: number;
  radius: number;
  max: number;
}): Promise<PizzaSpot[]> {
  if (!googleApiKey) {
    throw new Error('Missing VITE_GOOGLE_PLACES_API_KEY');
  }

  const qLower = query.toLowerCase();
  const textQuery = /pizza|pizzeria/.test(qLower) ? query : `${query} pizza`;

  const endpoint = 'https://places.googleapis.com/v1/places:searchText';
  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.location',
    'places.rating',
    'places.userRatingCount',
    'places.googleMapsUri',
    'places.photos'
  ].join(',');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': googleApiKey,
      'X-Goog-FieldMask': fieldMask
    },
    body: JSON.stringify({
      textQuery,
      maxResultCount: max,
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius
        }
      }
    })
  });

  if (!res.ok) {
    const bodyText = await res.text();
    throw new Error(`Google Places failed: ${res.status} ${bodyText || res.statusText}`);
  }

  const payload = (await res.json()) as { places?: unknown };
  const places = Array.isArray(payload.places) ? payload.places : [];

  type RawPlace = {
    id?: unknown;
    displayName?: { text?: unknown };
    formattedAddress?: unknown;
    location?: { latitude?: unknown; longitude?: unknown };
    rating?: unknown;
    userRatingCount?: unknown;
    googleMapsUri?: unknown;
    photos?: Array<{ name?: unknown }>;
  };

  const normalized = places
    .map((p): PizzaSpot | null => {
      const place = p as RawPlace;
      const id = typeof place.id === 'string' ? place.id : null;
      const pizzeria =
        typeof place.displayName?.text === 'string' ? place.displayName.text : null;
      const latNum = Number(place.location?.latitude);
      const lngNum = Number(place.location?.longitude);
      if (!id || !pizzeria || !Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;

      const ratingNum = Number(place.rating);
      const reviewCountNum = Number(place.userRatingCount);
      const address =
        typeof place.formattedAddress === 'string' ? place.formattedAddress : '';
      const mapsUrl = typeof place.googleMapsUri === 'string' ? place.googleMapsUri : '';

      const firstPhotoName =
        Array.isArray(place.photos) && place.photos.length > 0 && typeof place.photos[0]?.name === 'string'
          ? place.photos[0].name
          : '';
      const photoUrl = firstPhotoName
        ? `https://places.googleapis.com/v1/${firstPhotoName}/media?maxHeightPx=220&key=${encodeURIComponent(googleApiKey)}`
        : '';

      const out: PizzaSpot = {
        id,
        country: '',
        city: '',
        pizzeria,
        pizzaName: pizzeria,
        lat: latNum,
        lng: lngNum,
        source: 'seed'
      };
      if (Number.isFinite(ratingNum)) out.rating = ratingNum;
      if (Number.isFinite(reviewCountNum)) out.reviewCount = reviewCountNum;
      if (address) out.address = address;
      if (mapsUrl) out.mapsUrl = mapsUrl;
      if (photoUrl) out.photoUrl = photoUrl;
      return out;
    })
    .filter(Boolean) as PizzaSpot[];

  return normalized.filter((spot) => (spot.rating ?? 0) >= minGoogleRating);
}

watch(search, (newValue) => {
  const termRaw = String(newValue ?? '').trim();
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
        const radius = searchRadiusMeters;
        const max = googleMaxResults;

        const ratingFiltered = await searchGooglePlacesDirect({
          query: termRaw,
          lat,
          lng,
          radius,
          max
        });

        if (term !== search.value.trim().toLowerCase()) {
          // Query changed while request was in-flight.
          return;
        }

        googleSearchSpots.value = ratingFiltered;
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
    radial-gradient(circle at 20% 20%, rgba(255, 166, 77, 0.38), transparent 40%),
    radial-gradient(circle at 80% 0%, rgba(222, 84, 39, 0.24), transparent 35%),
    linear-gradient(180deg, #fff4dd 0%, #ffe6c1 100%);
}

.glass-panel {
  background: rgba(255, 255, 255, 0.78);
  border-color: rgba(166, 82, 40, 0.22);
  border-radius: 16px;
  color: #4c2c1b;
}

.pizza-map {
  height: 70vh;
  border-radius: 12px;
  overflow: hidden;
}

.spot-photo {
  display: block;
  width: 190px;
  max-width: 100%;
  height: 110px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid rgba(122, 20, 0, 0.18);
}

.selected-item {
  background: rgba(255, 112, 67, 0.2);
}

.rating-chip {
  font-weight: 700;
  letter-spacing: 0.01em;
}

:deep(.pepperoni-marker) {
  background: transparent;
  border: 0;
}

:deep(.pepperoni-dot) {
  position: relative;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #ff8a80 0%, #d84315 55%, #8b1e00 100%);
  border: 2px solid #7a1400;
  box-shadow: 0 0 0 2px rgba(255, 244, 221, 0.9), 0 1px 4px rgba(0, 0, 0, 0.25);
}

:deep(.pepperoni-dot)::before,
:deep(.pepperoni-dot)::after {
  content: '';
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
}

:deep(.pepperoni-dot)::before {
  top: 4px;
  left: 5px;
}

:deep(.pepperoni-dot)::after {
  bottom: 3px;
  right: 4px;
}
</style>
