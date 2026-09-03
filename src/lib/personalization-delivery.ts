import { config, hasAgentMail } from "@/lib/config";
import {
  AgentMailAmbiguousError,
  AgentMailRejectedError,
  sendAgentMailMessage
} from "@/lib/integrations/agentmail";
import { renderPersonalizationDeliveryEmail } from "@/lib/integrations/personalization-email";
import { logServerError } from "@/lib/http";
import {
  acquirePersonalizationDelivery,
  getPersonalizationRequest,
  markPersonalizationDeliveryNotConfigured,
  recordPersonalizationDeliveryAccepted,
  recordPersonalizationDeliveryFailure,
  type PersonalizationRequest
} from "@/lib/personalization-request-store";
import { getSession } from "@/lib/session-store";

type DeliveryDependencies = {
  providerConfigured: () => boolean;
  apiKey: () => string;
  inboxId: () => string;
  replyTo: () => string | undefined;
  appUrl: () => string;
  getSession: typeof getSession;
  getRequest: typeof getPersonalizationRequest;
  markNotConfigured: typeof markPersonalizationDeliveryNotConfigured;
  acquire: typeof acquirePersonalizationDelivery;
  recordAccepted: typeof recordPersonalizationDeliveryAccepted;
  recordFailure: typeof recordPersonalizationDeliveryFailure;
  send: typeof sendAgentMailMessage;
};

const defaultDependencies: DeliveryDependencies = {
  providerConfigured: () => hasAgentMail,
  apiKey: () => process.env.AGENTMAIL_API_KEY?.trim() ?? "",
  inboxId: () => process.env.AGENTMAIL_INBOX_ID?.trim() ?? "",
  replyTo: () => process.env.EMAIL_REPLY_TO?.trim() || undefined,
  appUrl: () => config.appUrl,
  getSession,
  getRequest: getPersonalizationRequest,
  markNotConfigured: markPersonalizationDeliveryNotConfigured,
  acquire: acquirePersonalizationDelivery,
  recordAccepted: recordPersonalizationDeliveryAccepted,
  recordFailure: recordPersonalizationDeliveryFailure,
  send: sendAgentMailMessage
};

const TERMINAL_REQUEST_STATUSES = new Set([
  "completed",
  "partial",
  "needs_review",
  "failed"
]);

function finalVariantLinks(request: PersonalizationRequest, appUrl: string) {
  const origin = new URL(appUrl);
  if (origin.protocol !== "https:") {
    throw new Error("personalization_delivery_origin_invalid");
  }
  return request.targets
    .filter(
      (target) =>
        target.status === "ready" &&
        typeof target.link === "string" &&
        /^\/e\/[A-Za-z0-9_-]+$/.test(target.link)
    )
    .sort((left, right) => left.position - right.position)
    .map((target) => ({
      domain: target.domain,
      ...(target.role ? { role: target.role } : {}),
      url: new URL(target.link!, origin).toString()
    }));
}

export async function runPersonalizationDelivery(
  sessionId: string,
  dependencies: DeliveryDependencies = defaultDependencies
): Promise<PersonalizationRequest | undefined> {
  const current = await dependencies.getRequest(sessionId);
  if (!current || !TERMINAL_REQUEST_STATUSES.has(current.status)) return current;
  const readyCount = current.targets.filter(
    (target) => target.status === "ready" && target.link
  ).length;
  if (readyCount < 1) return current;

  if (!dependencies.providerConfigured()) {
    return dependencies.markNotConfigured(sessionId);
  }

  const lease = await dependencies.acquire(sessionId);
  if (!lease.acquired) return lease.request;
  const { request, attemptId } = lease;

  try {
    const appUrl = dependencies.appUrl();
    const variants = finalVariantLinks(request, appUrl);
    if (!variants.length) throw new Error("personalization_delivery_links_invalid");
    const baseline = await dependencies.getSession(sessionId);
    const sellerName =
      baseline?.brand?.companyName || baseline?.companyDomain || "Folloze";
    const message = renderPersonalizationDeliveryEmail({
      sellerName,
      appOrigin: appUrl,
      variants
    });
    const receipt = await dependencies.send({
      apiKey: dependencies.apiKey(),
      inboxId: dependencies.inboxId(),
      recipient: request.email,
      subject: message.subject,
      text: message.text,
      html: message.html,
      idempotencyKey: `try-me-personalization-${request.id}`,
      replyTo: dependencies.replyTo()
    });
    return dependencies.recordAccepted({
      sessionId,
      attemptId,
      messageId: receipt.messageId,
      threadId: receipt.threadId
    });
  } catch (error) {
    const uncertain = error instanceof AgentMailAmbiguousError;
    const errorCode =
      error instanceof AgentMailRejectedError
        ? `agentmail_rejected_${error.status}`
        : uncertain
          ? "agentmail_result_uncertain"
          : "personalization_email_delivery_failed";
    logServerError(error, {
      sessionId,
      operation: "personalization_email_delivery",
      code: errorCode
    });
    return dependencies.recordFailure({
      sessionId,
      attemptId,
      status: uncertain ? "uncertain" : "failed",
      errorCode
    });
  }
}

export async function recoverPersonalizationDelivery(
  sessionId: string
): Promise<void> {
  const request = await getPersonalizationRequest(sessionId);
  if (!request || !TERMINAL_REQUEST_STATUSES.has(request.status)) return;
  const deliveryStatus = request.delivery?.status ?? "pending";
  if (!["pending", "not_configured", "sending"].includes(deliveryStatus)) return;
  await runPersonalizationDelivery(sessionId);
}
