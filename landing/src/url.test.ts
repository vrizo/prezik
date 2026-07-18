import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAppRedirectUrl, parseAppUrl } from "./url.ts";

const APP_URL = "https://app.present.vrizo.net";

test("adds https:// when the scheme is missing and builds the redirect", () => {
  const redirect = buildAppRedirectUrl("example.com/app", APP_URL);
  assert.equal(
    redirect,
    `https://app.present.vrizo.net/?url=${encodeURIComponent("https://example.com/app")}`,
  );
});

test("keeps an existing scheme and trims whitespace", () => {
  const redirect = buildAppRedirectUrl("  http://example.com  ", APP_URL);
  assert.equal(
    redirect,
    `https://app.present.vrizo.net/?url=${encodeURIComponent("http://example.com/")}`,
  );
});

test("rejects empty input with a friendly message", () => {
  assert.throws(() => parseAppUrl("   "), /paste a url/i);
});

test("rejects non-http(s) schemes and unparsable input", () => {
  assert.throws(() => parseAppUrl("ftp://example.com/file"), /http or https/i);
  assert.throws(() => parseAppUrl("https://"), /valid url/i);
});
