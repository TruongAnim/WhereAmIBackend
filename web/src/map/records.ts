import type { Fix } from "./track";

/**
 * One stored document, whatever kind it is.
 *
 * The map only ever wanted positions, so `Fix` stays the narrow shape that
 * `buildTrack` works with. This is the wide one: everything the backend
 * writes, including the records that carry no coordinates at all.
 */
export interface PositionRecord {
  id: string;
  timeMs: number;
  /** When the server stored it. Null on documents written before this existed. */
  receivedAtMs: number | null;

  lat: number | null;
  lon: number | null;
  accuracy: number | null;
  altitude: number | null;
  /** Metres per second, as stored. */
  speed: number | null;
  bearing: number | null;

  battery: number | null;
  charging: boolean | null;
  batteryTemperature: number | null;

  alarm: string | null;
  /** screen_on, screen_off. Null on ordinary fixes. */
  event: string | null;
  /**
   * Seconds between when the position on this record was measured and when
   * the record was made. Only events have one: they borrow a position the
   * phone already had rather than taking a fresh one.
   */
  positionAge: number | null;
  /** True when the record carries no coordinates. */
  heartbeat: boolean;

  activity: string | null;
  activityConfidence: number | null;
  network: string | null;
  carrier: string | null;
  screenOn: boolean | null;
  provider: string | null;
  satellites: number | null;
  mock: boolean;
}

/**
 * Screen events get a kind each rather than sharing one.
 *
 * They are the two the reader is most likely to be looking for, and the whole
 * point of colouring the map is telling them apart at a glance. "event" is
 * the bucket for a name a future SDK sends that this viewer does not know.
 */
export type RecordKind =
  | "fix"
  | "screen_on"
  | "screen_off"
  | "event"
  | "heartbeat"
  | "alarm";

/**
 * An SOS outranks everything: it is the one record a person pressed a button
 * to create, and it carries a position as well as an alarm.
 */
export function recordKind(record: PositionRecord): RecordKind {
  if (record.alarm !== null) return "alarm";
  if (record.event === "screen_on") return "screen_on";
  if (record.event === "screen_off") return "screen_off";
  if (record.event !== null) return "event";
  if (record.heartbeat) return "heartbeat";
  return "fix";
}

/** Filter chips and the map legend read in this order. */
export const KIND_ORDER: readonly RecordKind[] = [
  "fix",
  "screen_on",
  "screen_off",
  "event",
  "heartbeat",
  "alarm",
];

export const KIND_LABELS: Record<RecordKind, string> = {
  fix: "Position",
  screen_on: "Screen on",
  screen_off: "Screen off",
  event: "Other event",
  heartbeat: "Keep-alive",
  alarm: "SOS",
};

/**
 * One colour per kind, shared by the map dots and the timeline rows.
 *
 * Mid-tone on purpose: these sit on a white page and on a dark one, and a
 * shade picked to look right on either alone goes muddy on the other. The fix
 * colour matches the track line so a point never looks like a different kind
 * of thing from the line it sits on.
 */
export const KIND_COLORS: Record<RecordKind, string> = {
  fix: "#2563eb",
  screen_on: "#f59e0b",
  screen_off: "#8b5cf6",
  event: "#14b8a6",
  heartbeat: "#64748b",
  alarm: "#dc2626",
};

export function recordTitle(record: PositionRecord): string {
  if (record.alarm !== null) return record.alarm.toUpperCase();
  const kind = recordKind(record);
  // An unknown event is worth showing under its raw name; the generic label
  // would hide the one piece of information it carries.
  if (kind === "event") return record.event ?? KIND_LABELS.event;
  return KIND_LABELS[kind];
}

/** The one line under the title in the list. Empty when there is nothing to add. */
export function recordSummary(record: PositionRecord): string {
  const parts: string[] = [];
  if (record.lat !== null && record.lon !== null) {
    parts.push(`${record.lat.toFixed(5)}, ${record.lon.toFixed(5)}`);
  }
  if (record.battery !== null) parts.push(`${record.battery}%`);
  if (record.network !== null) parts.push(NETWORK_LABELS[record.network] ?? record.network);
  return parts.join(" · ");
}

const NETWORK_LABELS: Record<string, string> = {
  wifi: "Wi-Fi",
  cellular: "Cellular",
  ethernet: "Ethernet",
  vpn: "VPN",
  other: "Other",
  none: "Offline",
};

export function networkLabel(network: string): string {
  return NETWORK_LABELS[network] ?? network;
}

const ACTIVITY_LABELS: Record<string, string> = {
  still: "Still",
  walking: "Walking",
  running: "Running",
  on_bicycle: "Cycling",
  in_vehicle: "In a vehicle",
  unknown: "Unknown",
};

export function activityLabel(activity: string): string {
  return ACTIVITY_LABELS[activity] ?? activity;
}

/**
 * Narrows a record to the shape the map draws, or null if it does not belong
 * on the track.
 *
 * Events are excluded even when they carry coordinates. The position on one
 * was measured earlier and borrowed, so joining it to the line would invent a
 * detour, and counting it would add distance the phone never travelled.
 */
export function toFix(record: PositionRecord): Fix | null {
  if (record.event !== null) return null;
  if (record.lat === null || record.lon === null) return null;
  return {
    id: record.id,
    timeMs: record.timeMs,
    lat: record.lat,
    lon: record.lon,
    accuracy: record.accuracy,
    speed: record.speed,
    bearing: record.bearing,
    battery: record.battery,
    charging: record.charging,
    alarm: record.alarm,
  };
}

/**
 * Newest first.
 *
 * Sorted by device time rather than arrival, the same way the track is: an
 * SOS bypasses the upload queue and routinely lands ahead of positions that
 * were recorded before it.
 */
export function sortNewestFirst(records: readonly PositionRecord[]): PositionRecord[] {
  return [...records].sort((a, b) => b.timeMs - a.timeMs);
}

/** How many of each kind are in a day, for the filter chips. */
export function countByKind(
  records: readonly PositionRecord[],
): Record<RecordKind, number> {
  const counts = {
    fix: 0,
    screen_on: 0,
    screen_off: 0,
    event: 0,
    heartbeat: 0,
    alarm: 0,
  };
  for (const record of records) counts[recordKind(record)]++;
  return counts;
}

/** Records whose kind is not hidden. Drives the timeline and the map alike. */
export function visibleRecords(
  records: readonly PositionRecord[],
  hidden: ReadonlySet<RecordKind>,
): PositionRecord[] {
  if (hidden.size === 0) return [...records];
  return records.filter((record) => !hidden.has(recordKind(record)));
}

/** 24-hour on purpose: a tracking log is read by timestamp, not by daypart. */
export function formatClock(timeMs: number): string {
  return new Date(timeMs).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** How stale a borrowed position was, phrased for a caption. */
export function formatAge(seconds: number): string {
  if (seconds < 60) return `measured ${seconds}s earlier`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `measured ${minutes} min earlier`;
  const hours = Math.round(minutes / 60);
  return `measured ${hours}h earlier`;
}

/** Spelled-out month so the day and month can never be read the wrong way round. */
export function formatDateTime(timeMs: number): string {
  return new Date(timeMs).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
