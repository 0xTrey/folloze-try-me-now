import posthog from "posthog-js";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
const replayEnabled = process.env.NEXT_PUBLIC_POSTHOG_SESSION_REPLAY === "true";

if (projectToken && apiHost) {
  posthog.init(projectToken, {
    api_host: apiHost,
    person_profiles: "identified_only",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_exceptions: true,
    disable_session_recording: !replayEnabled,
    session_recording: {
      maskAllInputs: true,
      maskCapturedNetworkRequestFn: (request) => {
        if (request.name) request.name = request.name.split("?")[0];
        return request;
      }
    }
  });
}
