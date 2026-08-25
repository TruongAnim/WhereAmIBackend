import assert from "node:assert/strict";
import { test } from "node:test";
import {
  recordKind,
  recordSummary,
  recordTitle,
  sortNewestFirst,
  toFix,
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
  assert.equal(recordKind(record({ event: "screen_on", heartbeat: true })), "event");
  assert.equal(recordKind(record({ heartbeat: true })), "heartbeat");
  assert.equal(recordKind(record({ lat: 10, lon: 106, alarm: "sos" })), "alarm");
});

test("puts an SOS ahead of the event it arrived with", () => {
  // An SOS carries a position and an alarm at once. It must not be filed as
  // an ordinary fix, or the one record a person pressed a button to make
  // would look like every other point on the map.
  const sos = record({ lat: 10, lon: 106, alarm: "sos", event: "screen_on" });
  assert.equal(recordKind(sos), "alarm");
});

test("names screen events in the reader's language", () => {
  assert.equal(recordTitle(record({ event: "screen_on", heartbeat: true })), "Bật màn hình");
  assert.equal(recordTitle(record({ event: "screen_off", heartbeat: true })), "Tắt màn hình");
  assert.equal(recordTitle(record({ heartbeat: true })), "Nhịp giữ kết nối");
  assert.equal(recordTitle(record({ lat: 1, lon: 2 })), "Vị trí");
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
