# Browser-backed Brand Harvester service

This service turns a public HTTPS source URL into two deliberately separate artifacts:

1. `profile`: the compact backwards-compatible logo, palette, font, and image shape already accepted by Try Me Now.
2. `designDna`: rendered presentation evidence for applying a source brand to a Folloze wireframe without copying the source page.

It follows the checked-in Brand Harvester fidelity contract:

- desktop and mobile rendering;
- bounded full-page lazy-load scrolling;
- consent, privacy, localization, chat, and vendor-shell suppression without clicking controls;
- computed button geometry, typography roles, layout candidates, cards, navigation, and pseudo-elements;
- ranked public logo and editorial-image candidates;
- screenshot hashes and dimensions as evidence only.

It never returns screenshot bytes or paths, raw HTML/CSS, page body copy, button labels, selectors, query strings, data URIs, cookies, storage, request headers, or provider credentials. The contract fixture tests this boundary.

## Request

```http
POST /harvest
Authorization: Bearer <server-only token>
Content-Type: application/json

{
  "domain": "example.com",
  "sourceUrl": "https://www.example.com/product",
  "capture": "progressive"
}
```

`sourceUrl` must use HTTPS, port 443, and resolve only to public addresses. The request domain must equal or be a parent of the source hostname. Every browser request is checked again before it is allowed, which blocks private, loopback, link-local, documentation, and reserved networks. The deployment should still enforce an outbound network policy because application-level DNS checks cannot eliminate every DNS-rebinding race.

## Response

```json
{
  "profile": {
    "domain": "example.com",
    "companyName": "Example",
    "logoUrl": "https://example.com/logo.svg",
    "colors": ["#101820", "#00A7E1", "#FFFFFF"],
    "primaryColor": "#101820",
    "accentColor": "#00A7E1",
    "surfaceColor": "#FFFFFF"
  },
  "designDna": {
    "schemaVersion": "brand-design-dna.v1",
    "palette": {},
    "typography": {},
    "components": {},
    "responsive": {},
    "assets": {},
    "evidence": {}
  },
  "receipt": {
    "schemaVersion": "brand-harvest-receipt.v1",
    "readiness": {
      "designReady": true,
      "score": 100,
      "missing": [],
      "evidence": {}
    }
  }
}
```

The readiness score is evidence completeness, not an aesthetic score. `designReady` requires a rendered desktop page, completed lazy-load preparation, an observed palette, computed display and body typography, a ranked primary button, multiple layout candidates, a reusable logo, and screenshot evidence. Mobile capture improves the receipt but does not block this desktop-first product. The page generator does not claim full fidelity when `designReady` is false. Screenshots remain evidence for deterministic QA; they are not public application assets.

## Run and test locally

```bash
cd services/brand-harvester
npm ci
npm test
HARVESTER_BEARER_TOKEN="$(openssl rand -hex 32)" npm start
```

Optional browser smoke test (it makes real network requests):

```bash
HARVESTER_SMOKE_URL=https://example.com npm run test:browser
```

## Container

```bash
docker build -t folloze-brand-harvester:local services/brand-harvester
docker run --rm -p 8080:8080 \
  -e HARVESTER_BEARER_TOKEN='<generated secret>' \
  -e BRANDFETCH_API_KEY='<optional server-only Brand API key>' \
  folloze-brand-harvester:local
```

The container installs Chromium and runs as the unprivileged `node` user. Do not add `--no-sandbox`, mount host credentials, or expose this endpoint without bearer authentication.

## Required runtime configuration

| Variable | Required | Purpose |
|---|---:|---|
| `HARVESTER_BEARER_TOKEN` | Yes | Authenticates Try Me Now to the service. Use the same secret as the app's `BRAND_HARVESTER_TOKEN`. |
| `CHROMIUM_PATH` | Container default | Chromium executable. |
| `HARVEST_TIMEOUT_MS` | No | Service timeout, default 55 seconds, bounded to 20-90 seconds. |
| `HARVEST_MAX_CONCURRENCY` | No | Concurrent browser jobs, default 1, maximum 4. |
| `HARVEST_MAX_SCREENSHOT_HEIGHT` | No | Screenshot evidence cap, default 24,000px, maximum 30,000px. |
| `BRANDFETCH_API_KEY` | No | Adds identity assets and provider metadata. It is never returned or logged. |

`GET /health` returns only browser/token readiness, concurrency, and contract version. It returns `503` when Chromium or authentication is not configured.

## Production activation

Deploy this directory to a container runtime with at least 1 vCPU and 1 GB memory. Cloud Run example:

```bash
gcloud run deploy folloze-brand-harvester \
  --source services/brand-harvester \
  --region us-central1 \
  --memory 1Gi \
  --cpu 1 \
  --concurrency 1 \
  --timeout 90 \
  --no-allow-unauthenticated \
  --set-env-vars HARVEST_MAX_CONCURRENCY=1,HARVEST_TIMEOUT_MS=55000 \
  --set-secrets HARVESTER_BEARER_TOKEN=folloze-brand-harvester-token:latest,BRANDFETCH_API_KEY=brandfetch-api-key:latest
```

If the runtime uses platform IAM, allow only the Try Me Now server identity to invoke it. The bearer check remains defense in depth.

Then configure the Vercel production environment with server-only values:

```text
BRAND_MODE=remote
BRAND_HARVESTER_URL=https://<controlled-service-host>/harvest
BRAND_HARVESTER_TOKEN=<same generated secret>
```

Redeploy Try Me Now only after `/health` is ready and a real-domain smoke request returns `receipt.readiness.designReady: true`.

### Current integration boundary

The application caller now allows a bounded 58-second request, normalizes this service contract into renderer-safe `BrandDesignDNA`, persists it through the session and `ExperienceSpec`, and records the readiness receipt. The service remains **not production-active** until it is deployed and the production `BRAND_MODE`, `BRAND_HARVESTER_URL`, and `BRAND_HARVESTER_TOKEN` values are configured.
