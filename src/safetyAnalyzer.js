const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function haversineDistance([lng1, lat1], [lng2, lat2]) {
  const R = 6371000; // meters
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function interpolatePoint(start, end, fraction) {
  const [lng1, lat1] = start;
  const [lng2, lat2] = end;
  const lat = lat1 + (lat2 - lat1) * fraction;
  const lng = lng1 + (lng2 - lng1) * fraction;
  return [lng, lat];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function sampleRoutePoints(routeGeometry, metersPerSample = 500, maxSamples = 12) {
  if (!routeGeometry || !Array.isArray(routeGeometry.coordinates)) return [];
  const coords = routeGeometry.coordinates;
  if (coords.length === 0) return [];

  const segments = [];
  let totalLength = 0;

  for (let i = 0; i < coords.length - 1; i += 1) {
    const segLen = haversineDistance(coords[i], coords[i + 1]);
    segments.push({ start: coords[i], end: coords[i + 1], length: segLen });
    totalLength += segLen;
  }

  if (totalLength === 0) return [coords[0]];

  const sampleDist = metersPerSample;
  const pointCount = Math.min(Math.ceil(totalLength / sampleDist) + 1, maxSamples);

  const samples = [];
  for (let i = 0; i < pointCount; i += 1) {
    const target = (i * totalLength) / (pointCount - 1 || 1);
    let accumulated = 0;

    for (const segment of segments) {
      if (accumulated + segment.length >= target || segment === segments[segments.length - 1]) {
        const remaining = target - accumulated;
        const ratio = clamp(segment.length === 0 ? 0 : remaining / segment.length, 0, 1);
        samples.push(interpolatePoint(segment.start, segment.end, ratio));
        break;
      }
      accumulated += segment.length;
    }
  }

  const unique = [];
  const seen = new Set();

  samples.forEach((p) => {
    const key = `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(p);
    }
  });

  return unique;
}

export async function fetchOverpassData(lat, lon) {
  const query = `
[out:json][timeout:25];
(
  node["amenity"="restaurant"](around:500,${lat},${lon});
  node["amenity"="cafe"](around:500,${lat},${lon});
  node["shop"](around:500,${lat},${lon});
  node["amenity"="bus_station"](around:500,${lat},${lon});
  node["highway"="bus_stop"](around:500,${lat},${lon});
  node["amenity"="school"](around:500,${lat},${lon});
  node["amenity"="marketplace"](around:500,${lat},${lon});
  node["amenity"="hospital"](around:500,${lat},${lon});
  node["highway"="street_lamp"](around:500,${lat},${lon});
  way["highway"](around:500,${lat},${lon});
  way["highway"]["lit"="yes"](around:500,${lat},${lon});
);
out body;`;

  const res = await fetch(OVERPASS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) {
    throw new Error(`Overpass request failed: ${res.status}`);
  }

  return res.json();
}

export function calculateCrowdScore(data) {
  if (!data?.elements) return 0;

  let poiCount = 0;

  data.elements.forEach((el) => {
    const tags = el.tags || {};

    if (el.type === 'node') {
      if (
        tags.amenity === 'restaurant' ||
        tags.amenity === 'cafe' ||
        tags.amenity === 'bus_station' ||
        tags.amenity === 'school' ||
        tags.amenity === 'marketplace' ||
        tags.amenity === 'hospital' ||
        tags.highway === 'bus_stop' ||
        tags.shop
      ) {
        poiCount += 1;
      }
    }

    if (el.type === 'way') {
      if (tags.shop || tags.highway) {
        poiCount += 1;
      }
    }
  });

  const crowdScore = Math.min(poiCount / 40, 1);
  return Number(crowdScore.toFixed(3));
}

export function calculateLightingScore(data) {
  if (!data?.elements) return 0.3;

  let lampCount = 0;
  let litRoadCount = 0;

  data.elements.forEach((el) => {
    const tags = el.tags || {};
    if (el.type === 'node' && tags.highway === 'street_lamp') {
      lampCount += 1;
    }
    if (el.type === 'way' && tags.highway && tags.lit === 'yes') {
      litRoadCount += 1;
    }
  });

  const lightingFeatures = lampCount + litRoadCount;
  if (lightingFeatures > 10) return 1;
  if (lightingFeatures >= 3) return 0.7;
  return 0.3;
}

export function calculateIsolationScore(data) {
  if (!data?.elements) return 1;

  let poiCount = 0;

  data.elements.forEach((el) => {
    const tags = el.tags || {};

    if (el.type === 'node') {
      if (
        tags.amenity === 'restaurant' ||
        tags.amenity === 'cafe' ||
        tags.amenity === 'bus_station' ||
        tags.amenity === 'school' ||
        tags.amenity === 'marketplace' ||
        tags.amenity === 'hospital' ||
        tags.highway === 'bus_stop' ||
        tags.shop
      ) {
        poiCount += 1;
      }
    }

    if (el.type === 'way') {
      if (tags.shop || tags.highway) {
        poiCount += 1;
      }
    }
  });

  const isolationScore = 1 - Math.min(poiCount / 30, 1);
  return Number(isolationScore.toFixed(3));
}

export function calculateSegmentSafety({ crowdScore, lightingScore, isolationScore }) {
  return Number((0.4 * lightingScore + 0.35 * crowdScore + 0.25 * isolationScore).toFixed(3));
}

export async function calculateRouteSafety(route) {
  if (!route?.geometry) return { routeSafetyScore: 0, segmentScores: [] };

  const samples = sampleRoutePoints(route.geometry, 500, 12);
  if (!samples.length) return { routeSafetyScore: 0, segmentScores: [] };

  const segmentScores = await Promise.all(
    samples.map(async ([lng, lat]) => {
      let data;
      try {
        data = await fetchOverpassData(lat, lng);
      } catch (err) {
        console.warn('Overpass data fail', err);
        data = { elements: [] };
      }

      const crowdScore = calculateCrowdScore(data);
      const lightingScore = calculateLightingScore(data);
      const isolationScore = calculateIsolationScore(data);
      const segmentSafety = calculateSegmentSafety({ crowdScore, lightingScore, isolationScore });

      return { lat, lng, crowdScore, lightingScore, isolationScore, segmentSafety };
    }),
  );

  const routeSafetyScore = Number(
    (segmentScores.reduce((acc, s) => acc + s.segmentSafety, 0) / segmentScores.length).toFixed(3),
  );

  return { routeSafetyScore, segmentScores };
}
