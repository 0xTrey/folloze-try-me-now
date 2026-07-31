import { describe, expect, it } from "vitest";

import { experienceDocumentHeaders, nonceExperienceRuntime } from "./security-headers";

describe("generated experience security headers", () => {
  // Regression: QA ISSUE-005. The embedded document keeps its real origin for
  // protected resources while only the server-nonced runtime can execute.
  it("allows only the response-nonced generated runtime", () => {
    const headers = experienceDocumentHeaders("qa-nonce");
    const policy = headers["Content-Security-Policy"];

    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("script-src 'nonce-qa-nonce'");
    expect(policy).not.toContain("script-src 'unsafe-inline'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("form-action 'none'");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
  });

  it("nonces only the marked runtime and leaves injected scripts unauthorized", () => {
    const html = '<script>alert("injected")</script><script data-flz-runtime>run()</script>';
    const protectedHtml = nonceExperienceRuntime(html, "qa-nonce");

    expect(protectedHtml).toContain('<script>alert("injected")</script>');
    expect(protectedHtml).toContain('<script data-flz-runtime nonce="qa-nonce">run()</script>');
    expect(protectedHtml.match(/nonce="qa-nonce"/g)).toHaveLength(1);
  });
});
