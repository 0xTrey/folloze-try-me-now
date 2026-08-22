import { describe, expect, it } from "vitest";

import {
  normalizeCompanyIdentity,
  type NormalizeCompanyIdentityInput,
  type NormalizedCompanyIdentity
} from "@/lib/domain-identity";

const observedAt = "2026-08-22T17:00:00.000Z";

function normalize(
  overrides: Partial<NormalizeCompanyIdentityInput> = {}
): NormalizedCompanyIdentity {
  const artifact = normalizeCompanyIdentity({
    sessionId: "session-identity",
    revision: 3,
    submittedDomain: "example.com",
    completedAt: observedAt,
    ...overrides
  });
  expect(artifact.status).toBe("complete");
  expect(artifact.value).toBeDefined();
  return artifact.value!;
}

describe("normalizeCompanyIdentity", () => {
  it("reduces a regional subdomain to its registrable company domain", () => {
    const identity = normalize({
      submittedDomain: "https://www.usa.philips.com/products?region=us",
      companyName: {
        value: "  Philips  ",
        source: "official_metadata",
        confidence: 0.95,
        observedAt,
        revision: 3
      }
    });

    expect(identity).toMatchObject({
      name: "Philips",
      canonicalDomain: "philips.com",
      aliases: ["usa.philips.com"],
      rejectedAliases: []
    });
    expect(identity.revisionFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("accepts an evidence-backed canonical domain and retains the submitted alias", () => {
    const identity = normalize({
      submittedDomain: "datadoghq.com",
      domainEvidence: [{
        value: {
          kind: "canonical-domain",
          domain: "https://www.datadog.com/",
          companyName: "Datadog"
        },
        source: "brandfetch_brand_api",
        confidence: 0.98,
        observedAt,
        revision: 3
      }]
    });

    expect(identity).toMatchObject({
      name: "Datadog",
      canonicalDomain: "datadog.com",
      aliases: ["datadoghq.com"],
      rejectedAliases: []
    });
    expect(identity.evidence.canonicalDomain).toMatchObject({
      value: "datadog.com",
      source: "brandfetch_brand_api",
      confidence: 0.98,
      revision: 3
    });
  });

  it("rejects an unverified lookalike instead of inferring a typo alias", () => {
    const identity = normalize({
      submittedDomain: "philips.com",
      candidateAliases: ["phillips.com", "www.philips.com"],
      domainEvidence: [{
        value: { kind: "alias", domain: "phillips.com" },
        source: "weak_name_match",
        confidence: 0.4,
        observedAt,
        revision: 3
      }]
    });

    expect(identity.canonicalDomain).toBe("philips.com");
    expect(identity.aliases).toEqual([]);
    expect(identity.rejectedAliases).toEqual(["phillips.com"]);
  });

  it("uses redirect and canonical-link evidence to resolve the final domain", () => {
    const identity = normalize({
      submittedDomain: "getacme.com",
      domainEvidence: [
        {
          value: { kind: "redirect", domain: "www.acme.com" },
          source: "https_redirect",
          confidence: 0.99,
          observedAt,
          revision: 3
        },
        {
          value: {
            kind: "canonical-domain",
            domain: "https://acme.io/home",
            companyName: "Acme"
          },
          source: "canonical_link",
          confidence: 0.9,
          observedAt,
          revision: 3
        }
      ]
    });

    expect(identity).toMatchObject({
      name: "Acme",
      canonicalDomain: "acme.io",
      aliases: ["acme.com", "getacme.com"]
    });
    expect(identity.evidence.canonicalDomain.source).toBe("canonical_link");
  });

  it("produces a stable fingerprint from normalized identity content and revision", () => {
    const evidence: NonNullable<NormalizeCompanyIdentityInput["domainEvidence"]> = [
      {
        value: {
          kind: "canonical-domain",
          domain: "datadog.com",
          companyName: "Datadog"
        },
        source: "canonical_link",
        confidence: 0.95,
        observedAt: "2026-08-22T16:00:00.000Z",
        revision: 3
      },
      {
        value: { kind: "alias", domain: "app.datadoghq.com" },
        source: "brand_provider",
        confidence: 0.9,
        observedAt,
        revision: 3
      }
    ];
    const first = normalize({
      submittedDomain: "www.datadoghq.com",
      domainEvidence: evidence,
      candidateAliases: ["app.datadoghq.com", "datadoghq.com"]
    });
    const reordered = normalize({
      submittedDomain: "DATADOGHQ.COM.",
      domainEvidence: [...evidence].reverse().map((item) => ({
        ...item,
        observedAt: "2026-08-22T18:00:00.000Z"
      })),
      candidateAliases: ["datadoghq.com", "app.datadoghq.com"]
    });
    const nextRevision = normalize({
      revision: 4,
      submittedDomain: "datadoghq.com",
      domainEvidence: evidence
    });

    expect(reordered).toMatchObject({
      name: first.name,
      canonicalDomain: first.canonicalDomain,
      aliases: first.aliases
    });
    expect(reordered.revisionFingerprint).toBe(first.revisionFingerprint);
    expect(nextRevision.revisionFingerprint).not.toBe(first.revisionFingerprint);
  });

  it("returns a typed failed artifact for an invalid submitted domain", () => {
    const artifact = normalizeCompanyIdentity({
      sessionId: "session-invalid",
      revision: 1,
      submittedDomain: "not a domain",
      completedAt: observedAt
    });

    expect(artifact).toMatchObject({
      worker: "identity-normalizer",
      sessionId: "session-invalid",
      revision: 1,
      status: "failed",
      confidence: 0,
      errorCode: "invalid_submitted_domain"
    });
    expect(artifact.value).toBeUndefined();
  });
});
