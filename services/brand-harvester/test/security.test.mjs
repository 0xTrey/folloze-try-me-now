import assert from "node:assert/strict";
import test from "node:test";
import { assertPublicUrl, isPublicAddress, parseSourceUrl, publicUrlWithoutQuery } from "../src/security.mjs";

test("rejects local, private, credentialed, non-HTTPS, and alternate-port source URLs", () => {
  for (const value of [
    "http://example.com", "https://localhost", "https://127.0.0.1", "https://10.0.0.1",
    "https://user:pass@example.com", "https://example.com:8443"
  ]) assert.throws(() => parseSourceUrl(value));
});

test("rejects DNS answers containing non-public addresses", async () => {
  await assert.rejects(
    assertPublicUrl("https://example.com", async () => [{ address: "93.184.216.34" }, { address: "127.0.0.1" }]),
    /source_url_host_not_public/
  );
});

test("accepts public DNS and strips public asset query material", async () => {
  const url = await assertPublicUrl("https://example.com/path?secret=yes", async () => [{ address: "93.184.216.34" }]);
  assert.equal(url.hostname, "example.com");
  assert.equal(publicUrlWithoutQuery("https://cdn.example.com/logo.svg?signature=secret#x"), "https://cdn.example.com/logo.svg");
  assert.equal(publicUrlWithoutQuery("data:image/svg+xml,secret"), undefined);
  assert.equal(publicUrlWithoutQuery("http://cdn.example.com/logo.svg"), undefined);
});

test("classifies representative IPv4 and IPv6 network ranges", () => {
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("192.168.1.20"), false);
  assert.equal(isPublicAddress("169.254.169.254"), false);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  assert.equal(isPublicAddress("::1"), false);
  assert.equal(isPublicAddress("fd00::1"), false);
});
