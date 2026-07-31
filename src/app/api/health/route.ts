import { NextResponse } from "next/server";

import {
  canPublishFolloze,
  config,
  hasDatabase,
  hasOpenAI,
  hasRemoteBrandHarvester,
  hasRemoteFolloze,
  hasResend
} from "@/lib/config";
import { leadStoreMode } from "@/lib/lead-store";
import { isProductionCapable } from "@/lib/readiness";
import {
  sessionStoreIsProductionSafe,
  sessionStoreMode
} from "@/lib/session-store";

export function GET() {
  const productionCapable = isProductionCapable({
    sessionStoreMode,
    databaseConnected: hasDatabase,
    openAIConnected: hasOpenAI,
    follozePublishReady: canPublishFolloze,
    resendConnected: hasResend
  });
  return NextResponse.json({
    ok: true,
    mode: productionCapable ? "production-capable" : "fixture",
    services: {
      sessionStore: sessionStoreMode,
      sessionStoreProductionSafe: sessionStoreIsProductionSafe,
      leadLedger: leadStoreMode,
      generation: { mode: config.generationMode, connected: hasOpenAI },
      brandHarvester: hasRemoteBrandHarvester ? "remote" : "safe-fast-extractor",
      follozeMcp: {
        mode: config.follozeMode,
        connected: hasRemoteFolloze,
        publishReady: canPublishFolloze
      },
      transactionalEmail: { mode: config.emailMode, connected: hasResend }
    }
  });
}
