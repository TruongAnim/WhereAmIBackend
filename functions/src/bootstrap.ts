import { FieldValue, getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { hasValidToken } from "./auth";

const ingestToken = defineSecret("INGEST_TOKEN");

/**
 * Creates the very first admin, because Firestore rules let only an existing
 * admin write to /access and there is no admin to start with.
 *
 * Deliberately inert once an admin exists: after the first successful call it
 * can only ever return 409, so it is not a standing back door. Everything
 * afterwards is managed from the web admin panel.
 *
 *   curl -X POST -d "email=you@gmail.com" \
 *     https://asia-southeast1-<project>.cloudfunctions.net/bootstrap/<TOKEN>
 */
export const bootstrap = onRequest(
  {
    region: "asia-southeast1",
    secrets: [ingestToken],
    maxInstances: 2,
    memory: "256MiB",
    timeoutSeconds: 30,
    invoker: "public",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ status: "error", reason: "method not allowed" });
      return;
    }

    if (!hasValidToken(req.path, req.query, req.headers, ingestToken.value())) {
      logger.warn("Rejected bootstrap with invalid token");
      res.status(403).json({ status: "error", reason: "invalid token" });
      return;
    }

    const params: Record<string, unknown> = {
      ...(req.query as Record<string, unknown>),
      ...((req.body ?? {}) as Record<string, unknown>),
    };
    const raw = typeof params.email === "string" ? params.email.trim().toLowerCase() : "";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) {
      res.status(400).json({ status: "error", reason: "missing or malformed email" });
      return;
    }

    const db = getFirestore();

    const existingAdmins = await db
      .collection("access")
      .where("role", "==", "admin")
      .limit(1)
      .get();
    if (!existingAdmins.empty) {
      res.status(409).json({
        status: "error",
        reason: "an admin already exists - manage access from the web admin panel",
      });
      return;
    }

    await db.collection("access").doc(raw).set({
      email: raw,
      role: "admin",
      note: "bootstrap admin",
      addedBy: "bootstrap",
      addedAt: FieldValue.serverTimestamp(),
    });

    // Seed the config documents so the rules' get() calls never hit a missing
    // document, and so the web app has defaults to read on first load.
    await db.collection("config").doc("access").set(
      { allowAllAuthenticated: false, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    await db.collection("config").doc("map").set(
      { updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

    logger.info("Bootstrapped first admin", { email: raw });
    res.status(200).json({ status: "ok", admin: raw });
  },
);
