/**
 * Routing service.
 * Queries the Mapbox Directions API for walking turn-by-turn steps.
 */
import { CONFIG } from '@/constants/config';

export type Coordinate = { latitude: number; longitude: number };

export type RouteStep = {
  instruction: string;
  /** Distance in metres to the *end* of this step */
  distance: number;
  /** Manoeuvre location */
  location: Coordinate;
};

/**
 * Fetch a walking route from `origin` to `destination`.
 * Returns an ordered array of steps, or null if the request fails.
 */
export async function fetchWalkingRoute(
  origin: Coordinate,
  destination: Coordinate,
): Promise<RouteStep[] | null> {
  if (!CONFIG.MAPBOX_TOKEN) {
    console.warn('[routing] MAPBOX_TOKEN not set — navigation disabled');
    return null;
  }

  const url =
    `https://api.mapbox.com/directions/v5/mapbox/walking/` +
    `${origin.longitude},${origin.latitude};` +
    `${destination.longitude},${destination.latitude}` +
    `?steps=true&voice_instructions=true&language=en&access_token=${CONFIG.MAPBOX_TOKEN}`;

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);

    if (!res.ok) return null;

    const data = await res.json();
    const legs = data?.routes?.[0]?.legs ?? [];
    const steps: RouteStep[] = [];

    for (const leg of legs) {
      for (const step of leg.steps ?? []) {
        steps.push({
          instruction: step.maneuver?.instruction ?? '',
          distance: step.distance ?? 0,
          location: {
            latitude: step.maneuver?.location?.[1] ?? 0,
            longitude: step.maneuver?.location?.[0] ?? 0,
          },
        });
      }
    }

    return steps.length > 0 ? steps : null;
  } catch {
    return null;
  }
}

/**
 * Haversine distance in metres between two coordinates.
 */
export function distanceMetres(a: Coordinate, b: Coordinate): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const aa =
    sinLat * sinLat +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinLon * sinLon;
  return 2 * R * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

/** Human-readable distance string for TTS ("in 50 metres", "in 1.2 kilometres"). */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `in ${Math.round(metres)} metres`;
  return `in ${(metres / 1000).toFixed(1)} kilometres`;
}
