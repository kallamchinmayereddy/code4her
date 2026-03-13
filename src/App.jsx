import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { MapPin, Route, ShieldCheck } from 'lucide-react';

const LOCATIONIQ_TOKEN = import.meta.env.VITE_LOCATIONIQ_TOKEN; // Replace with actual LocationIQ token
const DEFAULT_CENTER = [80.50, 16.46];
const DEFAULT_ZOOM = 12;

function parseLngLat(value) {
  const parts = value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (parts.length !== 2) return null;
  const lng = parseFloat(parts[0]);
  const lat = parseFloat(parts[1]);
  if (Number.isNaN(lng) || Number.isNaN(lat)) return null;
  return [lng, lat];
}

function formatDuration(minutes) {
  return `${Math.round(minutes)} min`;
}

function buildSafetyBadge(index) {
  // Mock logic for safety badge (could be replaced with real scoring later)
  if (index === 0) return 'Most Direct';
  if (index === 1) return '90% Well-Lit';
  return 'Safe Option';
}

export default function App() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const mapLoaded = useRef(false);
  const popupRef = useRef(null);

  const [start, setStart] = useState('80.50, 16.46');
  const [end, setEnd] = useState('80.60, 16.50');
  const [routes, setRoutes] = useState([]);
  const [activeRoute, setActiveRoute] = useState(0);
  const [transportMode, setTransportMode] = useState('driving');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const prevRouteCount = useRef(0);

  useEffect(() => {
    if (!mapContainer.current) return;

    mapboxgl.accessToken = LOCATIONIQ_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          satellite: {
            type: 'raster',
            tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
            tileSize: 256,
          },
        },
        layers: [
          {
            id: 'satellite',
            type: 'raster',
            source: 'satellite',
          },
        ],
      },
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });

    mapRef.current = map;

    map.on('load', () => {
      mapLoaded.current = true;
    });

    return () => {
      map.remove();
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded.current) return;

    const map = mapRef.current;

    // Remove any stale route sources / layers from previous queries.
    for (let i = 0; i < prevRouteCount.current; i += 1) {
      const layerId = `route-${i}`;
      const sourceId = `route-${i}`;
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    }

    if (!routes.length) {
      prevRouteCount.current = 0;
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      return;
    }

    routes.forEach((route, idx) => {
      const sourceId = `route-${idx}`;
      const layerId = `route-${idx}`;
      const isActive = idx === activeRoute;

      const geojson = {
        type: 'Feature',
        geometry: route.geometry,
      };

      // Add to map
      if (map.getSource(sourceId)) {
        map.getSource(sourceId).setData(geojson);
      } else {
        map.addSource(sourceId, {
          type: 'geojson',
          data: geojson,
        });
      }

      const paint = {
        'line-color': isActive ? '#10b981' : '#64748b',
        'line-width': isActive ? 6 : 3,
        'line-opacity': isActive ? 1 : 0.5,
      };

      if (!map.getLayer(layerId)) {
        map.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint,
        });
      } else {
        map.setPaintProperty(layerId, 'line-color', paint['line-color']);
        map.setPaintProperty(layerId, 'line-width', paint['line-width']);
        map.setPaintProperty(layerId, 'line-opacity', paint['line-opacity']);
      }
    });

    prevRouteCount.current = routes.length;

    // Center the map on the active route's midpoint
    const active = routes[activeRoute];
    if (active?.geometry?.coordinates?.length) {
      const coords = active.geometry.coordinates;
      const mid = coords[Math.floor(coords.length / 2)];
      map.easeTo({ center: mid, duration: 800 });
    }

    // Show a popup for the active route
    const activeFeature = routes[activeRoute];
    if (activeFeature) {
      const coords = activeFeature.geometry.coordinates;
      const mid = coords[Math.floor(coords.length / 2)];
      const duration = activeFeature.duration;

      if (popupRef.current) {
        popupRef.current.remove();
      }
      popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false })
        .setLngLat(mid)
        .setHTML(`<div class="text-sm font-semibold">${formatDuration(duration / 60)}</div>`)
        .addTo(map);
    }
  }, [routes, activeRoute]);

  const runRouting = async () => {
    setError(null);

    const from = parseLngLat(start);
    const to = parseLngLat(end);

    if (!from || !to) {
      setError('Start and Destination must be in the format: lng,lat');
      return;
    }

    setLoading(true);

    try {
      const resp = await fetch(
        `https://api.locationiq.com/v1/directions/${transportMode}/${from[0]},${from[1]};${to[0]},${to[1]}?key=${LOCATIONIQ_TOKEN}&alternatives=true&geometries=geojson&overview=full`,
      );
      const data = await resp.json();

      if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
        setError('No routes found.');
        setRoutes([]);
        return;
      }

      setRoutes(
        data.routes.slice(0, 3).map((route) => ({
          duration: route.duration,
          distance: route.distance,
          geometry: route.geometry,
        })),
      );
      setActiveRoute(0);
    } catch (err) {
      console.error(err);
      setError('No routes found.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRoute = (index) => {
    setActiveRoute(index);
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div ref={mapContainer} className="h-full w-full" />

      <aside className="absolute left-4 top-4 z-20 w-[320px] rounded-2xl border border-white/10 bg-slate-950/80 p-5 shadow-2xl backdrop-blur">
        <header className="mb-4 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Safety-First Navigation</h1>
            <p className="text-xs text-slate-300">Pick the safest route.</p>
          </div>
        </header>

        <div className="space-y-3">
          <label className="block text-xs font-semibold text-slate-300">Transport Mode</label>
          <select
            value={transportMode}
            onChange={(e) => setTransportMode(e.target.value)}
            className="w-full rounded-xl bg-slate-900/70 px-3 py-2 text-sm text-slate-50 outline-none"
          >
            <option value="driving">Driving</option>
            <option value="cycling">Cycling</option>
          </select>

          <label className="block text-xs font-semibold text-slate-300">Start Location</label>
          <div className="flex items-center gap-2 rounded-xl bg-slate-900/70 px-3 py-2">
            <MapPin className="h-4 w-4 text-emerald-300" />
            <input
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full bg-transparent text-sm text-slate-50 outline-none placeholder:text-slate-400"
              placeholder="lng,lat"
            />
          </div>

          <label className="block text-xs font-semibold text-slate-300">Destination</label>
          <div className="flex items-center gap-2 rounded-xl bg-slate-900/70 px-3 py-2">
            <Route className="h-4 w-4 text-cyan-300" />
            <input
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full bg-transparent text-sm text-slate-50 outline-none placeholder:text-slate-400"
              placeholder="lng,lat"
            />
          </div>

          <button
            onClick={runRouting}
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? 'Finding...' : 'Find Routes'}
          </button>

          {error ? <div className="rounded-xl bg-rose-500/20 p-3 text-sm text-rose-200">{error}</div> : null}
        </div>

        {routes.length ? (
          <section className="mt-5 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Routes</h2>
            <div className="space-y-2">
              {routes.map((route, idx) => {
                const isActive = idx === activeRoute;
                const durationMin = route.duration / 60;
                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectRoute(idx)}
                    className={
                      'group w-full rounded-2xl border px-4 py-3 text-left transition ' +
                      (isActive
                        ? 'border-emerald-400/60 bg-emerald-500/10'
                        : 'border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10')
                    }
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-100">
                        {formatDuration(durationMin)}
                      </span>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-slate-200">
                        {buildSafetyBadge(idx)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-300">
                      {Math.round(route.distance)} meters
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <footer className="mt-5 text-xs text-slate-400">
          <div>Tip: enter coordinates in the form <span className="font-medium">lng,lat</span>.</div>
          <div className="mt-1">Replace LOCATIONIQ_TOKEN with your actual key.</div>
        </footer>
      </aside>
    </div>
  );
}
