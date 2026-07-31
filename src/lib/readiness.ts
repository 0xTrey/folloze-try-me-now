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
  return (
    isProductionSafeSessionStoreMode(options.sessionStoreMode) &&
    options.databaseConnected &&
    options.openAIConnected &&
    options.follozePublishReady &&
    options.resendConnected
  );
}
