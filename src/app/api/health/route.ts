import { NextResponse } from "next/server";

import {
  canPublishFolloze,
  config,
  hasOpenAI,
  hasRemoteBrandHarvester,
  hasRemoteFolloze,
  hasResend
} from "@/lib/config";
import { isDurableLeadStoreMode, leadStoreMode } from "@/lib/lead-store";
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
      rateLimiter: { mode: rateLimitStoreMode, distributed: distributedRateLimits },
      generation: { mode: config.generationMode, connected: hasOpenAI },
      brandHarvester: hasRemoteBrandHarvester ? "remote" : "safe-fast-extractor",
      follozeMcp: {
        mode: config.follozeMode,
        connected: hasRemoteFolloze,
        publishReady: canPublishFolloze
      },
      transactionalEmail: { mode: config.emailMode, connected: hasResend }
    }
  }, { headers: noStoreHeaders });
}
