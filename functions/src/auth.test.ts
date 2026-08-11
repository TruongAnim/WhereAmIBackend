import assert from "node:assert/strict";
import { test } from "node:test";
import { hasValidToken } from "./auth";

const SECRET = "aB3xK9mQ7pL2";

test("accepts the token as the first path segment", () => {
  assert.equal(hasValidToken(`/${SECRET}`, {}, {}, SECRET), true);
  assert.equal(hasValidToken(`/${SECRET}/`, {}, {}, SECRET), true);
});

test("accepts the token as a query parameter", () => {
  assert.equal(hasValidToken("/", { token: SECRET }, {}, SECRET), true);
});

test("accepts the token as a header for manual testing", () => {
  assert.equal(hasValidToken("/", {}, { "x-ingest-token": SECRET }, SECRET), true);
});

test("rejects a wrong or missing token", () => {
  assert.equal(hasValidToken("/", {}, {}, SECRET), false);
  assert.equal(hasValidToken("/nope", {}, {}, SECRET), false);
  assert.equal(hasValidToken("/", { token: "nope" }, {}, SECRET), false);
  // A prefix of the real secret must not pass.
  assert.equal(hasValidToken(`/${SECRET.slice(0, 6)}`, {}, {}, SECRET), false);
});

test("refuses everything when no secret is configured", () => {
  assert.equal(hasValidToken("/anything", { token: "" }, {}, ""), false);
});

test("handles percent-encoded path segments", () => {
  assert.equal(hasValidToken("/a%20b", {}, {}, "a b"), true);
  // A malformed escape must not throw.
  assert.doesNotThrow(() => hasValidToken("/%E0%A4%A", {}, {}, SECRET));
});
