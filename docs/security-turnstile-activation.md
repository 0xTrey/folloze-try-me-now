# Turnstile activation

Bot protection is fail-closed when enabled and explicit when disabled. To activate it, configure `TURNSTILE_ENABLED=true`, set the server-only `TURNSTILE_SECRET_KEY`, and set `TURNSTILE_EXPECTED_HOSTNAME` plus `TURNSTILE_EXPECTED_ACTION` to the values issued for this app. The browser widget token must be passed to `verifyBotToken(token, action)` by the owning API route.

The verifier uses Cloudflare's fixed HTTPS siteverify endpoint, accepts a bounded token, applies a five-second timeout, and checks the provider success flag, expected hostname, and expected action. Never expose the secret as a public environment variable or log it. `TURNSTILE_ENABLED=false` returns an explicit disabled result and is not evidence that protection is active.
