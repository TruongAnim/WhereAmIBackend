import { initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  GeoPoint,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { defineSecret, defineString } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { hasValidToken } from "./auth";
import { IngestRecord, parseRecord, positionDocId } from "./parse";

initializeApp();

export { bootstrap } from "./bootstrap";

/**
 * Shared secret carried in the ingest URL. The SDK cannot send custom headers,
 * so the token has to travel in the path or query string of `serverUrl`.
 * Set it with: firebase functions:secrets:set INGEST_TOKEN
 */
const ingestToken = defineSecret("INGEST_TOKEN");

/** Comma-separated allow-list of device ids. Empty means "accept any id". */
const allowedDeviceIds = defineString("ALLOWED_DEVICE_IDS", { default: "" });

/** Days to keep history documents. 0 disables the TTL field. */
const retentionDays = defineString("RETENTION_DAYS", { default: "90" });

export const ingest = onRequest(
  {
    region: "asia-southeast1",
    secrets: [ingestToken],
    // Caps the worst case if the URL ever leaks and someone floods it.
    maxInstances: 10,
    memory: "256MiB",
    timeoutSeconds: 30,
    invoker: "public",
  },
  async (req, res) => {
    if (req.method !== "POST" && req.method !== "GET") {
      res.status(405).json({ status: "error", reason: "method not allowed" });
      return;
    }

    if (!hasValidToken(req.path, req.query, req.headers, ingestToken.value())) {
      // 403 (not 200) on purpose: the SDK keeps the position queued and
      // replays it once the token is fixed, so nothing is lost.
      logger.warn("Rejected request with invalid token");
      res.status(403).json({ status: "error", reason: "invalid token" });
      return;
    }

    const params: Record<string, unknown> = {
      ...(req.query as Record<string, unknown>),
      ...((req.body ?? {}) as Record<string, unknown>),
    };

    // A tokenised GET with no payload is a health check.
    if (req.method === "GET" && params.id === undefined) {
      res.status(200).json({ status: "ok" });
      return;
    }

    const parsed = parseRecord(params, Date.now());
    if (!parsed.ok) {
      // Deliberately 200. A 4xx would make the SDK retry this exact payload
      // forever, and a permanently malformed record would block the whole
      // queue behind it (TrackerEngine.syncLoop only ever peeks at the head).
      logger.warn("Ignoring malformed payload", { reason: parsed.reason });
      res.status(200).json({ status: "ignored", reason: parsed.reason });
      return;
    }

    const record = parsed.record;
    const allowList = parseAllowList(allowedDeviceIds.value());
    if (allowList.length > 0 && !allowList.includes(record.deviceId)) {
      // Also 403: if a real device was left off the list by mistake, its data
      // stays queued on the phone instead of being silently dropped.
      logger.warn("Rejected unknown device", { deviceId: record.deviceId });
      res.status(403).json({ status: "error", reason: "unknown device" });
      return;
    }

    try {
      await store(record);
    } catch (error) {
      // 503 -> the SDK retries with exponential backoff (5s up to 5min).
      logger.error("Firestore write failed", { error });
      res.status(503).json({ status: "error", reason: "storage unavailable" });
      return;
    }

    logger.info("Stored position", {
      deviceId: record.deviceId,
      timeMs: record.timeMs,
      heartbeat: record.heartbeat,
      alarm: record.alarm,
      event: record.event,
    });
    res.status(200).json({ status: "ok" });
  },
);

async function store(record: IngestRecord): Promise<void> {
  const db = getFirestore();
  const deviceRef = db.collection("devices").doc(record.deviceId);
  const positionRef = deviceRef.collection("positions").doc(positionDocId(record));

  const time = Timestamp.fromMillis(record.timeMs);
  const expireAt = expiryFor(record.timeMs);

  const position = compact({
    deviceId: record.deviceId,
    time,
    timeMs: record.timeMs,
    lat: record.lat,
    lon: record.lon,
    location:
      record.lat !== null && record.lon !== null
        ? new GeoPoint(record.lat, record.lon)
        : null,
    accuracy: record.accuracy,
    altitude: record.altitude,
    speed: record.speed,
    bearing: record.bearing,
    battery: record.battery,
    charging: record.charging,
    alarm: record.alarm,
    event: record.event,
    positionAge: record.positionAge,
    heartbeat: record.heartbeat,
    ...compact(record.telemetry as unknown as Record<string, unknown>),
    receivedAt: FieldValue.serverTimestamp(),
    expireAt,
  });

  await db.runTransaction(async (tx) => {
    // Buffered positions replay in order, but an SOS bypasses the queue and
    // can land ahead of them. Read before writing so `devices/{id}` always
    // reflects the newest fix rather than the last one to arrive.
    const snapshot = await tx.get(deviceRef);
    const previousFixMs: number = snapshot.get("lastFixTimeMs") ?? 0;
    // Events are excluded even though they now carry coordinates. The position
    // on one was borrowed, not measured, so letting it become the device's
    // latest known location would overwrite a real fix with an older one
    // wearing a newer timestamp.
    const isNewerFix =
      !record.heartbeat && record.event === null && record.timeMs >= previousFixMs;

    const device = compact({
      deviceId: record.deviceId,
      lastSeenAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      battery: record.battery,
      charging: record.charging,
      // Identity is written here alone. Repeating it in every position would
      // be thousands of copies of strings that never change.
      ...compact(record.device as unknown as Record<string, unknown>),
      // Device context belongs to the moment, so the summary keeps the
      // newest reading rather than whatever arrived last.
      ...(isNewerFix
        ? compact(record.telemetry as unknown as Record<string, unknown>)
        : {}),
      ...(isNewerFix
        ? {
            lastFixTimeMs: record.timeMs,
            lastFixTime: time,
            location: new GeoPoint(record.lat as number, record.lon as number),
            lastPosition: compact({
              lat: record.lat,
              lon: record.lon,
              accuracy: record.accuracy,
              altitude: record.altitude,
              speed: record.speed,
              bearing: record.bearing,
            }),
          }
        : {}),
      ...(record.alarm !== null
        ? { lastAlarm: { type: record.alarm, time } }
        : {}),
    });

    tx.set(positionRef, position);
    tx.set(deviceRef, device, { merge: true });
  });
}

function expiryFor(timeMs: number): Timestamp | null {
  const days = Number(retentionDays.value());
  if (!Number.isFinite(days) || days <= 0) return null;
  return Timestamp.fromMillis(timeMs + days * 24 * 60 * 60 * 1000);
}

function parseAllowList(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** Drops null/undefined so documents stay free of empty placeholder fields. */
function compact<T extends Record<string, unknown>>(input: T): Partial<T> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== null && value !== undefined) output[key] = value;
  }
  return output as Partial<T>;
}
