# Brand harvesting and recovery

The application treats a logo as usable only after it has deliverable image bytes. A URL, an HTML `alt` value, or a successful company-name match is evidence, not proof that the asset can render.

## Resolution pipeline

1. The safe static extractor reads the submitted company domain through DNS-pinned HTTPS with redirect, byte, and timeout limits. One bounded retry is allowed for transient 403, 408, 425, 429, 5xx, timeout, and connection-reset failures; the trace records the attempt count.
2. It gathers a bounded logo candidate pool from semantic images, responsive `picture` and `srcset` sources, Organization/Brand JSON-LD, `itemprop=logo`, logo metadata, company-matched CSS background or mask images, inline SVG, and document icons.
3. Candidates are ranked by ownership and structural evidence. Wordmarks and header/navigation marks outrank small icons, customer logos, badges, and photography.
4. Remote candidates are fetched in score order. Each candidate must return supported image bytes and pass the inert-SVG or raster signature validator. A rejected winner does not suppress the runner-up.
5. When no strong official candidate survives, the server may call the authenticated remote browser harvester and then the server-only Brandfetch Brand API recovery layer.
6. A manually reviewed profile is the final emergency cache for a small number of known domains. It is not the generic recovery mechanism.
7. The selected image is copied into the private session boundary and served from a session-scoped first-party image route.

## Why 6sense originally failed

The 6sense public site returned a Cloudflare 403 to the server-side static fetch. The browser-backed Brand Harvester could read the desktop page and discover the official wordmark, but the Vercel project had neither `BRAND_MODE=remote` plus `BRAND_HARVESTER_URL` nor `BRANDFETCH_API_KEY` configured. The engine therefore had no generic provider to escalate to and installed the safe no-logo fallback.

The reviewed 6sense profile keeps the demo usable, but a new blocked domain will still require one of the generic providers. Production health exposes whether those providers are actually configured.

## Diagnostic receipt

Every completed seller and target harvest records aggregate, privacy-safe fields in the session trace:

- public-page provider result;
- public-page attempt count;
- remote-browser provider result;
- Brandfetch provider result;
- whether a reviewed profile was the final fallback;
- selected evidence layer;
- logo candidates discovered;
- candidates whose bytes were attempted and rejected;
- final logo strategy and brand-readiness status.

The trace excludes page text, asset URLs, query strings, credentials, screenshots, copied image bytes, and CSS contents.

Inspect a session with:

```bash
npm run trace:inspect -- --support-ref TMN-XXXXXXXXXXXX
```

## Production activation

For full-fidelity recovery, deploy the controlled-egress browser harvester and configure:

```bash
BRAND_MODE=remote
BRAND_HARVESTER_URL=https://<approved-harvester>/harvest
BRAND_HARVESTER_TOKEN=<server-only-token>
```

Until that service is deployed, configure the server-only Brandfetch Brand API key as the blocked-site recovery layer:

```bash
BRANDFETCH_API_KEY=<server-only-brand-api-key>
```

Do not use a public browser token for the Brand API and do not expose either credential through a `NEXT_PUBLIC_*` variable.

## Remaining boundary

Static extraction cannot reconstruct a JavaScript-rendered or anti-bot-protected site when no public HTML is delivered. That is a provider-availability problem, not a ranking heuristic. The application should surface the incomplete state and provider receipt rather than inventing a logo or silently applying generic Folloze colors.
