import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const enhancementCss = readFileSync(
  resolve(process.cwd(), "src/components/try-me-now-enhancements.module.css"),
  "utf8"
);

test("keeps the saved experience cockpit crisp inside the desktop sidebar", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The claimed cockpit is a desktop sidebar regression.");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.setContent(`
    <style>
      ${enhancementCss}
      html,body{margin:0;min-height:100%;background:#f4f5f9}
      body{padding:40px;font-family:"Avenir Next","Helvetica Neue",sans-serif}
      .rail{box-sizing:border-box;width:340px;padding:28px;background:#fff;border:1px solid #e6e8f0;border-radius:24px}
    </style>
    <aside class="rail">
      <section class="savedCockpit" aria-labelledby="saved-cockpit-title">
        <div class="cockpitTopline"><span><i></i>Saved successfully</span><small>Saved Jul 31, 10:00 AM</small></div>
        <div class="cockpitHero">
          <span class="savedSuccessMark" aria-hidden="true">✓</span>
          <div>
            <span>Permanent URL created</span>
            <h2 id="saved-cockpit-title">Medidata for Lilly is live.</h2>
            <p>Your private preview is now a shareable, measurable experience.</p>
            <code title="https://experience.example/medidata-lilly">https://experience.example/medidata-lilly</code>
          </div>
        </div>
        <div class="cockpitActions">
          <button type="button" class="primaryAction" aria-label="Open experience">Open experience ↗</button>
          <button type="button" class="secondaryAction" aria-label="Copy experience URL">Copy URL</button>
        </div>
        <div class="cockpitMetrics">
          <div><span>Quality</span><strong>82</strong><small>Personalization score</small></div>
          <div><span>Signals</span><strong>7</strong><small>Preview interactions</small></div>
          <div><span>Version</span><strong>v1</strong><small>Revision 8</small></div>
        </div>
        <div class="cockpitFooter">
          <span>◎ Ready for activation</span>
          <button type="button">Edit brief</button>
          <button type="button">Create variation</button>
        </div>
      </section>
    </aside>
  `);

  const cockpit = page.locator(".savedCockpit");
  const title = page.getByRole("heading", { name: "Medidata for Lilly is live." });
  const actions = page.locator(".cockpitActions button");
  const metrics = page.locator(".cockpitMetrics > div");
  await expect(cockpit).toBeVisible();
  await expect(actions).toHaveCount(2);
  await expect(metrics).toHaveCount(3);

  const geometry = await cockpit.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    const descendants = Array.from(node.querySelectorAll<HTMLElement>("h2,code,button,.cockpitMetrics>div,.cockpitFooter>span"));
    return {
      width: bounds.width,
      overflow: node.scrollWidth - node.clientWidth,
      outside: descendants
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < bounds.left - 1 || rect.right > bounds.right + 1;
        })
        .map((element) => element.textContent?.trim())
    };
  });
  expect(geometry.width).toBeLessThanOrEqual(286);
  expect(geometry.overflow).toBeLessThanOrEqual(0);
  expect(geometry.outside).toEqual([]);

  const titleBox = await title.boundingBox();
  expect(titleBox).not.toBeNull();
  expect(titleBox!.height).toBeLessThan(110);
  const [openBox, copyBox] = await Promise.all([actions.nth(0).boundingBox(), actions.nth(1).boundingBox()]);
  expect(openBox).not.toBeNull();
  expect(copyBox).not.toBeNull();
  expect(Math.abs(openBox!.y - copyBox!.y)).toBeLessThanOrEqual(1);
  expect(await page.locator(".cockpitMetrics small").first().evaluate((node) => getComputedStyle(node).display)).toBe("none");

  await page.locator(".rail").screenshot({ path: "output/playwright/saved-experience-compact.png" });
});
