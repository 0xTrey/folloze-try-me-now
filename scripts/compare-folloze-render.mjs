import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "@playwright/test";

if (process.argv.includes("--help")) {
  process.stdout.write(
    "Usage: npm run qa:visual:folloze:live\n" +
      "Optional environment: QA_LOCAL_FILE, QA_FOLLOZE_URL, QA_OUTPUT_DIR\n"
  );
  process.exit(0);
}

const localFile = resolve(
  process.env.QA_LOCAL_FILE ?? "public/examples/folloze-for-nvidia-1to1.html"
);
const liveUrl =
  process.env.QA_FOLLOZE_URL ?? "https://experience.folloze.com/folloze-for-nvidia";
const outputDir = resolve(
  process.env.QA_OUTPUT_DIR ?? "output/playwright/folloze-live-drift"
);
const viewport = { width: 1440, height: 1000 };

const selectorContract = {
  nav: ".nav.fz-navs-1",
  cta: ".header-cta.fz-btn",
  stageTitle: ".stage-title.fz-heading-2",
  pathTab: '.path-tabs.fz-tabs-2 .path-tab[aria-selected="false"]',
  modalClose: ".modal-close.fz-btn-circle"
};

async function inspect(page, url, screenshotPath) {
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 240));
  });
  page.on("pageerror", (error) => pageErrors.push(error.name));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(2_000);
  await page.evaluate(() => document.fonts.ready);
  const opener = page.locator("[data-open-sprint]").first();
  if (await opener.count()) await opener.click();

  const contract = await page.evaluate((selectors) => {
    const measure = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return { missing: true };
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        color: style.color,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        padding: style.padding,
        margin: style.margin,
        borderRadius: style.borderRadius,
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2))
      };
    };
    return {
      elements: Object.fromEntries(
        Object.entries(selectors).map(([key, selector]) => [key, measure(selector)])
      ),
      documentHeight: document.documentElement.scrollHeight,
      documentWidth: document.documentElement.scrollWidth,
      overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      sectionCount: document.querySelectorAll("main > section").length,
      runtimeStyles: performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => /\.css(?:\?|$)|widget|liveboard/i.test(name))
        .slice(0, 40)
    };
  }, selectorContract);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return { url, contract, consoleErrors, pageErrors };
}

function differences(local, live) {
  const diffs = [];
  for (const key of Object.keys(selectorContract)) {
    const left = local.contract.elements[key];
    const right = live.contract.elements[key];
    if (left.missing || right.missing) {
      diffs.push({ selector: selectorContract[key], field: "missing", local: left, live: right });
      continue;
    }
    for (const field of ["color", "fontWeight", "lineHeight", "padding", "margin", "borderRadius"]) {
      if (left[field] !== right[field]) {
        diffs.push({ selector: selectorContract[key], field, local: left[field], live: right[field] });
      }
    }
    for (const field of ["width", "height"]) {
      if (Math.abs(left[field] - right[field]) > 1) {
        diffs.push({ selector: selectorContract[key], field, local: left[field], live: right[field] });
      }
    }
  }
  if (Math.abs(local.contract.documentHeight - live.contract.documentHeight) > 1) {
    diffs.push({
      selector: "document",
      field: "height",
      local: local.contract.documentHeight,
      live: live.contract.documentHeight
    });
  }
  if (live.contract.overflow > 0) {
    diffs.push({ selector: "document", field: "horizontalOverflow", live: live.contract.overflow });
  }
  return diffs;
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const local = await inspect(
    await context.newPage(),
    pathToFileURL(localFile).toString(),
    resolve(outputDir, "local.png")
  );
  const live = await inspect(
    await context.newPage(),
    liveUrl,
    resolve(outputDir, "live.png")
  );
  const diffs = differences(local, live);
  const report = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    viewport,
    local,
    live,
    status:
      diffs.length === 0 && live.consoleErrors.length === 0 && live.pageErrors.length === 0
        ? "matched"
        : "drift-detected",
    differences: diffs
  };
  await writeFile(resolve(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `${report.status}: ${diffs.length} contract differences; report ${resolve(outputDir, "report.json")}\n`
  );
  if (report.status !== "matched") process.exitCode = 1;
} finally {
  await browser.close();
}
