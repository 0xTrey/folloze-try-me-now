import {
  isProductionSafeSessionStoreMode,
  type SessionStoreMode
} from "@/lib/session-store";

export function isProductionCapable(options: {
  sessionStoreMode: SessionStoreMode;
  databaseConnected?: boolean;
  durableLeadStore?: boolean;
  openAIConnected: boolean;
  distributedRateLimits: boolean;
  follozePublishReady: boolean;
  resendConnected: boolean;
}): boolean {
  // V1 saves the app-hosted experience after lead capture. Native Folloze
  // publication and transactional email are optional integrations, so they
  // must not make the public generator appear unhealthy when disabled.
  return (
    isProductionSafeSessionStoreMode(options.sessionStoreMode) &&
    (options.durableLeadStore ?? options.databaseConnected ?? false) &&
    options.openAIConnected &&
    options.distributedRateLimits
  );
}

export function productionReadiness(options: {
  sessionStoreMode: SessionStoreMode;
  durableLeadStore: boolean;
  openAIConnected: boolean;
  distributedRateLimits: boolean;
  follozePublishReady: boolean;
  resendConnected: boolean;
}) {
  const required = {
    durableSessions: isProductionSafeSessionStoreMode(options.sessionStoreMode),
    durableLeads: options.durableLeadStore,
    openAI: options.openAIConnected,
    distributedRateLimits: options.distributedRateLimits
  };
  const blockers = Object.entries(required)
    .filter(([, ready]) => !ready)
    .map(([service]) => service);
  return {
    productionCapable: blockers.length === 0,
    required,
    optional: {
      follozePublication: options.follozePublishReady,
      transactionalEmail: options.resendConnected
    },
    blockers
  };
}
