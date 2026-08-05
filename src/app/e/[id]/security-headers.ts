const runtimeMarker = "<script data-flz-runtime>";

export function nonceExperienceRuntime(html: string, nonce: string): string {
  const nonceTag = `<script data-flz-runtime nonce="${nonce}">`;
  if (html.includes(runtimeMarker)) return html.replace(runtimeMarker, nonceTag);
  // Fail closed for legacy or malformed artifacts: only the explicitly marked
  // generated runtime is eligible for the CSP nonce.
  return html;
}

export function experienceDocumentHeaders(nonce?: string) {
  const scriptSource = nonce ? `'nonce-${nonce}'` : "'none'";
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, no-store, max-age=0",
    "X-Robots-Tag": "noindex, nofollow",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()",
    "Content-Security-Policy":
      `default-src 'none'; img-src 'self' data: https://cdn.brandfetch.io; font-src 'self' https: data: http://localhost:* http://127.0.0.1:*; style-src 'unsafe-inline' https:; script-src ${scriptSource}; connect-src 'self'; frame-ancestors 'self' https://*.folloze.com http://localhost:*; object-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'`
  };
}
