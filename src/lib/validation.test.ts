import { describe, expect, it } from "vitest";

import { assertBusinessEmail, maskEmail, normalizeDomain } from "@/lib/validation";

describe("normalizeDomain", () => {
  it.each([
    ["acme.com", "acme.com"],
    ["HTTPS://WWW.Acme.com/", "acme.com"],
    ["  subdomain.acme.co.uk  ", "subdomain.acme.co.uk"]
  ])("normalizes %s", (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });

  it.each(["localhost", "127.0.0.1", "https://user:pass@acme.com", "acme.com:8443", "not a domain"])(
    "rejects unsafe or non-company hostname %s",
    (input) => {
      expect(() => normalizeDomain(input)).toThrow();
    }
  );
});

describe("business email claim", () => {
  it("normalizes business email and masks it for client display", () => {
    const email = assertBusinessEmail("  Trey@Folloze.com ");
    expect(email).toBe("trey@folloze.com");
    expect(maskEmail(email)).toBe("tr••@folloze.com");
  });

  it.each(["person@gmail.com", "person@outlook.com", "person@proton.me"])(
    "rejects consumer mailbox %s",
    (email) => {
      expect(() => assertBusinessEmail(email)).toThrow("business email");
    }
  );
});
