import posthog from "posthog-js";

import { postHogBrowserConfig } from "@/lib/posthog-config";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
const replayEnabled = process.env.NEXT_PUBLIC_POSTHOG_SESSION_REPLAY === "true";

if (projectToken && apiHost) {
  posthog.init(projectToken, postHogBrowserConfig({ apiHost, replayEnabled }));
  posthog.register({
    app_surface: "try_me_now",
    app_environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    app_release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "local"
  });
}
