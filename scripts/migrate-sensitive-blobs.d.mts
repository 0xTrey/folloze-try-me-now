export type MigrationContext = { type: "session" | "lead"; id: string };
export type MigrationResult = {
  mode: "apply" | "dry-run";
  scanned: number;
  encrypted: number;
  skipped: number;
  conflicts: number;
  failed: number;
  incomplete: boolean;
  errors: string[];
};
export interface MigrationStorage {
  list(options: { prefix: string; cursor?: string; limit: number }): Promise<{
    blobs: Array<{ pathname: string }>;
    hasMore: boolean;
    cursor?: string;
  }>;
  get(pathname: string): Promise<{
    etag: string;
    json(): Promise<unknown>;
  } | null>;
  put(pathname: string, body: string, options: {
    access: "private";
    addRandomSuffix: false;
    allowOverwrite: true;
    cacheControlMaxAge: 60;
    contentType: "application/json";
    ifMatch: string;
  }): Promise<{ etag: string }>;
}
export function migrationContext(pathname: unknown): MigrationContext | null;
export function migrateSensitiveBlobs(options: {
  storage: MigrationStorage;
  protectJson(value: unknown, context: MigrationContext): unknown;
  unprotectJson(value: unknown, context: MigrationContext): unknown;
  apply?: boolean;
  pageSize?: number;
}): Promise<MigrationResult>;
export function runCli(options?: { apply?: boolean }): Promise<MigrationResult>;
