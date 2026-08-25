import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRecord, positionDocId } from "./parse";

const NOW = Date.UTC(2026, 7, 11, 12, 0, 0);
const TIME_SECONDS = Math.floor(NOW / 1000) - 60;

function payload(overrides: Record<string, string> = {}) {
  return {
    id: "123456",
    lat: "10.762622",
    lon: "106.660172",
    timestamp: String(TIME_SECONDS),
    ...overrides,
  };
}

function parsed(overrides: Record<string, string> = {}) {
  const result = parseRecord(payload(overrides), NOW);
  assert.equal(result.ok, true, `expected parse to succeed: ${JSON.stringify(result)}`);
  return result.ok ? result.record : undefined!;
}

test("parses a full position payload", () => {
  const record = parsed({
    accuracy: "12.5",
    altitude: "8.0",
    speed: "10",
    bearing: "180",
    batt: "77",
    charge: "true",
  });

  assert.equal(record.deviceId, "123456");
  assert.equal(record.lat, 10.762622);
  assert.equal(record.lon, 106.660172);
  assert.equal(record.timeMs, TIME_SECONDS * 1000);
  assert.equal(record.accuracy, 12.5);
  assert.equal(record.altitude, 8);
  assert.equal(record.bearing, 180);
  assert.equal(record.battery, 77);
  assert.equal(record.charging, true);
  assert.equal(record.heartbeat, false);
});

test("converts speed from knots to metres per second", () => {
  // The SDK multiplies m/s by 1.94384 before sending, so 10 knots is ~5.144 m/s.
  assert.equal(parsed({ speed: "10" }).speed, 5.144);
  assert.equal(parsed({ speed: "0" }).speed, 0);
  assert.equal(parsed().speed, null);
});

test("treats a payload without coordinates as a heartbeat", () => {
  const result = parseRecord({ id: "123456", timestamp: String(TIME_SECONDS) }, NOW);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.record.heartbeat, true);
  assert.equal(result.record.lat, null);
  assert.equal(result.record.lon, null);
});

test("rejects a half-filled coordinate pair", () => {
  const result = parseRecord(
    { id: "123456", timestamp: String(TIME_SECONDS), lat: "10.5" },
    NOW,
  );
  assert.equal(result.ok, false);
});

test("rejects out-of-range coordinates", () => {
  assert.equal(parseRecord(payload({ lat: "91" }), NOW).ok, false);
  assert.equal(parseRecord(payload({ lon: "181" }), NOW).ok, false);
  assert.equal(parseRecord(payload({ lat: "abc" }), NOW).ok, false);
});

test("requires a usable device id", () => {
  assert.equal(parseRecord(payload({ id: "" }), NOW).ok, false);
  assert.equal(parseRecord(payload({ id: "a/b" }), NOW).ok, false);
  assert.equal(parseRecord(payload({ id: "x".repeat(65) }), NOW).ok, false);
  assert.equal(parseRecord(payload({ id: "phone-01" }), NOW).ok, true);
});

test("rejects implausible timestamps", () => {
  assert.equal(parseRecord(payload({ timestamp: "" }), NOW).ok, false);
  assert.equal(parseRecord(payload({ timestamp: "0" }), NOW).ok, false);
  // 2019 predates the lower bound.
  assert.equal(parseRecord(payload({ timestamp: "1560000000" }), NOW).ok, false);
  // More than a day ahead of the server clock.
  const farFuture = String(Math.floor(NOW / 1000) + 3 * 24 * 60 * 60);
  assert.equal(parseRecord(payload({ timestamp: farFuture }), NOW).ok, false);
});

test("accepts a queued position that is genuinely old", () => {
  // Offline buffering can replay positions days later; that must still work.
  const threeDaysAgo = String(Math.floor(NOW / 1000) - 3 * 24 * 60 * 60);
  assert.equal(parseRecord(payload({ timestamp: threeDaysAgo }), NOW).ok, true);
});

test("accepts millisecond timestamps for hand-made requests", () => {
  const record = parsed({ timestamp: String(TIME_SECONDS * 1000) });
  assert.equal(record.timeMs, TIME_SECONDS * 1000);
});

test("normalises the charge flag", () => {
  assert.equal(parsed({ charge: "true" }).charging, true);
  assert.equal(parsed({ charge: "false" }).charging, false);
  assert.equal(parsed().charging, null);
});

test("drops battery readings outside 0..100", () => {
  assert.equal(parsed({ batt: "-5" }).battery, null);
  assert.equal(parsed({ batt: "150" }).battery, null);
  assert.equal(parsed({ batt: "0" }).battery, 0);
});

test("keeps the alarm flag and caps its length", () => {
  assert.equal(parsed({ alarm: "sos" }).alarm, "sos");
  assert.equal(parsed({ alarm: "x".repeat(100) }).alarm!.length, 32);
});

