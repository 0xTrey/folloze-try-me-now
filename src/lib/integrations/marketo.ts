import { config, hasMarketo } from "@/lib/config";
import type { TryMeSession } from "@/lib/types";
import { assertBusinessEmail } from "@/lib/validation";

type FetchLike = typeof fetch;

export type MarketoSyncResult = "disabled" | "synced" | "activity-fallback" | "failed";

type MarketoResponse = { success?: boolean; result?: Array<{ id?: number; status?: string }> };
type MarketoTokenResponse = { access_token?: string };

function endpoint(path: string): string {
  return `${config.marketoEndpoint}${path}`;
}

async function requestJson(fetcher: FetchLike, url: string, init: RequestInit): Promise<MarketoResponse> {
  const response = await fetcher(url, init);
  if (!response.ok) throw new Error(`Marketo returned ${response.status}.`);
  const payload = await response.json() as MarketoResponse;
  if (!payload.success) throw new Error("Marketo rejected the request.");
  return payload;
}

async function requestAccessToken(fetcher: FetchLike, url: string): Promise<string> {
  const response = await fetcher(url, { method: "GET", cache: "no-store" });
  if (!response.ok) throw new Error(`Marketo identity returned ${response.status}.`);
  const payload = await response.json() as MarketoTokenResponse;
  if (!payload.access_token) throw new Error("Marketo token response omitted an access token.");
  return payload.access_token;
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let failure: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { return await operation(); } catch (error) { failure = error; }
  }
  throw failure;
}

/**
 * Sends only the allowlisted claim metadata. Generated HTML, source URLs,
 * prompt text, and credentials never cross this boundary.
 */
export async function syncMarketoLead(input: {
  email: string;
  session: TryMeSession;
  fetcher?: FetchLike;
}): Promise<MarketoSyncResult> {
  if (!hasMarketo) return "disabled";
  const fetcher = input.fetcher ?? fetch;
  try {
    const email = assertBusinessEmail(input.email);
    const tokenUrl = new URL("/identity/oauth/token", config.marketoEndpoint);
    tokenUrl.searchParams.set("grant_type", "client_credentials");
    tokenUrl.searchParams.set("client_id", process.env.MARKETO_CLIENT_ID!);
    tokenUrl.searchParams.set("client_secret", process.env.MARKETO_CLIENT_SECRET!);
    const accessToken = await requestAccessToken(fetcher, tokenUrl.toString());
    const engagement = input.session.previewAnalytics;
    const lead = {
      email,
      company: input.session.companyDomain,
      tryMeSessionId: input.session.id,
      tryMeUseCase: input.session.useCase,
      tryMeTargetDomain: input.session.answers.targetDomain,
      tryMeCampaignType: input.session.answers.campaignType,
      tryMeCtaType: input.session.answers.ctaType,
      tryMeUtmSource: input.session.analytics?.utm?.source,
      tryMeUtmMedium: input.session.analytics?.utm?.medium,
      tryMeUtmCampaign: input.session.analytics?.utm?.campaign,
      tryMeEngagementCount: engagement?.totalInteractions ?? 0
    };
    const synced = await withRetry(() => requestJson(fetcher, endpoint("/rest/v1/leads.json"), {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "createOrUpdate", lookupField: "email", input: [lead] })
    }));
    const leadId = synced.result?.[0]?.id;
    if (!leadId || !config.marketoCustomActivityTypeId) return "synced";
    try {
      await withRetry(() => requestJson(fetcher, endpoint("/rest/v1/activities/external.json"), {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ input: [{
          leadId,
          activityDate: new Date().toISOString(),
          activityTypeId: config.marketoCustomActivityTypeId,
          primaryAttributeValue: "Try Me Now experience saved",
          attributes: [
            { apiName: "tryMeSessionId", value: input.session.id },
            { apiName: "engagementCount", value: String(engagement?.totalInteractions ?? 0) }
          ]
        }] })
      }));
      return "synced";
    } catch {
      // A custom activity requires tenant-specific metadata; lead sync remains useful without it.
      return "activity-fallback";
    }
  } catch {
    return "failed";
  }
}
