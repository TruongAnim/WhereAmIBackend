/**
 * Pure parsing/validation of the OsmAnd-style payload the Traccar Client SDK sends.
 *
 * The SDK posts application/x-www-form-urlencoded with these keys (see
 * HttpUploader.kt in traccar-client-sdk):
 *
 *   id        device id            always present
 *   timestamp epoch SECONDS        always present
 *   lat, lon  degrees              absent on heartbeat records
 *   accuracy  metres               optional
 *   altitude  metres               optional
 *   speed     KNOTS                optional
 *   bearing   degrees              optional
 *   batt      percent 0..100       optional
 *   charge    "true" | "false"     optional
 *   alarm     e.g. "sos"           only on SOS / manual position request
 *
 * No Firebase imports here on purpose: this file is unit-testable in isolation.
 */

/** Knots -> metres per second. */
const KNOTS_TO_MPS = 0.514444;

/** Reject clearly bogus clocks: nothing before 2020-01-01. */
const MIN_TIME_MS = Date.UTC(2020, 0, 1);

/** Allow a day of clock skew into the future, then treat it as garbage. */
const MAX_FUTURE_SKEW_MS = 25 * 60 * 60 * 1000;

/** Device ids become Firestore document ids, so keep them boring. */
const DEVICE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

export interface IngestRecord {
  deviceId: string;
  timeMs: number;
  lat: number | null;
  lon: number | null;
  accuracy: number | null;
  altitude: number | null;
  /** Converted to m/s; the wire format is knots. */
  speed: number | null;
  bearing: number | null;
  battery: number | null;
  charging: boolean | null;
  alarm: string | null;
  /** True when the SDK sent a keep-alive with no coordinates. */
  heartbeat: boolean;
}

export type ParseResult =
  | { ok: true; record: IngestRecord }
  | { ok: false; reason: string };

export type Params = Record<string, unknown>;

function readString(params: Params, key: string): string | null {
  const raw = params[key];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  // Express gives an array when a key repeats; take the first occurrence.
  if (Array.isArray(raw) && typeof raw[0] === "string") {
    const trimmed = raw[0].trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function readNumber(params: Params, key: string): number | null {
  const raw = readString(params, key);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function readBoolean(params: Params, key: string): boolean | null {
  const raw = readString(params, key)?.toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return null;
}

function inRange(value: number | null, min: number, max: number): number | null {
  if (value === null) return null;
  return value >= min && value <= max ? value : null;
}

/**
 * Normalises `timestamp` to epoch milliseconds.
 *
 * The SDK sends seconds. Values large enough to only make sense as
 * milliseconds are accepted too, so a hand-made curl test still works.
 */
function parseTimestamp(params: Params): number | null {
  const raw = readNumber(params, "timestamp");
  if (raw === null || !Number.isFinite(raw) || raw <= 0) return null;
  return raw > 1e11 ? Math.round(raw) : Math.round(raw * 1000);
}

export function parseRecord(params: Params, nowMs: number): ParseResult {
  const deviceId = readString(params, "id");
  if (deviceId === null) {
    return { ok: false, reason: "missing id" };
  }
  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    return { ok: false, reason: "malformed id" };
  }

  const timeMs = parseTimestamp(params);
  if (timeMs === null) {
    return { ok: false, reason: "missing or malformed timestamp" };
  }
  if (timeMs < MIN_TIME_MS) {
    return { ok: false, reason: "timestamp too far in the past" };
  }
  if (timeMs > nowMs + MAX_FUTURE_SKEW_MS) {
    return { ok: false, reason: "timestamp too far in the future" };
  }

  const rawLat = readNumber(params, "lat");
  const rawLon = readNumber(params, "lon");
  const hasCoordinates = rawLat !== null || rawLon !== null;

  let lat: number | null = null;
  let lon: number | null = null;
  if (hasCoordinates) {
    lat = inRange(rawLat, -90, 90);
    lon = inRange(rawLon, -180, 180);
    if (lat === null || lon === null) {
      return { ok: false, reason: "malformed coordinates" };
    }
  }

  const speedKnots = readNumber(params, "speed");
  const alarm = readString(params, "alarm");

  return {
    ok: true,
    record: {
      deviceId,
      timeMs,
      lat,
      lon,
      accuracy: inRange(readNumber(params, "accuracy"), 0, 100_000),
      altitude: inRange(readNumber(params, "altitude"), -12_000, 100_000),
      speed:
        speedKnots !== null && speedKnots >= 0
          ? Math.round(speedKnots * KNOTS_TO_MPS * 1000) / 1000
          : null,
      bearing: inRange(readNumber(params, "bearing"), 0, 360),
      battery: inRange(readNumber(params, "batt"), 0, 100),
      charging: readBoolean(params, "charge"),
      alarm: alarm !== null ? alarm.slice(0, 32) : null,
      heartbeat: !hasCoordinates,
    },
  };
}

/**
 * Deterministic document id so a retried upload overwrites rather than
 * duplicates. The SDK guarantees at-least-once delivery, not exactly-once.
 *
 * The wire timestamp only has second precision, so a heartbeat or an SOS can
 * land in the same second as a regular fix. The suffix keeps those apart -
 * without it the more important record could be silently overwritten.
 */
export function positionDocId(record: IngestRecord): string {
  const seconds = Math.floor(record.timeMs / 1000);
  const suffix = record.alarm !== null
    ? `_${record.alarm.replace(/[^A-Za-z0-9-]/g, "")}`
    : record.heartbeat
      ? "_hb"
      : "";
  return `${record.deviceId}_${seconds}${suffix}`;
}
