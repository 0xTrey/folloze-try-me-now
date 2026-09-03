import { beforeEach, describe, expect, it } from "vitest";

import {
  acquirePersonalizationExecution,
  addPersonalizationTargets,
  clearMemoryPersonalizationRequestsForTest,
  createPersonalizationRequest,
  finishPersonalizationExecution,
  getPersonalizationRequest,
  toPublicPersonalizationRequest,
  updatePersonalizationTarget,
  validateTargetDomains
} from "./personalization-request-store";

const digest = "a".repeat(64);
const targets = [
  { domain: "https://www.acme.com/about", role: "Chief financial officer" },
  { domain: "globex.com" },
  { domain: "initech.com", role: "IT leader" }
];

describe("personalization request contract", () => {
  beforeEach(() => clearMemoryPersonalizationRequestsForTest());

  it("requires exactly three unique public domains", () => {
    expect(validateTargetDomains(targets)).toEqual([
      "acme.com",
      "globex.com",
      "initech.com"
    ]);
    expect(() => validateTargetDomains(targets.slice(0, 2))).toThrow(
      "Provide exactly three"
    );
    expect(() =>
      validateTargetDomains([
        { domain: "acme.com" },
        { domain: "www.acme.com" },
        { domain: "initech.com" }
      ])
    ).toThrow("three different");
  });

  it("rejects the seller as a target and oversized roles", async () => {
    await createPersonalizationRequest({
      sessionId: "session-seller-check",
      email: "buyer@example.com",
      artifactRevision: 7,
      artifactDigest: digest
    });
    await expect(
      addPersonalizationTargets("session-seller-check", targets, "acme.com")
    ).rejects.toThrow("other than the company offering");
    await expect(
      addPersonalizationTargets(
        "session-seller-check",
        [
          { domain: "one.com", role: "x".repeat(121) },
          { domain: "two.com" },
          { domain: "three.com" }
        ],
        "seller.com"
      )
    ).rejects.toThrow("120 characters or fewer");
  });

  it("is idempotent for the same frozen baseline and locks changed inputs", async () => {
    const first = await createPersonalizationRequest({
      sessionId: "session-idempotent",
      email: "buyer@example.com",
      artifactRevision: 7,
      artifactDigest: digest
    });
    const repeated = await createPersonalizationRequest({
      sessionId: "session-idempotent",
      email: "buyer@example.com",
      artifactRevision: 7,
      artifactDigest: digest
    });
    expect(repeated.id).toBe(first.id);
    await expect(
      createPersonalizationRequest({
        sessionId: "session-idempotent",
        email: "other@example.com",
        artifactRevision: 7,
        artifactDigest: digest
      })
    ).rejects.toThrow("another email");
    await expect(
      createPersonalizationRequest({
        sessionId: "session-idempotent",
        email: "buyer@example.com",
        artifactRevision: 8,
        artifactDigest: "b".repeat(64)
      })
    ).rejects.toThrow("changed after this request started");
  });

  it("replaces an expired request instead of returning an unusable record", async () => {
    const expired = await createPersonalizationRequest({
      sessionId: "session-expired",
      email: "old@example.com",
      artifactRevision: 3,
      artifactDigest: digest
    });
    const stored = globalThis.__follozePersonalizationRequests?.get(expired.sessionId);
    if (!stored) throw new Error("Expected the request test fixture to exist.");
    stored.expiresAt = new Date(Date.now() - 1_000).toISOString();

    const replacement = await createPersonalizationRequest({
      sessionId: expired.sessionId,
      email: "new@example.com",
      artifactRevision: 4,
      artifactDigest: "b".repeat(64)
    });

    expect(replacement.id).not.toBe(expired.id);
    expect(replacement.email).toBe("new@example.com");
    expect(replacement.baselineArtifactRevision).toBe(4);
    expect(await getPersonalizationRequest(expired.sessionId)).toEqual(replacement);
  });

  it("creates deterministic child identities and settles partial execution", async () => {
    const request = await createPersonalizationRequest({
      sessionId: "session-execution",
      email: "buyer@example.com",
      artifactRevision: 4,
      artifactDigest: digest
    });
    const queued = await addPersonalizationTargets(
      request.sessionId,
      targets,
      "seller.com"
    );
    const repeated = await addPersonalizationTargets(
      request.sessionId,
      targets,
      "seller.com"
    );
    expect(repeated.targets.map((target) => target.generatedSessionId)).toEqual(
      queued.targets.map((target) => target.generatedSessionId)
    );
    expect(new Set(queued.targets.map((target) => target.generatedSessionId)).size).toBe(3);

    const lease = await acquirePersonalizationExecution(request.sessionId);
    expect(lease.acquired).toBe(true);
    if (!lease.acquired) throw new Error("Expected execution lease.");
    const duplicateLease = await acquirePersonalizationExecution(request.sessionId);
    expect(duplicateLease.acquired).toBe(false);

    await updatePersonalizationTarget({
      sessionId: request.sessionId,
      attemptId: lease.attemptId,
      targetId: queued.targets[0]!.id,
      status: "ready",
      link: `/e/${queued.targets[0]!.generatedSessionId}`,
      artifactDigest: "c".repeat(64),
      evidenceCount: 3
    });
    await updatePersonalizationTarget({
      sessionId: request.sessionId,
      attemptId: lease.attemptId,
      targetId: queued.targets[1]!.id,
      status: "needs_review",
      errorCode: "missing target evidence"
    });
    await updatePersonalizationTarget({
      sessionId: request.sessionId,
      attemptId: lease.attemptId,
      targetId: queued.targets[2]!.id,
      status: "failed",
      errorCode: "provider/failure"
    });
    const settled = await finishPersonalizationExecution(
      request.sessionId,
      lease.attemptId
    );
    expect(settled.status).toBe("partial");
    expect(settled.executionAttemptId).toBeUndefined();
    expect(settled.targets.map((target) => target.errorCode)).toEqual([
      undefined,
      "missing_target_evidence",
      "provider_failure"
    ]);
  });

  it("publishes only a masked, bounded browser projection", async () => {
    const request = await createPersonalizationRequest({
      sessionId: "session-public",
      email: "buyer@example.com",
      artifactRevision: 2,
      artifactDigest: digest
    });
    const queued = await addPersonalizationTargets(
      request.sessionId,
      targets,
      "seller.com"
    );
    const projection = toPublicPersonalizationRequest(queued);
    expect(projection.emailMasked).toBe("b***@example.com");
    expect(projection).not.toHaveProperty("email");
    expect(projection).not.toHaveProperty("baselineArtifactDigest");
    expect(projection.targets[0]).not.toHaveProperty("generatedSessionId");
    expect(projection.targets[0]).not.toHaveProperty("artifactDigest");
    expect(await getPersonalizationRequest(request.sessionId)).toBeDefined();
  });
});
