import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHeaders } from "./headers.js";

test("parses repeated Key: Value headers, trimming around the separator", () => {
  assert.deepEqual(parseHeaders(["Authorization: Bearer abc123", "X-Trace:  t-1 "]), {
    Authorization: "Bearer abc123",
    "X-Trace": "t-1",
  });
});

test("keeps colons inside the value (e.g. a URL)", () => {
  assert.deepEqual(parseHeaders(["Referer: https://example.com/x"]), { Referer: "https://example.com/x" });
});

test("no headers at all yields undefined, so the connect call omits the option entirely", () => {
  assert.equal(parseHeaders([]), undefined);
});

test("a malformed header is rejected without echoing the argument, which may be a secret", () => {
  assert.throws(
    () => parseHeaders(["Authorization: Bearer good", "Authorization Bearer sk-live-supersecret"]),
    (err: Error) => {
      assert.ok(!err.message.includes("sk-live-supersecret"), `error message leaked the secret: ${err.message}`);
      assert.ok(err.message.includes("position 2"), `expected the position of the bad argument, got: ${err.message}`);
      return true;
    },
  );
});
