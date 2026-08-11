import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS, mergeSettings } from "../settings/settings";
import { buildTrack, dayBounds, distanceMeters, simplify, type Fix } from "./track";

const MINUTE = 60_000;

function fix(overrides: Partial<Fix> & { timeMs: number }): Fix {
  return {
    id: `f${overrides.timeMs}`,
    lat: 10.762622,
    lon: 106.660172,
    accuracy: 10,
    speed: null,
    bearing: null,
    battery: null,
    charging: null,
    alarm: null,
    ...overrides,
  };
}

/** Roughly 111 m per 0.001 degree of latitude. */
function north(base: Fix, metres: number, timeMs: number): Fix {
  return fix({ ...base, id: `f${timeMs}`, timeMs, lat: base.lat + metres / 111_320 });
}

test("sorts by device time, not by arrival order", () => {
  const later = fix({ timeMs: 2 * MINUTE });
  const earlier = fix({ timeMs: 1 * MINUTE });
  const track = buildTrack([later, earlier], DEFAULT_SETTINGS);
  const times = track.segments.flatMap((s) => s.points.map((p) => p.timeMs));
  assert.deepEqual(times, [1 * MINUTE, 2 * MINUTE]);
});

test("splits the line when the pause exceeds the gap threshold", () => {
  const a = fix({ timeMs: 0 });
  const b = north(a, 50, 5 * MINUTE);
  const c = north(a, 100, 40 * MINUTE); // 35 minutes later

  const track = buildTrack([a, b, c], { ...DEFAULT_SETTINGS, gapMinutes: 15 });
  assert.equal(track.segments.length, 2);
  assert.equal(track.segments[0].points.length, 2);
  assert.equal(track.segments[1].startsAfterGap, true);
});

test("draws straight through the same gap when the setting says connect", () => {
  const a = fix({ timeMs: 0 });
  const b = north(a, 50, 5 * MINUTE);
  const c = north(a, 100, 40 * MINUTE);

  const track = buildTrack([a, b, c], {
    ...DEFAULT_SETTINGS,
    gapMinutes: 15,
    gapBehavior: "connect",
  });
  assert.equal(track.segments.length, 1);
  assert.equal(track.segments[0].points.length, 3);
});

test("splits on a distance jump even when the pause is short", () => {
  const a = fix({ timeMs: 0 });
  const b = north(a, 5_000, 1 * MINUTE); // 5 km in a minute

  const track = buildTrack([a, b], { ...DEFAULT_SETTINGS, gapDistanceMeters: 500 });
  assert.equal(track.segments.length, 2);
});

test("reports identical stats whichever way a gap is drawn", () => {
  const a = fix({ timeMs: 0 });
  const b = north(a, 50, 5 * MINUTE);
  const c = north(a, 100, 40 * MINUTE);

  const split = buildTrack([a, b, c], { ...DEFAULT_SETTINGS, gapBehavior: "split" });
  const connected = buildTrack([a, b, c], { ...DEFAULT_SETTINGS, gapBehavior: "connect" });
  assert.equal(
    Math.round(split.stats.distanceMeters),
    Math.round(connected.stats.distanceMeters),
  );
  assert.equal(split.stats.usedFixes, connected.stats.usedFixes);
});

test("drops vague fixes but never drops an SOS", () => {
  const good = fix({ timeMs: 0, accuracy: 10 });
  const vague = fix({ timeMs: MINUTE, accuracy: 500 });
  const vagueSos = fix({ timeMs: 2 * MINUTE, accuracy: 500, alarm: "sos" });

  const track = buildTrack([good, vague, vagueSos], {
    ...DEFAULT_SETTINGS,
    maxAccuracyMeters: 100,
  });
  assert.equal(track.stats.droppedByAccuracy, 1);
  assert.equal(track.stats.usedFixes, 2);
  assert.equal(track.stats.alarms.length, 1);
});

test("keeps everything when the accuracy filter is disabled", () => {
  const track = buildTrack(
    [fix({ timeMs: 0, accuracy: 9_999 })],
    { ...DEFAULT_SETTINGS, maxAccuracyMeters: 0 },
  );
  assert.equal(track.stats.usedFixes, 1);
  assert.equal(track.stats.droppedByAccuracy, 0);
});

test("tolerates fixes with no accuracy reported", () => {
  const track = buildTrack([fix({ timeMs: 0, accuracy: null })], DEFAULT_SETTINGS);
  assert.equal(track.stats.usedFixes, 1);
});

test("handles an empty day", () => {
  const track = buildTrack([], DEFAULT_SETTINGS);
  assert.deepEqual(track.segments, []);
  assert.equal(track.stats.firstTimeMs, null);
  assert.equal(track.stats.distanceMeters, 0);
});

test("measures distance with haversine", () => {
  const a = fix({ timeMs: 0 });
  const b = north(a, 1_000, MINUTE);
  assert.ok(Math.abs(distanceMeters(a, b) - 1_000) < 5);
});

test("simplify keeps the endpoints and removes collinear points", () => {
  const a = fix({ timeMs: 0 });
  const points = [a, north(a, 100, MINUTE), north(a, 200, 2 * MINUTE), north(a, 300, 3 * MINUTE)];
  const result = simplify(points, 10);
  assert.equal(result.length, 2);
  assert.equal(result[0].timeMs, 0);
  assert.equal(result[1].timeMs, 3 * MINUTE);
});

test("simplify preserves a genuine detour", () => {
  const a = fix({ timeMs: 0 });
  const detour = fix({ timeMs: MINUTE, lat: a.lat, lon: a.lon + 0.01 });
  const end = north(a, 300, 2 * MINUTE);
  assert.equal(simplify([a, detour, end], 10).length, 3);
});

test("day bounds cover local midnight to midnight", () => {
  const { startMs, endMs } = dayBounds("2026-08-12");
  const start = new Date(startMs);
  const end = new Date(endMs);
  assert.equal(start.getHours(), 0);
  assert.equal(start.getDate(), 12);
  assert.equal(end.getHours(), 23);
  assert.ok(endMs - startMs < 24 * 60 * 60 * 1000);
});

test("remote defaults override the built-ins", () => {
  const merged = mergeSettings(DEFAULT_SETTINGS, {
    gapMinutes: 30,
    gapBehavior: "connect",
    tileUrl: "https://example.org/{z}/{x}/{y}.png",
  });
  assert.equal(merged.gapMinutes, 30);
  assert.equal(merged.gapBehavior, "connect");
  assert.equal(merged.tileUrl, "https://example.org/{z}/{x}/{y}.png");
  assert.equal(merged.maxAccuracyMeters, DEFAULT_SETTINGS.maxAccuracyMeters);
});

test("remote defaults of the wrong shape fall back instead of breaking", () => {
  const merged = mergeSettings(DEFAULT_SETTINGS, {
    gapMinutes: "soon",
    gapBehavior: "sometimes",
    showPoints: "yes",
    unknownKey: 5,
    simplifyMeters: -100,
  });
  assert.equal(merged.gapMinutes, DEFAULT_SETTINGS.gapMinutes);
  assert.equal(merged.gapBehavior, DEFAULT_SETTINGS.gapBehavior);
  assert.equal(merged.showPoints, DEFAULT_SETTINGS.showPoints);
  assert.equal(merged.simplifyMeters, 0);
  assert.ok(!("unknownKey" in merged));
});
