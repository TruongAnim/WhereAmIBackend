import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countByKind,
  recordKind,
  recordSummary,
  recordTitle,
  sortNewestFirst,
  toFix,
  visibleRecords,
  type PositionRecord,
} from "./records";

function record(overrides: Partial<PositionRecord> = {}): PositionRecord {
  return {
    id: "dev_1000",
    timeMs: 1_000_000,
    receivedAtMs: null,
    lat: null,
    lon: null,
    accuracy: null,
    altitude: null,
    speed: null,
    bearing: null,
    battery: null,
    charging: null,
    batteryTemperature: null,
    alarm: null,
    event: null,
    positionAge: null,
    heartbeat: false,
    activity: null,
    activityConfidence: null,
    network: null,
    carrier: null,
    screenOn: null,
    provider: null,
    satellites: null,
    mock: false,
    ...overrides,
  };
}

test("classifies each kind of record", () => {
  assert.equal(recordKind(record({ lat: 10, lon: 106 })), "fix");
  assert.equal(recordKind(record({ heartbeat: true })), "heartbeat");
  assert.equal(recordKind(record({ lat: 10, lon: 106, alarm: "sos" })), "alarm");
});

test("gives each screen event its own kind so the map can colour them apart", () => {
  assert.equal(recordKind(record({ event: "screen_on" })), "screen_on");
  assert.equal(recordKind(record({ event: "screen_off" })), "screen_off");
});

test("buckets an event name it does not know", () => {
  // A future SDK may send something this viewer predates. It must still be
  // listed and drawn rather than disappearing into the fix bucket.
  assert.equal(recordKind(record({ event: "boot" })), "event");
});

test("puts an SOS ahead of the event it arrived with", () => {
  // An SOS carries a position and an alarm at once. It must not be filed as
  // an ordinary fix, or the one record a person pressed a button to make
  // would look like every other point on the map.
  const sos = record({ lat: 10, lon: 106, alarm: "sos", event: "screen_on" });
  assert.equal(recordKind(sos), "alarm");
});

test("gives every kind a readable name", () => {
  assert.equal(recordTitle(record({ event: "screen_on", heartbeat: true })), "Screen on");
  assert.equal(recordTitle(record({ event: "screen_off", heartbeat: true })), "Screen off");
  assert.equal(recordTitle(record({ heartbeat: true })), "Keep-alive");
  assert.equal(recordTitle(record({ lat: 1, lon: 2 })), "Position");
});

test("falls back to the raw name for an event it does not know", () => {
  // The backend only stores names from its own list, but a future SDK could
  // add one before this viewer is redeployed.
  assert.equal(recordTitle(record({ event: "boot", heartbeat: true })), "boot");
});

test("summarises whatever the record happens to carry", () => {
  assert.equal(
    recordSummary(record({ lat: 10.762622, lon: 106.660172, battery: 64, network: "wifi" })),
    "10.76262, 106.66017 · 64% · Wi-Fi",
  );
  assert.equal(recordSummary(record({ battery: 64 })), "64%");
  assert.equal(recordSummary(record()), "");
});

test("keeps a zero battery out of the summary's blank case", () => {
  // 0% is a reading, not a missing value; dropping it would hide the one
  // battery level worth noticing.
  assert.equal(recordSummary(record({ battery: 0 })), "0%");
});

test("narrows only records that have coordinates", () => {
  assert.equal(toFix(record({ heartbeat: true })), null);
  const fix = toFix(record({ lat: 10, lon: 106, accuracy: 12 }));
  assert.equal(fix?.lat, 10);
  assert.equal(fix?.accuracy, 12);
});

test("keeps events off the track even when they carry a position", () => {
  // The position on an event was borrowed from an earlier measurement.
  // Joining it to the line would invent a detour and add distance the phone
  // never travelled.
  const unlock = record({ lat: 10, lon: 106, event: "screen_on", positionAge: 240 });
  assert.equal(toFix(unlock), null);
});

test("orders by device time, newest first", () => {
  const older = record({ id: "a", timeMs: 1 });
  const newer = record({ id: "b", timeMs: 2 });
  assert.deepEqual(
    sortNewestFirst([older, newer]).map((r) => r.id),
    ["b", "a"],
  );
});

test("leaves the input array untouched", () => {
  const input = [record({ id: "a", timeMs: 1 }), record({ id: "b", timeMs: 2 })];
  sortNewestFirst(input);
  assert.deepEqual(input.map((r) => r.id), ["a", "b"]);
});

test("counts every kind, including the ones a day has none of", () => {
  const counts = countByKind([
    record({ id: "a", lat: 10, lon: 106 }),
    record({ id: "b", lat: 10, lon: 106 }),
    record({ id: "c", event: "screen_on" }),
    record({ id: "d", heartbeat: true }),
  ]);
  assert.equal(counts.fix, 2);
  assert.equal(counts.screen_on, 1);
  assert.equal(counts.heartbeat, 1);
  // Present as a zero rather than missing, so the caller can decide whether
  // to show a chip without checking for undefined.
  assert.equal(counts.alarm, 0);
});

test("hiding a kind removes it from the one list both views read", () => {
  const all = [
    record({ id: "a", lat: 10, lon: 106 }),
    record({ id: "b", event: "screen_on" }),
    record({ id: "c", event: "screen_off" }),
  ];
  const shown = visibleRecords(all, new Set(["screen_off"]));
  assert.deepEqual(shown.map((r) => r.id), ["a", "b"]);
});

test("hides nothing when nothing is switched off", () => {
  const all = [record({ id: "a" }), record({ id: "b" })];
  assert.equal(visibleRecords(all, new Set()).length, 2);
});
