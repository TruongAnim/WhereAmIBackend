import type { MapSettings } from "../settings/settings";

/** One stored position, already stripped of Firestore types. */
export interface Fix {
  id: string;
  timeMs: number;
  lat: number;
  lon: number;
  accuracy: number | null;
  /** Metres per second, as stored. */
  speed: number | null;
  bearing: number | null;
  battery: number | null;
  charging: boolean | null;
  alarm: string | null;
}

export interface Segment {
  points: Fix[];
  /** True when this segment only exists because the previous one was cut. */
  startsAfterGap: boolean;
}

export interface TrackStats {
  totalFixes: number;
  usedFixes: number;
  droppedByAccuracy: number;
  distanceMeters: number;
  movingMillis: number;
  firstTimeMs: number | null;
  lastTimeMs: number | null;
  maxSpeed: number | null;
  alarms: Fix[];
}

export interface Track {
  segments: Segment[];
  stats: TrackStats;
}

const EARTH_RADIUS_METERS = 6_371_000;

/** Haversine, the same formula the SDK's LocationFilter uses. */
export function distanceMeters(a: Fix, b: Fix): number {
  const fromLat = (a.lat * Math.PI) / 180;
  const toLat = (b.lat * Math.PI) / 180;
  const latDelta = ((b.lat - a.lat) * Math.PI) / 180;
  const lonDelta = ((b.lon - a.lon) * Math.PI) / 180;
  const h =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lonDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/**
 * Turns raw fixes into drawable segments.
 *
 * Order matters here. Fixes are sorted by their device timestamp rather than
 * by arrival, because an SOS bypasses the upload queue and routinely lands
 * ahead of positions recorded before it.
 */
export function buildTrack(fixes: readonly Fix[], settings: MapSettings): Track {
  const sorted = [...fixes].sort((a, b) => a.timeMs - b.timeMs);

  const kept: Fix[] = [];
  let droppedByAccuracy = 0;
  for (const fix of sorted) {
    const tooVague =
      settings.maxAccuracyMeters > 0 &&
      fix.accuracy !== null &&
      fix.accuracy > settings.maxAccuracyMeters;
    // An SOS is never filtered out: it is the one fix the user explicitly asked for.
    if (tooVague && fix.alarm === null) {
      droppedByAccuracy++;
      continue;
    }
    kept.push(fix);
  }

  const alarms = kept.filter((fix) => fix.alarm !== null);

  let distance = 0;
  let movingMillis = 0;
  let maxSpeed: number | null = null;
  for (const fix of kept) {
    if (fix.speed !== null && (maxSpeed === null || fix.speed > maxSpeed)) maxSpeed = fix.speed;
  }

  const segments: Segment[] = [];
  let current: Fix[] = [];
  let startsAfterGap = false;

  const flush = () => {
    if (current.length > 0) {
      segments.push({ points: current, startsAfterGap });
      current = [];
    }
  };

  for (let i = 0; i < kept.length; i++) {
    const fix = kept[i];
    if (i === 0) {
      current.push(fix);
      continue;
    }

    const previous = kept[i - 1];
    const elapsed = fix.timeMs - previous.timeMs;
    const moved = distanceMeters(previous, fix);

    // Both counters advance regardless of how the gap is drawn, so the stats
    // do not change when the user flips the toggle.
    distance += moved;
    movingMillis += elapsed;

    const timeGap = settings.gapMinutes > 0 && elapsed > settings.gapMinutes * 60_000;
    const distanceGap =
      settings.gapDistanceMeters > 0 && moved > settings.gapDistanceMeters;
    const isGap = timeGap || distanceGap;

    if (isGap && settings.gapBehavior === "split") {
      flush();
      startsAfterGap = true;
    }
    current.push(fix);
  }
  flush();

  const simplified =
    settings.simplifyMeters > 0
      ? segments.map((segment) => ({
          ...segment,
          points: simplify(segment.points, settings.simplifyMeters),
        }))
      : segments;

  return {
    segments: simplified,
    stats: {
      totalFixes: fixes.length,
      usedFixes: kept.length,
      droppedByAccuracy,
      distanceMeters: distance,
      movingMillis,
      firstTimeMs: kept.length > 0 ? kept[0].timeMs : null,
      lastTimeMs: kept.length > 0 ? kept[kept.length - 1].timeMs : null,
      maxSpeed,
      alarms,
    },
  };
}

/**
 * Douglas-Peucker. Distances are computed in metres via an equirectangular
 * approximation, which is accurate enough at the scale of a single day's
 * movement and far cheaper than a true geodesic.
 */
export function simplify(points: readonly Fix[], toleranceMeters: number): Fix[] {
  if (points.length < 3 || toleranceMeters <= 0) return [...points];

  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let maxDistance = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = perpendicularDistance(points[i], points[first], points[last]);
      if (d > maxDistance) {
        maxDistance = d;
        index = i;
      }
    }
    if (index !== -1 && maxDistance > toleranceMeters) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }

  return points.filter((_, i) => keep[i]);
}

function perpendicularDistance(point: Fix, lineStart: Fix, lineEnd: Fix): number {
  const metresPerDegreeLat = 111_320;
  const metresPerDegreeLon =
    metresPerDegreeLat * Math.cos((lineStart.lat * Math.PI) / 180);

  const px = (point.lon - lineStart.lon) * metresPerDegreeLon;
  const py = (point.lat - lineStart.lat) * metresPerDegreeLat;
  const ex = (lineEnd.lon - lineStart.lon) * metresPerDegreeLon;
  const ey = (lineEnd.lat - lineStart.lat) * metresPerDegreeLat;

  const lengthSquared = ex * ex + ey * ey;
  if (lengthSquared === 0) return Math.hypot(px, py);

  const t = Math.max(0, Math.min(1, (px * ex + py * ey) / lengthSquared));
  return Math.hypot(px - t * ex, py - t * ey);
}

/** Local-midnight bounds for a `YYYY-MM-DD` string, in the viewer's timezone. */
export function dayBounds(isoDate: string): { startMs: number; endMs: number } {
  const [year, month, day] = isoDate.split("-").map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day, 23, 59, 59, 999);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatSpeed(metresPerSecond: number | null, unit: "kmh" | "ms"): string {
  if (metresPerSecond === null) return "-";
  return unit === "kmh"
    ? `${(metresPerSecond * 3.6).toFixed(1)} km/h`
    : `${metresPerSecond.toFixed(1)} m/s`;
}

export function formatDistance(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(2)} km` : `${Math.round(metres)} m`;
}

export function formatDuration(millis: number): string {
  const totalMinutes = Math.round(millis / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
