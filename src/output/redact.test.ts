import { test } from "node:test";
import assert from "node:assert/strict";
import { redactUrl } from "./redact.js";

test("HTTP basic-auth userinfo is stripped from the URL", () => {
  assert.equal(redactUrl("https://alice:hunter2@example.com/app"), "https://example.com/app");
  assert.equal(redactUrl("https://sometoken@example.com/app"), "https://example.com/app");
});

test("secret-ish query parameter values are replaced, keys and order preserved", () => {
  const out = redactUrl("https://example.com/app?token=abc123&api_key=xyz&page=2");

  assert.ok(!out.includes("abc123"), `expected the token value to be redacted, got: ${out}`);
  assert.ok(!out.includes("xyz"), `expected the api_key value to be redacted, got: ${out}`);
  assert.ok(out.includes("token=%5Bredacted%5D") || out.includes("token=[redacted]"), `expected a redaction marker, got: ${out}`);
  assert.ok(out.includes("page=2"), `expected benign params to survive, got: ${out}`);
});

test("secret-ish parameter names are matched case-insensitively", () => {
  const out = redactUrl("https://example.com/?Access_Token=abc&SIGNATURE=def&PWD=ghi");

  for (const secret of ["abc", "def", "ghi"]) {
    assert.ok(!out.includes(secret), `expected ${secret} to be redacted, got: ${out}`);
  }
});

test("path, fragment and benign params are left untouched", () => {
  const url = "https://example.com/a/b/c?q=hello%20world&page=2#section-3";
  assert.equal(redactUrl(url), url);
});

test("file:// URLs pass through unchanged", () => {
  const url = "file:///Users/someone/projects/windtailor/fixtures/simple.html";
  assert.equal(redactUrl(url), url);
});

test("a non-parseable or relative input is returned unchanged rather than throwing", () => {
  assert.equal(redactUrl("not a url at all"), "not a url at all");
  assert.equal(redactUrl("./fixtures/simple.html"), "./fixtures/simple.html");
  assert.equal(redactUrl(""), "");
});
