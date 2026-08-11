/**
 * Every judgement call about how a track is drawn is a setting rather than a
 * hard-coded rule. Defaults live in Firestore at `config/map` so they can be
 * changed without a redeploy; each viewer can then override them locally for
 * the session.
 */
export interface MapSettings {
  /** A pause longer than this starts a new segment (or a straight line). */
  gapMinutes: number;
  /** A jump farther than this does the same, however short the pause was. */
  gapDistanceMeters: number;
  /**
   * What to do at a gap. `split` leaves a visible break, `connect` draws a
   * straight line to the next fix.
   */
  gapBehavior: "split" | "connect";
  /** Drop fixes less accurate than this. 0 keeps everything. */
  maxAccuracyMeters: number;
  /** Draw a dot for every fix on top of the line. */
  showPoints: boolean;
  /** Draw the reported accuracy as a translucent circle. */
  showAccuracyCircles: boolean;
  /** Highlight SOS fixes. */
  showAlarms: boolean;
  /** Douglas-Peucker tolerance in metres. 0 disables simplification. */
  simplifyMeters: number;
  speedUnit: "kmh" | "ms";
  /** Swappable without a redeploy if the tile provider ever blocks us. */
  tileUrl: string;
  tileAttribution: string;
  maxZoom: number;
}

export const DEFAULT_SETTINGS: MapSettings = {
  gapMinutes: 15,
  gapDistanceMeters: 500,
  gapBehavior: "split",
  maxAccuracyMeters: 100,
  showPoints: true,
  showAccuracyCircles: false,
  showAlarms: true,
  simplifyMeters: 0,
  speedUnit: "kmh",
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileAttribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
};

/**
 * Keys whose value must be one of a fixed set. They are validated explicitly,
 * and the catch-all string branch must not touch them - otherwise a typo in
 * `config/map` would be stored verbatim and silently break the map.
 */
const ENUM_KEYS = new Set(["gapBehavior", "speedUnit"]);

const NUMERIC_BOUNDS: Record<string, { min: number; max: number }> = {
  gapMinutes: { min: 0, max: 24 * 60 },
  gapDistanceMeters: { min: 0, max: 100_000 },
  maxAccuracyMeters: { min: 0, max: 10_000 },
  simplifyMeters: { min: 0, max: 1_000 },
  maxZoom: { min: 1, max: 22 },
};

/**
 * Merges whatever is stored remotely over the built-in defaults, ignoring
 * anything of the wrong shape. A bad value in `config/map` should degrade to
 * the default, never break the map.
 */
export function mergeSettings(
  base: MapSettings,
  incoming: Record<string, unknown> | null | undefined,
): MapSettings {
  if (!incoming) return { ...base };
  const result: MapSettings = { ...base };
  const baseFields = base as unknown as Record<string, unknown>;
  const resultFields = result as unknown as Record<string, unknown>;

  for (const [key, value] of Object.entries(incoming)) {
    if (!(key in base)) continue;
    const current = baseFields[key];

    if (typeof current === "number" && typeof value === "number" && Number.isFinite(value)) {
      const bounds = NUMERIC_BOUNDS[key];
      resultFields[key] = bounds
        ? Math.min(Math.max(value, bounds.min), bounds.max)
        : value;
    } else if (typeof current === "boolean" && typeof value === "boolean") {
      resultFields[key] = value;
    } else if (key === "gapBehavior" && (value === "split" || value === "connect")) {
      result.gapBehavior = value;
    } else if (key === "speedUnit" && (value === "kmh" || value === "ms")) {
      result.speedUnit = value;
    } else if (
      !ENUM_KEYS.has(key) &&
      typeof current === "string" &&
      typeof value === "string" &&
      value.length > 0
    ) {
      resultFields[key] = value;
    }
  }

  return result;
}
