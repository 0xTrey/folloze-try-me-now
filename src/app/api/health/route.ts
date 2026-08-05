import { NextResponse } from "next/server";

import {
  canPublishFolloze,
  config,
  hasBrandfetchBrandApi,
  hasBrandfetchLogoApi,
  hasOpenAI,
  hasRemoteBrandHarvester,
  hasRemoteFolloze,
  hasResend
} from "@/lib/config";
import { isDurableLeadStoreMode, leadStoreMode } from "@/lib/lead-store";
import { productAnalyticsStoreMode } from "@/lib/product-analytics";
import { noStoreHeaders } from "@/lib/http";
import {
  isDistributedRateLimitStoreMode,
  rateLimitStoreMode
} from "@/lib/rate-limit";
import { isProductionCapable, productionReadiness } from "@/lib/readiness";
import {
  sessionStoreIsProductionSafe,
  sessionStoreMode
} from "@/lib/session-store";

export function GET() {
  const durableLeadStore = isDurableLeadStoreMode(leadStoreMode);
  const distributedRateLimits = isDistributedRateLimitStoreMode(rateLimitStoreMode);
  const productionCapable = isProductionCapable({
    sessionStoreMode,
    durableLeadStore,
    openAIConnected: hasOpenAI,
    distributedRateLimits,
    follozePublishReady: canPublishFolloze,
    resendConnected: hasResend
  });
  const readiness = productionReadiness({
    sessionStoreMode,
    durableLeadStore,
    openAIConnected: hasOpenAI,
    distributedRateLimits,
    follozePublishReady: canPublishFolloze,
    resendConnected: hasResend
  });
  return NextResponse.json({
    ok: true,
    mode: productionCapable ? "production-capable" : "fixture",
    readiness,
    lifecycle: {
      anonymousPreviewTtlSeconds: config.sessionTtlSeconds,
      leadCreatedOnBusinessEmailClaimOnly: true,
      previewSavePublishSeparated: true
    },
    services: {
      sessionStore: sessionStoreMode,
      sessionStoreProductionSafe: sessionStoreIsProductionSafe,
      leadLedger: leadStoreMode,
      productAnalytics: {
        firstParty: productAnalyticsStoreMode,
        posthogConfigured: Boolean(
          process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN && process.env.NEXT_PUBLIC_POSTHOG_HOST
        ),
        sessionReplayEnabled: process.env.NEXT_PUBLIC_POSTHOG_SESSION_REPLAY === "true"
      },
      rateLimiter: { mode: rateLimitStoreMode, distributed: distributedRateLimits },
      generation: { mode: config.generationMode, connected: hasOpenAI },
      brandHarvester: {
        mode: hasRemoteBrandHarvester ? "remote" : "safe-fast-extractor",
        remoteBrowserConfigured: hasRemoteBrandHarvester,
        brandfetchMode: config.brandfetchMode,
        brandfetchLogoApiConfigured: hasBrandfetchLogoApi,
        brandfetchBrandApiConfigured: hasBrandfetchBrandApi,
        validationFirstCandidateSelection: true
      },
      follozeMcp: {
        mode: config.follozeMode,
        connected: hasRemoteFolloze,
        publishReady: canPublishFolloze
      },
      transactionalEmail: { mode: config.emailMode, connected: hasResend }
    }
  }, { headers: noStoreHeaders });
}
