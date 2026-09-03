const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[character] ?? character
  );

const clean = (value: string, maximum = 160) =>
  value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);

export function renderPersonalizationDeliveryEmail(input: {
  sellerName: string;
  appOrigin: string;
  variants: Array<{ domain: string; role?: string; url: string }>;
}): { subject: string; text: string; html: string } {
  const sellerName = clean(input.sellerName) || "Folloze";
  const appOrigin = new URL(input.appOrigin);
  if (appOrigin.protocol !== "https:") {
    throw new Error("The delivery origin must use HTTPS.");
  }

  const variants = input.variants.slice(0, 3).map((variant) => {
    const url = new URL(variant.url);
    if (url.protocol !== "https:" || url.origin !== appOrigin.origin) {
      throw new Error("Variant links must use the configured app origin.");
    }
    const domain = clean(variant.domain, 120).toLowerCase();
    if (
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(
        domain
      )
    ) {
      throw new Error("Each variant requires a valid target domain.");
    }
    const role = clean(variant.role ?? "", 80);
    return { domain, role, url: url.toString() };
  });
  if (variants.length < 1 || variants.length > 3) {
    throw new Error("Delivery requires one to three final variant links.");
  }

  const allThreeReady = variants.length === 3;
  const subject = allThreeReady
    ? `Your 3 personalized ${sellerName} experiences are ready`
    : `${variants.length} personalized ${sellerName} ${
        variants.length === 1 ? "experience is" : "experiences are"
      } ready`;
  const headline = allThreeReady
    ? "Your three personalized experiences are ready."
    : `${variants.length} of your three personalized experiences ${
        variants.length === 1 ? "is" : "are"
      } ready.`;
  const statusCopy = allThreeReady
    ? "Each link opens a final account version that passed its research, messaging, and quality checks."
    : "The links below passed their research, messaging, and quality checks. We withheld any version that did not pass.";
  const textLinks = variants
    .map(
      (variant, index) =>
        `${index + 1}. ${variant.domain}${
          variant.role ? `, ${variant.role}` : ""
        }: ${variant.url}`
    )
    .join("\n");
  const consentCopy =
    "You received this transactional email because you asked Folloze Try Me Now to build account-personalized experiences.";
  const text = `${headline}\n\n${statusCopy}\n\n${textLinks}\n\n${consentCopy}`;

  const cards = variants
    .map(
      (variant) => `
        <tr>
          <td style="padding:0 0 12px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #dce3ef;border-radius:16px">
              <tr>
                <td style="padding:18px 20px">
                  <div style="font-size:17px;font-weight:700;color:#102846">${escapeHtml(variant.domain)}</div>
                  ${
                    variant.role
                      ? `<div style="margin-top:4px;font-size:13px;color:#61718a">${escapeHtml(variant.role)}</div>`
                      : ""
                  }
                  <a href="${escapeHtml(variant.url)}" style="display:inline-block;margin-top:14px;padding:11px 18px;border-radius:999px;background:#0b5cff;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none">Open this experience</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
    )
    .join("");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#102846">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fb">
      <tr>
        <td align="center" style="padding:32px 16px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border:1px solid #dce3ef;border-radius:24px">
            <tr>
              <td style="padding:34px 32px 22px">
                <h1 style="margin:0;font-size:32px;line-height:1.12;color:#102846">${escapeHtml(headline)}</h1>
                <p style="margin:18px 0 0;font-size:16px;line-height:1.55;color:#425772">${escapeHtml(statusCopy)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 22px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${cards}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 30px;border-top:1px solid #e7ecf4;font-size:12px;line-height:1.5;color:#6b7890">
                ${escapeHtml(consentCopy)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}
