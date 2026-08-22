export type ObservabilityValue = string | number | boolean | null | undefined;

export type ObservabilityMeta = Record<string, ObservabilityValue>;

const privateKeyPattern =
  /(?:authorization|cookie|credential|domain|hostname|host|sessionid|email|html|content|copy|password|passphrase|prompt(?:body|text|data|value)?|response(?:body|text|data|value)?|message|stack|cause|headers?|body|secret|token|apikey|sourceurl|sourcebody|sourcecontent|sourcename|filename|filepath|fileid|uploadid|uploadname|uploadpath)$/i;

const secretPatterns: Array<[RegExp, string]> = [
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]"],
  [/https?:\/\/\S+/gi, "[redacted-url]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[redacted-jwt]"],
  [/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}\b/gi, "[redacted-authorization]"],
  [
    /\b(?:sk_[A-Za-z0-9_-]{12,}|sk-(?:proj-)?[A-Za-z0-9_-]{12,}|vercel_blob_[A-Za-z0-9_-]{12,}|re_[A-Za-z0-9_-]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
    "[redacted-secret]"
  ],
  // Prefer known public DNS TLDs so asset paths like logo-open-graph.gif stay intact.
  [
    /\b(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|org|net|io|co|ai|dev|app|info|biz|edu|gov|cloud|tech|xyz|us|uk|ca|de|fr|au|jp|nl|eu|tv|me|cc)(?:\b|(?=[/:?#]))/gi,
    "[redacted-domain]"
  ],
  [/\b[^\s/\\]+\.pdf\b/gi, "[redacted-pdf]"],
  [/\bfile-[A-Za-z0-9_-]{8,}\b/g, "[redacted-file-id]"],
  [/\btmn_editor(?:_[a-z0-9_-]+)?=[^;\s]+/gi, "[redacted-editor-cookie]"]
];

export function isPrivateObservabilityKey(key: string): boolean {
  return privateKeyPattern.test(key.replace(/[^a-z0-9]/gi, ""));
}

/** Browser-safe redaction for analytics and logs. No Node crypto dependency. */
export function sanitizeObservabilityText(value: string, maxLength = 240): string {
  return secretPatterns
    .reduce((safe, [pattern, replacement]) => safe.replace(pattern, replacement), value)
    .slice(0, maxLength);
}

export function sanitizeObservabilityMeta(
  meta: ObservabilityMeta | undefined
): ObservabilityMeta | undefined {
  if (!meta) return undefined;
  return Object.fromEntries(
    Object.entries(meta)
      .filter(([key, value]) => value !== undefined && !isPrivateObservabilityKey(key))
      .map(([key, value]) => [
        key,
        typeof value === "string" ? sanitizeObservabilityText(value) : value
      ])
  );
}
