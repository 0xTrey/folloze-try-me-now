import { NextResponse } from "next/server";

import {
  config,
  hasBlob,
  hasOpenAI,
  hasRedis,
  hasRemoteBrandHarvester,
  hasRemoteFolloze,
  hasResend
} from "@/lib/config";
import { sessionStoreMode } from "@/lib/session-store";

export function GET() {
  const hasDurableSessions = hasRedis || hasBlob;
  const productionCapable = hasDurableSessions && hasOpenAI && hasRemoteFolloze && hasResend;
  return NextResponse.json({
    ok: true,
    mode: productionCapable ? "production-capable" : "fixture",
    services: {
      sessionStore: sessionStoreMode,
      generation: { mode: config.generationMode, connected: hasOpenAI },
      brandHarvester: hasRemoteBrandHarvester ? "remote" : "safe-fast-extractor",
      follozeMcp: { mode: config.follozeMode, connected: hasRemoteFolloze },
      transactionalEmail: { mode: config.emailMode, connected: hasResend }
    }
  });
}
