import { Resend } from "resend";

import { hasResend } from "@/lib/config";

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char);

export async function sendClaimEmail(input: {
  email: string;
  companyName: string;
  liveUrl: string;
  sessionId: string;
}): Promise<"sent" | "skipped" | "failed"> {
  if (!hasResend) return "skipped";

  const companyName = input.companyName.replace(/[\r\n]+/g, " ").trim().slice(0, 100) || "Folloze";
  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send(
    {
      from: process.env.EMAIL_FROM ?? "Folloze <onboarding@resend.dev>",
      to: input.email,
      replyTo: process.env.EMAIL_REPLY_TO || undefined,
      subject: `Your ${companyName} experience is ready`,
      html: `
        <div style="background:#f4f4fb;padding:42px 20px;font-family:Inter,Arial,sans-serif;color:#1c293f">
          <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6e8f0;border-radius:24px;padding:38px">
            <p style="margin:0 0 20px;color:#0077ff;font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase">Folloze Try Me Now</p>
            <h1 style="font-size:34px;line-height:1.1;margin:0 0 18px">Your live experience is ready.</h1>
            <p style="font-size:16px;line-height:1.55;color:#42536c;margin:0 0 28px">We saved the ${escapeHtml(companyName)} experience you created. Use the link below to open it or share it with your team.</p>
            <a href="${escapeHtml(input.liveUrl)}" style="display:inline-block;background:#0a1230;color:#fff;text-decoration:none;border-radius:999px;padding:15px 24px">Open your experience</a>
            <p style="font-size:12px;color:#7a8799;margin:30px 0 0">This transactional email was sent because you asked Folloze to save your experience.</p>
          </div>
        </div>`
    },
    { idempotencyKey: `try-me-claim-${input.sessionId}` }
  );

  return result.error ? "failed" : "sent";
}
