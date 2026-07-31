import {
  isProductionSafeSessionStoreMode,
  type SessionStoreMode
} from "@/lib/session-store";

export function isProductionCapable(options: {
  sessionStoreMode: SessionStoreMode;
  databaseConnected: boolean;
  openAIConnected: boolean;
  follozePublishReady: boolean;
  resendConnected: boolean;
}): boolean {
  // V1 saves the app-hosted experience after lead capture. Native Folloze
  // publication and transactional email are optional integrations, so they
  // must not make the public generator appear unhealthy when disabled.
  return (
    isProductionSafeSessionStoreMode(options.sessionStoreMode) &&
    options.databaseConnected &&
    options.openAIConnected
  );
}
