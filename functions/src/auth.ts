import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The Traccar Client SDK posts a plain form with no custom headers, so the
 * shared secret has to ride along inside `serverUrl` itself - either as the
 * first path segment or as a `token` query parameter.
 */
export function hasValidToken(
  path: string,
  query: Record<string, unknown>,
  headers: Record<string, unknown>,
  expected: string,
): boolean {
  if (expected.length === 0) return false;
  return tokenCandidates(path, query, headers).some((candidate) =>
    constantTimeEquals(candidate, expected),
  );
}

function tokenCandidates(
  path: string,
  query: Record<string, unknown>,
  headers: Record<string, unknown>,
): string[] {
  const candidates: string[] = [];

  // https://<host>/ingest/<token>
  const segments = path.split("/").filter((segment) => segment.length > 0);
  if (segments.length > 0) {
    candidates.push(safeDecode(segments[0]));
  }

  // https://<host>/ingest?token=<token>
  if (typeof query.token === "string") {
    candidates.push(query.token);
  }

  // Convenience for manual curl testing.
  if (typeof headers["x-ingest-token"] === "string") {
    candidates.push(headers["x-ingest-token"] as string);
  }

  return candidates;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  // Hash both sides first so the fixed-length compare never leaks how long
  // the real secret is.
  return timingSafeEqual(sha256(a), sha256(b));
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
