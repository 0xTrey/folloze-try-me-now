# Turnstile activation

Bot protection is fail-closed when enabled and explicit when disabled. To activate it, configure `TURNSTILE_ENABLED=true`, set the server-only `TURNSTILE_SECRET_KEY`, and set `TURNSTILE_EXPECTED_HOSTNAME` plus `TURNSTILE_EXPECTED_ACTION` to the values issued for this app. The browser widget token must be passed to `verifyBotToken(token, action)` by the owning API route.

The session-create route already passes `session_create` and strips the challenge token before storing answers. Also set `NEXT_PUBLIC_TURNSTILE_ENABLED=true` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` before building the deployment. The public flag must match the server flag. A server-only activation without the widget causes legitimate creates to fail closed.

The client bounds script loading and challenge completion, rejects concurrent submissions instead of sharing a single-use token, supports cancellation, and removes its dialog/widget after success or failure. Test expired and replayed tokens against Cloudflare on the intended host before calling the deployment protected.

The verifier uses Cloudflare's fixed HTTPS siteverify endpoint, accepts a bounded token, applies a five-second timeout, and checks the provider success flag, expected hostname, and expected action. Never expose the secret as a public environment variable or log it. `TURNSTILE_ENABLED=false` returns an explicit disabled result and is not evidence that protection is active.
