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

export type RecordKind = "alarm" | "event" | "heartbeat" | "fix";

/**
 * An SOS outranks everything: it is the one record a person pressed a button
 * to create, and it carries a position as well as an alarm.
 */
export function recordKind(record: PositionRecord): RecordKind {
  if (record.alarm !== null) return "alarm";
  if (record.event !== null) return "event";
  if (record.heartbeat) return "heartbeat";
  return "fix";
}

const EVENT_LABELS: Record<string, string> = {
  screen_on: "Bật màn hình",
  screen_off: "Tắt màn hình",
};

export function recordTitle(record: PositionRecord): string {
  if (record.alarm !== null) return record.alarm.toUpperCase();
  if (record.event !== null) return EVENT_LABELS[record.event] ?? record.event;
  if (record.heartbeat) return "Nhịp giữ kết nối";
  return "Vị trí";
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
  cellular: "Di động",
  ethernet: "Ethernet",
  vpn: "VPN",
  other: "Khác",
  none: "Mất mạng",
};

export function networkLabel(network: string): string {
  return NETWORK_LABELS[network] ?? network;
}

const ACTIVITY_LABELS: Record<string, string> = {
  still: "Đứng yên",
  walking: "Đi bộ",
  running: "Chạy",
  on_bicycle: "Đạp xe",
  in_vehicle: "Trên xe",
  unknown: "Không rõ",
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

export function formatClock(timeMs: number): string {
  return new Date(timeMs).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** How stale a borrowed position was, phrased for a caption. */
export function formatAge(seconds: number): string {
  if (seconds < 60) return `đo ${seconds} giây trước`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `đo ${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  return `đo ${hours} giờ trước`;
}

export function formatDateTime(timeMs: number): string {
  return new Date(timeMs).toLocaleString("vi-VN");
}
