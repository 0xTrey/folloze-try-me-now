/** Real Cloudflare binding shapes, kept local so the Next/Vercel build has no Worker dependency. */
export interface D1Result<T = unknown> { results?: T[]; success: boolean; meta?: { changes?: number } }
export interface D1Statement { bind(...values: unknown[]): D1Statement; first<T = unknown>(): Promise<T | null>; run(): Promise<D1Result>; all<T = unknown>(): Promise<D1Result<T>> }
export interface D1Database { prepare(query: string): D1Statement; batch?(statements: D1Statement[]): Promise<D1Result[]> }
export interface R2Object { key: string; etag: string; size: number; httpMetadata?: { contentType?: string } }
export interface R2Bucket { head(key: string): Promise<R2Object | null>; put?(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<R2Object>; createMultipartUpload(key: string, options?: { httpMetadata?: { contentType?: string } }): Promise<{ uploadId: string }> }
export interface Queue<T> { send(message: T): Promise<void> }
export type RuntimeBindings = { UPLOAD_DB: D1Database; UPLOADS: R2Bucket; EXTRACTION_QUEUE: Queue<ExtractionMessage>; ADAPTER_ENABLED?: string };
export type ExtractionMessage = { id: string; sessionId: string; uploadId: string; statusKey: string; attempt: number };
