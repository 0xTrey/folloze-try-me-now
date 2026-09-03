import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AgentMailAmbiguousError,
  AgentMailRejectedError,
  sendAgentMailMessage
} from "./agentmail";

afterEach(() => vi.restoreAllMocks());

const input = {
  apiKey: "server-only-secret",
  inboxId: "try@follozemarketing.com",
  recipient: "buyer@example.com",
  subject: "Your experiences are ready",
  text: "Three links are ready.",
  html: "<!doctype html><html><body>Three links are ready.</body></html>",
  idempotencyKey: "try-me-personalization-request-1",
  replyTo: "trey@folloze.com"
};

describe("AgentMail transport", () => {
  it("sends a bounded transactional payload with provider idempotency", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ message_id: "message-1", thread_id: "thread-1" }),
        { status: 200 }
      )
    );

    await expect(sendAgentMailMessage(input)).resolves.toEqual({
      messageId: "message-1",
      threadId: "thread-1"
    });

    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://api.agentmail.to/v0/inboxes/try%40follozemarketing.com/messages/send"
    );
    expect(options?.method).toBe("POST");
    expect((options?.headers as Record<string, string>)["Idempotency-Key"]).toBe(
      input.idempotencyKey
    );
    const body = JSON.parse(String(options?.body));
    expect(body).toEqual({
      to: ["buyer@example.com"],
      subject: input.subject,
      text: input.text,
      html: input.html,
      labels: ["try-me-now-personalization"],
      track_opens: false,
      reply_to: "trey@folloze.com"
    });
  });

  it("classifies definite rejection separately from an ambiguous result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("private provider detail", { status: 403 })
    );
    await expect(sendAgentMailMessage(input)).rejects.toBeInstanceOf(
      AgentMailRejectedError
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("provider unavailable", { status: 503 })
    );
    await expect(sendAgentMailMessage(input)).rejects.toBeInstanceOf(
      AgentMailAmbiguousError
    );
  });

  it("treats network, timeout, and invalid acceptance receipts as ambiguous", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("socket closed"));
    await expect(sendAgentMailMessage(input)).rejects.toBeInstanceOf(
      AgentMailAmbiguousError
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("not-json", { status: 200 })
    );
    await expect(sendAgentMailMessage(input)).rejects.toBeInstanceOf(
      AgentMailAmbiguousError
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ message_id: "message-1" }), { status: 200 })
    );
    await expect(sendAgentMailMessage(input)).rejects.toBeInstanceOf(
      AgentMailAmbiguousError
    );
  });

  it("rejects invalid addresses and idempotency keys before provider contact", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(
      sendAgentMailMessage({ ...input, recipient: "not-an-email" })
    ).rejects.toBeInstanceOf(AgentMailRejectedError);
    await expect(
      sendAgentMailMessage({ ...input, idempotencyKey: "contains spaces" })
    ).rejects.toBeInstanceOf(AgentMailRejectedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
