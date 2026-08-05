import posthog from "posthog-js";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (!projectToken || !apiHost) {
  if (process.env.NODE_ENV === "development") {
    const variableName = projectToken
      ? "NEXT_PUBLIC_POSTHOG_HOST"
      : "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN";
    throw new Error(
      `${variableName} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${variableName} is configured`
    );
  }
} else {
  posthog.init(projectToken, {
    api_host: apiHost,
    person_profiles: "identified_only",
    capture_exceptions: true
  });
}
