import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AgentMailAmbiguousError,
  AgentMailRejectedError,
  sendAgentMailMessage
} from "@/lib/integrations/agentmail";
import { runPersonalizationDelivery } from "@/lib/personalization-delivery";
import {
  acquirePersonalizationDelivery,
  acquirePersonalizationExecution,
  addPersonalizationTargets,
  clearMemoryPersonalizationRequestsForTest,
  createPersonalizationRequest,
  finishPersonalizationExecution,
  getPersonalizationRequest,
  markPersonalizationDeliveryNotConfigured,
  recordPersonalizationDeliveryAccepted,
  recordPersonalizationDeliveryFailure,
  updatePersonalizationTarget
} from "@/lib/personalization-request-store";

const digest = "a".repeat(64);
const appUrl = "https://folloze-try-me-now.vercel.app";

async function terminalRequest(readyCount = 3) {
  const request = await createPersonalizationRequest({
    sessionId: `delivery-session-${readyCount}`,
    email: "buyer@example.com",
    artifactRevision: 4,
    artifactDigest: digest
  });
  const queued = await addPersonalizationTargets(
    request.sessionId,
    [
      { domain: "alpha.com", role: "CFO" },
      { domain: "beta.com" },
      { domain: "gamma.com", role: "COO" }
    ],
    "seller.com"
  );
  const execution = await acquirePersonalizationExecution(request.sessionId);
  if (!execution.acquired) throw new Error("Expected generation lease.");
  for (const [index, target] of queued.targets.entries()) {
    await updatePersonalizationTarget({
      sessionId: request.sessionId,
      attemptId: execution.attemptId,
      targetId: target.id,
      status: index < readyCount ? "ready" : "failed",
      ...(index < readyCount
        ? {
            link: `/e/${target.generatedSessionId}`,
            artifactDigest: `${index + 1}`.repeat(64),
            evidenceCount: 2
          }
        : { errorCode: "quality_gate_failed" })
    });
  }
  await finishPersonalizationExecution(request.sessionId, execution.attemptId);
  return request.sessionId;
}

type AgentMailInput = Parameters<typeof sendAgentMailMessage>[0];

function dependencies(send: typeof sendAgentMailMessage, configured = true) {
  return {
    providerConfigured: () => configured,
    apiKey: () => "server-only-key",
    inboxId: () => "try@follozemarketing.com",
    replyTo: () => "trey@folloze.com",
    appUrl: () => appUrl,
    getSession: vi.fn(async () => ({
      companyDomain: "seller.com",
      brand: { companyName: "Seller Company" }
    })),
    getRequest: getPersonalizationRequest,
    markNotConfigured: markPersonalizationDeliveryNotConfigured,
    acquire: acquirePersonalizationDelivery,
    recordAccepted: recordPersonalizationDeliveryAccepted,
    recordFailure: recordPersonalizationDeliveryFailure,
    send
  };
}

describe("personalization delivery", () => {
  beforeEach(() => clearMemoryPersonalizationRequestsForTest());

  it("sends one idempotent message after all three final links settle", async () => {
    const sessionId = await terminalRequest(3);
    const send = vi.fn(async (input: AgentMailInput) => {
      void input;
      return {
        messageId: "message-1",
        threadId: "thread-1"
      };
    });
    const contract = dependencies(send);

    const [first, second] = await Promise.all([
      runPersonalizationDelivery(sessionId, contract as never),
      runPersonalizationDelivery(sessionId, contract as never)
    ]);

    expect(send).toHaveBeenCalledOnce();
    expect(first?.delivery?.status ?? second?.delivery?.status).toBe("accepted");
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        inboxId: "try@follozemarketing.com",
        recipient: "buyer@example.com",
        idempotencyKey: expect.stringMatching(/^try-me-personalization-/),
        subject: "Your 3 personalized Seller Company experiences are ready"
      })
    );
    const message = send.mock.calls[0]![0];
    expect(message.text).toContain(`${appUrl}/e/`);
    expect(message.html).toContain("alpha.com");
    expect(message.html).toContain("gamma.com");
  });

  it("sends only the final links for a partial result and marks provider rejection", async () => {
    const sessionId = await terminalRequest(1);
    const send = vi.fn(async (input: AgentMailInput) => {
      void input;
      throw new AgentMailRejectedError(403);
    });
    const result = await runPersonalizationDelivery(
      sessionId,
      dependencies(send) as never
    );

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![0].subject).toContain("1 personalized");
    expect(send.mock.calls[0]![0].html).toContain("alpha.com");
    expect(send.mock.calls[0]![0].html).not.toContain("beta.com");
    expect(result?.delivery?.status).toBe("failed");
    expect(result?.delivery?.errorCode).toBe("agentmail_rejected_403");
  });

  it("records unconfigured and ambiguous outcomes without claiming delivery", async () => {
    const unconfiguredSession = await terminalRequest(2);
    const noSend = vi.fn(async (input: AgentMailInput) => {
      void input;
      return {
        messageId: "unused",
        threadId: "unused"
      };
    });
    const unconfigured = await runPersonalizationDelivery(
      unconfiguredSession,
      dependencies(noSend, false) as never
    );
    expect(noSend).not.toHaveBeenCalled();
    expect(unconfigured?.delivery?.status).toBe("not_configured");

    clearMemoryPersonalizationRequestsForTest();
    const uncertainSession = await terminalRequest(2);
    const ambiguous = vi.fn(async (input: AgentMailInput) => {
      void input;
      throw new AgentMailAmbiguousError();
    });
    const uncertain = await runPersonalizationDelivery(
      uncertainSession,
      dependencies(ambiguous) as never
    );
    expect(uncertain?.delivery?.status).toBe("uncertain");
    expect(uncertain?.delivery?.errorCode).toBe("agentmail_result_uncertain");
  });
});
