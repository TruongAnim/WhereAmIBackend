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
 *   event     e.g. "screen_on"     only on records that report something
 *                                  other than a position
 *   position_age seconds           only on events, which borrow a position
 *                                  that was already measured
 *
 * Plus device telemetry the SDK appends as extra parameters: activity,
 * activity_confidence, network, carrier, screen, provider, satellites, mock
 * and battery_temperature. Each is optional and each platform fills what it
 * can, so none of them may be required.
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
  /**
   * What this record reports, when it is not a position: "screen_on",
   * "screen_off". Null on ordinary fixes and on keep-alives.
   */
  event: string | null;
  /**
   * How old the position on this record was when it was recorded, in seconds.
   *
   * Only events carry it. They attach a position the platform had already
   * measured rather than taking one on the spot, so the age is the difference
   * between "where the phone is" and "where it was last seen".
   */
  positionAge: number | null;
  /**
   * True when the record carries no coordinates - a keep-alive or an event.
   * The map viewer filters on this to keep positionless records off the track.
   */
  heartbeat: boolean;
  telemetry: Telemetry;
  /**
   * Who the device is. Constant for the life of the app, so it belongs on the
   * device summary and nowhere near the position history.
   */
  device: DeviceInfo;
}

export interface DeviceInfo {
  manufacturer: string | null;
  model: string | null;
  /** Name the owner set in system settings. Often contains a person's name. */
  name: string | null;
  osVersion: string | null;
  sdkInt: number | null;
  appVersion: string | null;
}

/**
 * Device context recorded alongside the fix. Parsed against a fixed set of
 * keys rather than passed through wholesale: these become Firestore fields,
 * and an open map would let anyone holding the ingest URL define the schema.
 */
export interface Telemetry {
  activity: string | null;
  activityConfidence: number | null;
  network: string | null;
  carrier: string | null;
  screenOn: boolean | null;
  provider: string | null;
  satellites: number | null;
  mock: boolean;
  batteryTemperature: number | null;
}

const ACTIVITIES = new Set([
  "still",
  "walking",
  "running",
  "on_bicycle",
  "in_vehicle",
  "unknown",
]);

const NETWORKS = new Set(["wifi", "cellular", "ethernet", "vpn", "other", "none"]);

/**
 * Events the SDK is known to report. Matched against a list rather than stored
 * as free text: this becomes a queryable field, and anyone holding the ingest
 * URL would otherwise get to invent its values.
 */
const EVENTS = new Set(["screen_on", "screen_off"]);

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
  const event = readString(params, "event")?.toLowerCase() ?? null;

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
      event: event !== null && EVENTS.has(event) ? event : null,
      // A day is already far past the point of being worth plotting, and the
      // cap keeps a broken clock from writing an absurd number.
      positionAge: inRange(readNumber(params, "position_age"), 0, 86_400),
      heartbeat: !hasCoordinates,
      telemetry: parseTelemetry(params),
      device: parseDeviceInfo(params),
    },
  };
}

/**
 * Free text from the platform, so these are length-capped rather than matched
 * against a list. Kept as separate fields on purpose - joining manufacturer
 * and model into one label is a display decision, not a storage one.
 */
function parseDeviceInfo(params: Params): DeviceInfo {
  const text = (key: string, max: number) => readString(params, key)?.slice(0, max) ?? null;
  return {
    manufacturer: text("device_manufacturer", 48),
    model: text("device_model", 64),
    name: text("device_name", 64),
    osVersion: text("os_version", 24),
    sdkInt: inRange(readNumber(params, "sdk_int"), 1, 100),
    appVersion: text("app_version", 32),
  };
}

function parseTelemetry(params: Params): Telemetry {
  const activity = readString(params, "activity")?.toLowerCase() ?? null;
  const network = readString(params, "network")?.toLowerCase() ?? null;
  const screen = readString(params, "screen")?.toLowerCase() ?? null;

  return {
    activity: activity !== null && ACTIVITIES.has(activity) ? activity : null,
    activityConfidence: inRange(readNumber(params, "activity_confidence"), 0, 100),
    network: network !== null && NETWORKS.has(network) ? network : null,
    // Operator names are free text from the SIM, so they are length-capped
    // rather than matched against a list.
    carrier: readString(params, "carrier")?.slice(0, 64) ?? null,
    screenOn: screen === "on" ? true : screen === "off" ? false : null,
    provider: readString(params, "provider")?.toLowerCase().slice(0, 32) ?? null,
    satellites: inRange(readNumber(params, "satellites"), 0, 200),
    mock: readString(params, "mock")?.toLowerCase() === "true",
    batteryTemperature: inRange(readNumber(params, "battery_temperature"), -30, 100),
  };
}

/**
 * Deterministic document id so a retried upload overwrites rather than
 * duplicates. The SDK guarantees at-least-once delivery, not exactly-once.
 *
 * The wire timestamp only has second precision, so a heartbeat, an event or
 * an SOS can land in the same second as a regular fix. The suffix keeps those
 * apart - without it the more important record could be silently overwritten.
 *
 * Screen events in particular arrive in pairs seconds apart, and an unlock
 * right after a heartbeat is ordinary, so each kind needs its own slot.
 */
export function positionDocId(record: IngestRecord): string {
  const seconds = Math.floor(record.timeMs / 1000);
  const suffix = record.alarm !== null
    ? `_${record.alarm.replace(/[^A-Za-z0-9-]/g, "")}`
    : record.event !== null
      ? `_${record.event}`
      : record.heartbeat
        ? "_hb"
        : "";
  return `${record.deviceId}_${seconds}${suffix}`;
}
