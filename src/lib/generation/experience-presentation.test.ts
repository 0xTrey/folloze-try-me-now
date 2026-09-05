import { describe, expect, it } from "vitest";
import { upgradeStoredExperiencePresentation } from "./experience-presentation";

describe("stored experience presentation", () => {
  it("removes placeholder figures, keeps approved images, and lets failed images collapse", () => {
    const placeholder = '<div class="media-fallback" aria-hidden="true"><strong>The signal is clear.<br>The next move should be too.</strong><span><i>Signal</i></span></div>';
    const html = `<html><head></head><body><h2>Keep the outcome.</h2>
      <figure class="media framework-media no-asset-treatment">${placeholder}</figure>
      <figure class="media lens-media" data-asset-section="proof">${placeholder}<img src="https://vendor.example/proof.png" alt="Approved proof"></figure>
      <figure class="customer-quote"><blockquote>Original quote.</blockquote></figure></body></html>`;
    const result = upgradeStoredExperiencePresentation(html);
    expect(result).not.toContain(placeholder);
    expect(result).not.toContain("no-asset-treatment");
    expect(result).toContain('<figure data-no-fallback="true" class="media lens-media" data-asset-section="proof">');
    expect(result).toContain('<img src="https://vendor.example/proof.png" alt="Approved proof">');
    expect(result).toContain('<figure class="customer-quote"><blockquote>Original quote.</blockquote></figure>');
    expect(result).toContain("<h2>Keep the outcome.</h2>");
    expect(upgradeStoredExperiencePresentation(result)).toBe(result);
  });

  it("unpads only known visual labels, preserving IDs, business facts, dates, and double-digit steps", () => {
    const labels = ["lens-number", "journey-index", "signature-index", "step-index", "role-index"];
    const html = `<html><head></head><body>${labels.map(name => `<span class="${name}" id="step-01">01</span>`).join("")}
      <div class="lens-number">09</div><span class="step-index">10</span>
      <span>01 · The change</span><span>02 · The consequence</span><span>03 · The better path</span>
      <p class="body">01 is a source code. Report: 2026-01-09.</p><span>01</span></body></html>`;
    const result = upgradeStoredExperiencePresentation(html);
    for (const name of labels) expect(result).toContain(`<span class="${name}" id="step-01">1</span>`);
    expect(result).toContain('<div class="lens-number">9</div>');
    expect(result).toContain('<span class="step-index">10</span>');
    expect(result).toContain('<span>1 · The change</span><span>2 · The consequence</span><span>3 · The better path</span>');
    expect(result).toContain('01 is a source code. Report: 2026-01-09.');
    expect(result).toContain('<span>01</span>');
  });

  it("removes only section eyebrows and fallback kickers, preserving useful content and controls", () => {
    const html = `<html><head><title>Saved page</title></head><body>
      <p class="eyebrow" data-flz-editable-id="credibility.eyebrow">Reasons to believe</p>
      <h2>Proof buyers can inspect.</h2><div><span>Verified fact</span><p>Approved evidence.</p></div>
      <p class='eyebrow muted'>Why change now</p><h2>Why the old approach falls short</h2>
      <p class="body">Why change now is a useful question.</p>
      <span class="media-fallback-kicker">Experience blueprint</span><strong>Context. Proof. Next step.</strong>
      <button data-scroll-target="why-change-now">Why change</button></body></html>`;
    const result = upgradeStoredExperiencePresentation(html);
    expect(result).not.toContain("Reasons to believe");
    expect(result).not.toContain("<p class='eyebrow");
    expect(result).not.toContain("Experience blueprint");
    expect(result).toContain("<h2>Proof buyers can inspect.</h2>");
    expect(result).toContain("<span>Verified fact</span><p>Approved evidence.</p>");
    expect(result).toContain('class="body">Why change now is a useful question.');
    expect(result).toContain('data-scroll-target="why-change-now"');
  });

  it("preserves script and stylesheet contents and adds the shared style only once", () => {
    const script = `<script data-flz-runtime>const example='<p class="eyebrow">Retain script literal</p><figure class="media">Keep script literal</figure><span class="step-index">01</span>';window.flzAnalytic=function(){};</script>`;
    const style = '<style>.eyebrow{color:blue}</style>';
    const result = upgradeStoredExperiencePresentation(`<html><head>${style}</head><body>${script}</body></html>`);
    expect(result).toContain(script);
    expect(result).toContain(style);
    expect(result).toContain('data-flz-presentation="content-led-media-v2"');
    expect(upgradeStoredExperiencePresentation(result)).toBe(result);
  });
});
