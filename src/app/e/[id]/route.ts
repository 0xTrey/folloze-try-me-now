import { randomBytes } from "node:crypto";

import { canRevealFinalExperience } from "@/lib/preview-lifecycle";
import { getSession, toPublicSession } from "@/lib/session-store";

import { experienceDocumentHeaders, nonceExperienceRuntime } from "./security-headers";
import { appendOwnerHandoff } from "./owner-handoff";

type RouteContext = { params: Promise<{ id: string }> };

function statusPage(input: { title: string; body: string; refresh?: boolean; actionHref?: string; actionLabel?: string }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">${
    input.refresh ? '<meta http-equiv="refresh" content="2">' : ""
  }<meta name="viewport" content="width=device-width,initial-scale=1"><title>${input.title}</title></head><body><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f9fd;color:#1c293f;font-family:Inter,Arial,sans-serif}.card{width:min(650px,calc(100% - 40px));padding:44px;border:1px solid #d8ecfa;border-radius:24px;background:white}.logo{width:112px;height:auto;display:block;margin-bottom:48px}.mark{width:44px;height:44px;border-radius:50%;background:#eaf5ff;display:grid;place-items:center;color:#0077ff;font-size:20px;margin-bottom:28px}.pulse{animation:pulse 1.4s ease-in-out infinite}@keyframes pulse{50%{transform:scale(.82);opacity:.5}}h1{font-size:40px;line-height:1.05;letter-spacing:-.03em;margin:0 0 16px}p{color:#566983;line-height:1.6;margin:0}.action{min-height:48px;margin-top:28px;padding:12px 20px;display:inline-flex;align-items:center;border-radius:999px;background:#0048de;color:white;text-decoration:none;font-weight:600}.line{height:5px;margin-top:32px;border-radius:99px;background:#e7eef4;overflow:hidden}.line:after{content:"";display:block;width:42%;height:100%;background:#0077ff;animation:move 1.6s ease-in-out infinite}@keyframes move{50%{transform:translateX(140%)}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}</style><main class="card"><img class="logo" src="/brand/folloze-logo.svg" alt="Folloze"><div class="mark ${
    input.refresh ? "pulse" : ""
  }">✦</div><h1>${input.title}</h1><p>${input.body}</p>${input.actionHref && input.actionLabel ? `<a class="action" href="${input.actionHref}">${input.actionLabel}</a>` : ""}${input.refresh ? '<div class="line"></div>' : ""}</main></body></html>`;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const session = await getSession(id);
  if (!session) {
    return new Response(
      statusPage({
        title: "This preview has expired.",
        body: "Unclaimed experiences last 30 minutes. Return to Try Me Now to rebuild it in a few steps.",
        actionHref: "/",
        actionLabel: "Return to Try Folloze"
      }),
      { status: 410, headers: experienceDocumentHeaders() }
    );
  }
  // An artifact on the session is not enough to serve. Only a `final` artifact
  // with a matching receipt, structural and truth gates passed, persisted, and
  // read back, is a public document. An internal draft stays internal even
  // though its HTML is sitting right here.
  if (session.experience?.html && canRevealFinalExperience(toPublicSession(session))) {
    const nonce = randomBytes(18).toString("base64");
    const html = appendOwnerHandoff(session.experience.html, id, nonce, new URL(_request.url).searchParams.get("embed") === "1");
    return new Response(nonceExperienceRuntime(html, nonce), {
      status: 200,
      headers: experienceDocumentHeaders(nonce)
    });
  }
  if (session.status === "generation_failed") {
    return new Response(
      statusPage({
        title: "The story needs another pass.",
        body: "Return to the original builder tab to retry without losing your inputs.",
        actionHref: "/",
        actionLabel: "Return to Try Folloze"
      }),
      { status: 503, headers: experienceDocumentHeaders() }
    );
  }
  return new Response(
    statusPage({
      title: "Your experience is taking shape.",
      body: "We are finding the brand, understanding the audience, and creating the story. This URL will update automatically.",
      refresh: true
    }),
    { status: 202, headers: experienceDocumentHeaders() }
  );
}
