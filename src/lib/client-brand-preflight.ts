import type { PublicTryMeSession, UseCase } from "@/lib/types";

export const SELLER_BRAND_PREFLIGHT_DELAY_MS = 750;

export function scheduleSellerBrandPreflight(
  start: () => void,
  delayMs = SELLER_BRAND_PREFLIGHT_DELAY_MS
): () => void {
  let active = true;
  const timer = setTimeout(() => {
    if (active) start();
  }, delayMs);
  return () => {
    active = false;
    clearTimeout(timer);
  };
}

export function sellerBrandPreflightKey(useCase: UseCase, companyDomain: string): string {
  return `${useCase}:${companyDomain}`;
}

type StartSellerBrandPreflight = (
  useCase: UseCase,
  companyDomain: string
) => Promise<PublicTryMeSession>;

type RefreshSellerBrandPreflight = (
  sessionId: string
) => Promise<PublicTryMeSession>;

/**
 * Shares the session-creation request between the idle-time brand preflight and
 * the explicit confirmation action. The map intentionally lives only for the
 * current browser page: it prevents duplicate sessions without persisting a
 * submitted domain into localStorage or another cross-session client cache.
 */
export class SellerBrandPreflightCoordinator {
  private readonly entries = new Map<string, Promise<PublicTryMeSession>>();

  constructor(
    private readonly start: StartSellerBrandPreflight,
    private readonly refresh: RefreshSellerBrandPreflight
  ) {}

  warm(useCase: UseCase, companyDomain: string): Promise<PublicTryMeSession> {
    const key = sellerBrandPreflightKey(useCase, companyDomain);
    const existing = this.entries.get(key);
    if (existing) return existing;

    const pending = this.start(useCase, companyDomain);
    this.entries.set(key, pending);
    void pending.catch(() => {
      if (this.entries.get(key) === pending) this.entries.delete(key);
    });
    return pending;
  }

  async confirm(useCase: UseCase, companyDomain: string): Promise<PublicTryMeSession> {
    const preflight = await this.warm(useCase, companyDomain);
    try {
      // A preflight can finish its brand work before the visitor confirms. Read
      // once so the guided workspace opens with the freshest available evidence.
      return await this.refresh(preflight.id);
    } catch {
      // Session creation already succeeded. Let the normal workspace poll recover
      // an interrupted refresh rather than create a duplicate session.
      return preflight;
    }
  }
}
