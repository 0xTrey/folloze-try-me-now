import { getSession } from "@/lib/session-store";

type RouteContext = { params: Promise<{ id: string }> };

const headers = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
  "Content-Security-Policy":
    "default-src 'none'; img-src 'self' https: data:; font-src 'self' https: data: http://localhost:* http://127.0.0.1:*; style-src 'unsafe-inline' https:; script-src 'unsafe-inline'; connect-src 'none'; frame-ancestors 'self' https://*.folloze.com http://localhost:*; base-uri 'none'; form-action 'none'"
};

function statusPage(input: { title: string; body: string; refresh?: boolean; actionHref?: string; actionLabel?: string }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">${
    input.refresh ? '<meta http-equiv="refresh" content="2">' : ""
  }<meta name="viewport" content="width=device-width,initial-scale=1"><title>${input.title}</title></head><body><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f4fb;color:#1c293f;font-family:Inter,Arial,sans-serif}.card{width:min(650px,calc(100% - 40px));padding:44px;border:1px solid #e6e8f0;border-radius:24px;background:white}.logo{width:112px;height:auto;display:block;margin-bottom:48px}.mark{width:44px;height:44px;border-radius:50%;background:#eeeeff;display:grid;place-items:center;color:#5b5bff;font-size:20px;margin-bottom:28px}.pulse{animation:pulse 1.4s ease-in-out infinite}@keyframes pulse{50%{transform:scale(.82);opacity:.5}}h1{font-size:40px;line-height:1.05;letter-spacing:-.03em;margin:0 0 16px}p{color:#566983;line-height:1.6;margin:0}.action{min-height:48px;margin-top:28px;padding:12px 20px;display:inline-flex;align-items:center;border-radius:999px;background:#0a1230;color:white;text-decoration:none;font-weight:600}.line{height:5px;margin-top:32px;border-radius:99px;background:#eff0f5;overflow:hidden}.line:after{content:"";display:block;width:42%;height:100%;background:#5b5bff;animation:move 1.6s ease-in-out infinite}@keyframes move{50%{transform:translateX(140%)}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}</style><main class="card"><img class="logo" src="/brand/folloze-logo.svg" alt="Folloze"><div class="mark ${
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
      { status: 410, headers }
    );
  }
  if (session.experience?.html) return new Response(session.experience.html, { status: 200, headers });
  if (session.status === "generation_failed") {
    return new Response(
      statusPage({
        title: "The story needs another pass.",
        body: "Return to the original builder tab to retry without losing your inputs.",
        actionHref: "/",
        actionLabel: "Return to Try Folloze"
      }),
      { status: 503, headers }
    );
  }
  return new Response(
    statusPage({
      title: "Your experience is taking shape.",
      body: "We are finding the brand, understanding the audience, and creating the story. This URL will update automatically.",
      refresh: true
    }),
    { status: 202, headers }
  );
}
