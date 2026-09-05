import { describe, expect, it } from "vitest";
import { upgradeStoredExperiencePresentation } from "./experience-presentation";

describe("stored experience presentation", () => {
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
    const script = `<script data-flz-runtime>const example='<p class="eyebrow">Retain script literal</p>';window.flzAnalytic=function(){};</script>`;
    const style = '<style>.eyebrow{color:blue}</style>';
    const result = upgradeStoredExperiencePresentation(`<html><head>${style}</head><body>${script}</body></html>`);
    expect(result).toContain(script);
    expect(result).toContain(style);
    expect(result).toContain('data-flz-presentation="responsive-media-v1"');
    expect(upgradeStoredExperiencePresentation(result)).toBe(result);
  });
});