test("builds a deterministic document id so retries overwrite", () => {
  const first = positionDocId(parsed());
  const second = positionDocId(parsed());
  assert.equal(first, second);
  assert.equal(first, `123456_${TIME_SECONDS}`);
});

test("keeps heartbeats and alarms from colliding with a fix in the same second", () => {
  const fix = positionDocId(parsed());
  const sos = positionDocId(parsed({ alarm: "sos" }));

  const heartbeatResult = parseRecord(
    { id: "123456", timestamp: String(TIME_SECONDS) },
    NOW,
  );
  assert.equal(heartbeatResult.ok, true);
  if (!heartbeatResult.ok) return;
  const heartbeat = positionDocId(heartbeatResult.record);

  assert.equal(sos, `123456_${TIME_SECONDS}_sos`);
  assert.equal(heartbeat, `123456_${TIME_SECONDS}_hb`);
  assert.equal(new Set([fix, sos, heartbeat]).size, 3);
});

test("strips unsafe characters from an alarm used in a document id", () => {
  assert.equal(positionDocId(parsed({ alarm: "a/b" })), `123456_${TIME_SECONDS}_ab`);
});

test("parses device telemetry alongside the fix", () => {
  const record = parsed({
    activity: "walking",
    activity_confidence: "88",
    network: "wifi",
    carrier: "Viettel",
    screen: "on",
    provider: "fused",
    satellites: "11",
    mock: "true",
    battery_temperature: "31.5",
  });

  assert.equal(record.telemetry.activity, "walking");
  assert.equal(record.telemetry.activityConfidence, 88);
  assert.equal(record.telemetry.network, "wifi");
  assert.equal(record.telemetry.carrier, "Viettel");
  assert.equal(record.telemetry.screenOn, true);
  assert.equal(record.telemetry.provider, "fused");
  assert.equal(record.telemetry.satellites, 11);
  assert.equal(record.telemetry.mock, true);
  assert.equal(record.telemetry.batteryTemperature, 31.5);
});

test("leaves telemetry empty when the device sent none", () => {
  const t = parsed().telemetry;
  assert.equal(t.activity, null);
  assert.equal(t.network, null);
  assert.equal(t.carrier, null);
  assert.equal(t.screenOn, null);
  assert.equal(t.satellites, null);
  assert.equal(t.mock, false);
});

test("rejects telemetry values outside the known sets", () => {
  const t = parsed({
    activity: "teleporting",
    network: "carrier-pigeon",
    screen: "maybe",
    activity_confidence: "150",
    satellites: "-3",
    battery_temperature: "900",
  }).telemetry;

  assert.equal(t.activity, null);
  assert.equal(t.network, null);
  assert.equal(t.screenOn, null);
  assert.equal(t.activityConfidence, null);
  assert.equal(t.satellites, null);
  assert.equal(t.batteryTemperature, null);
});

test("treats screen off as false rather than missing", () => {
  assert.equal(parsed({ screen: "off" }).telemetry.screenOn, false);
});

test("caps a carrier name instead of dropping it", () => {
  const t = parsed({ carrier: "x".repeat(200) }).telemetry;
  assert.equal(t.carrier!.length, 64);
});

test("only treats an explicit true as a mock fix", () => {
  assert.equal(parsed({ mock: "false" }).telemetry.mock, false);
  assert.equal(parsed({ mock: "" }).telemetry.mock, false);
  assert.equal(parsed({ mock: "TRUE" }).telemetry.mock, true);
});

test("parses device identity as separate fields", () => {
  const d = parsed({
    device_manufacturer: "samsung",
    device_model: "SM-S921B",
    device_name: "Truong's Phone",
    os_version: "15",
    sdk_int: "35",
    app_version: "1.0",
  }).device;

  assert.equal(d.manufacturer, "samsung");
  assert.equal(d.model, "SM-S921B");
  assert.equal(d.name, "Truong's Phone");
  assert.equal(d.osVersion, "15");
  assert.equal(d.sdkInt, 35);
  assert.equal(d.appVersion, "1.0");
});

test("leaves device identity empty when nothing was sent", () => {
  const d = parsed().device;
  assert.equal(d.manufacturer, null);
  assert.equal(d.model, null);
  assert.equal(d.name, null);
  assert.equal(d.sdkInt, null);
});

test("caps device identity strings rather than dropping them", () => {
  const d = parsed({ device_name: "x".repeat(500), device_model: "y".repeat(500) }).device;
  assert.equal(d.name!.length, 64);
  assert.equal(d.model!.length, 64);
});

test("rejects an implausible sdk level", () => {
  assert.equal(parsed({ sdk_int: "0" }).device.sdkInt, null);
  assert.equal(parsed({ sdk_int: "9999" }).device.sdkInt, null);
  assert.equal(parsed({ sdk_int: "24" }).device.sdkInt, 24);
});
