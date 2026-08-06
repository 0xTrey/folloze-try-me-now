import crypto from "node:crypto";
import fs from "node:fs";
import { chromium } from "playwright-core";
import { assertPublicUrl } from "./security.mjs";

const DESKTOP = { name: "desktop", width: 1440, height: 1000, mobile: false };
const MOBILE = { name: "mobile", width: 390, height: 844, mobile: true };

function chromePath() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    process.env.BRAND_HARVEST_CHROME,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

export function browserReadiness() {
  const executablePath = chromePath();
  return { available: Boolean(executablePath), executablePath: executablePath ? "configured" : undefined };
}

async function brandfetch(domain, signal) {
  const token = process.env.BRANDFETCH_API_KEY;
  if (!token) return { status: "not_configured", colors: [], fonts: [], logos: [] };
  try {
    const response = await fetch(`https://api.brandfetch.io/v2/brands/${encodeURIComponent(domain)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.any([signal, AbortSignal.timeout(6_000)])
    });
    if (!response.ok) return { status: `http_${response.status}`, colors: [], fonts: [], logos: [] };
    const payload = await response.json();
    const colors = Array.isArray(payload.colors)
      ? payload.colors.flatMap((item) => typeof item?.hex === "string" ? [item.hex] : []).slice(0, 12)
      : [];
    const fonts = Array.isArray(payload.fonts)
      ? payload.fonts.flatMap((item) => typeof item?.name === "string" ? [item.name] : []).slice(0, 8)
      : [];
    const logos = Array.isArray(payload.logos)
      ? payload.logos.flatMap((logo) => Array.isArray(logo?.formats)
        ? logo.formats.flatMap((format) => typeof format?.src === "string"
          ? [{ url: format.src, score: logo.type === "logo" ? 100 : 80, source: "brandfetch", reasons: ["Brandfetch identity asset"] }]
          : [])
        : []).slice(0, 10)
      : [];
    return {
      status: "ok",
      name: typeof payload.name === "string" ? payload.name.slice(0, 120) : undefined,
      colors,
      fonts,
      logos
    };
  } catch (error) {
    if (signal.aborted) throw error;
    return { status: "failed", colors: [], fonts: [], logos: [] };
  }
}

async function preparePage(page) {
  return page.evaluate(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const privacy = /cookie|consent|privacy|trustarc|onetrust|quantcast|didomi|cmp|optanon|gdpr|region selector|localization/i;
    const vendor = /intercom|drift|chatbot|livechat|zendesk|qualified|6sense|demandbase/i;
    const viewport = window.innerHeight;
    let height = Math.max(document.body?.scrollHeight || 0, document.documentElement.scrollHeight || 0);
    let steps = 0;
    for (let y = 0; y < height; y += Math.max(420, Math.floor(viewport * 0.72))) {
      window.scrollTo({ top: y, behavior: "instant" });
      await wait(90);
      height = Math.max(height, document.body?.scrollHeight || 0, document.documentElement.scrollHeight || 0);
      steps += 1;
      if (steps >= 80) break;
    }
    window.scrollTo({ top: 0, behavior: "instant" });
    await wait(180);

    const excluded = { count: 0, consent: 0, vendorShell: 0 };
    for (const element of Array.from(document.querySelectorAll("body *"))) {
      const style = getComputedStyle(element);
      const identifier = `${element.id || ""} ${typeof element.className === "string" ? element.className : ""} ${element.getAttribute("aria-label") || ""}`;
      const text = (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240);
      const fixedShell = ["fixed", "sticky"].includes(style.position) && Number.parseInt(style.zIndex || "0", 10) >= 10;
      const consent = privacy.test(`${identifier} ${text}`);
      const vendorShell = fixedShell && vendor.test(identifier);
      if ((fixedShell && consent) || vendorShell) {
        element.setAttribute("data-folloze-excluded-signal", consent ? "consent" : "vendor-shell");
        element.style.setProperty("display", "none", "important");
        excluded.count += 1;
        if (consent) excluded.consent += 1;
        else excluded.vendorShell += 1;
      }
    }
    return { completed: true, scrollHeight: height, steps, capped: steps >= 80, excluded };
  });
}

async function extractSignals(page, evidence) {
  return page.evaluate((viewportName) => {
    const excludedAncestor = (element) => Boolean(element.closest("[data-folloze-excluded-signal]"));
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.05 && rect.width > 2 && rect.height > 2;
    };
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return { width: value.width, height: value.height };
    };
    const style = (element) => {
      const value = getComputedStyle(element);
      return {
        color: value.color,
        backgroundColor: value.backgroundColor,
        borderColor: value.borderColor,
        borderWidth: value.borderWidth,
        borderRadius: value.borderRadius,
        boxShadow: value.boxShadow,
        fontFamily: value.fontFamily,
        fontSize: value.fontSize,
        fontWeight: value.fontWeight,
        lineHeight: value.lineHeight,
        letterSpacing: value.letterSpacing,
        textTransform: value.textTransform,
        padding: value.padding,
        margin: value.margin,
        display: value.display,
        position: value.position,
        gap: value.gap,
        maxWidth: value.maxWidth,
        gridTemplateColumns: value.gridTemplateColumns
      };
    };
    const pageElements = Array.from(document.querySelectorAll("body *")).filter((element) => visible(element) && !excludedAncestor(element));
    const counts = new Map();
    for (const element of pageElements.slice(0, 2800)) {
      const computed = getComputedStyle(element);
      for (const color of [computed.color, computed.backgroundColor, computed.borderColor]) {
        if (!color || color === "rgba(0, 0, 0, 0)") continue;
        counts.set(color, (counts.get(color) || 0) + 1);
      }
    }
    const colors = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([value, count]) => ({ value, count }));
    const typography = Array.from(document.querySelectorAll("h1,h2,h3,h4,p,li,nav a,header a"))
      .filter((element) => visible(element) && !excludedAncestor(element))
      .slice(0, 160)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        role: element.matches("h1,h2") ? "display" : element.closest("nav,header") ? "navigation" : "body",
        rect: rect(element),
        style: style(element),
        evidence: viewportName
      }));
    const buttons = Array.from(document.querySelectorAll("button,[role=button],a[href]"))
      .filter((element) => visible(element) && !excludedAncestor(element))
      .map((element) => {
        const label = (element.textContent || element.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
        return { element, label, geometry: rect(element), computed: style(element) };
      })
      .filter(({ label, geometry, computed }) => label.length >= 2 && label.length <= 100 && geometry.width >= 44 && geometry.height >= 28 && (computed.backgroundColor !== "rgba(0, 0, 0, 0)" || computed.borderWidth !== "0px" || computed.borderRadius !== "0px"))
      .slice(0, 60)
      .map(({ element, label, geometry, computed }) => {
        const inNavigation = Boolean(element.closest("header,nav"));
        const solid = computed.backgroundColor !== "rgba(0, 0, 0, 0)" && computed.backgroundColor !== "transparent";
        const kind = inNavigation ? "navigation" : solid && geometry.height >= 36 ? "primary" : "secondary";
        return { kind, labelLength: label.length, rect: geometry, style: computed, confidence: "high", evidence: viewportName };
      });
    const layouts = Array.from(document.querySelectorAll("main,main > *,section,[class*=container],[class*=grid]"))
      .filter((element) => visible(element) && !excludedAncestor(element) && rect(element).width >= Math.min(320, window.innerWidth * 0.7))
      .slice(0, 60)
      .map((element) => ({ rect: rect(element), style: style(element), confidence: "high", evidence: viewportName }));
    const cards = pageElements
      .filter((element) => {
        const computed = getComputedStyle(element);
        const geometry = rect(element);
        return element.children.length >= 2 && geometry.width >= 180 && geometry.height >= 100 && (computed.borderRadius !== "0px" || computed.boxShadow !== "none" || computed.borderWidth !== "0px");
      })
      .slice(0, 30)
      .map((element) => ({ rect: rect(element), style: style(element), confidence: "high", evidence: viewportName }));
    const pseudoElements = [];
    for (const element of pageElements.slice(0, 1600)) {
      for (const pseudo of ["::before", "::after"]) {
        const computed = getComputedStyle(element, pseudo);
        const meaningful = computed.content !== "none" || computed.backgroundImage !== "none" || computed.borderWidth !== "0px";
        if (!meaningful) continue;
        const backgroundPattern = computed.backgroundImage.startsWith("radial-gradient")
          ? "radial-gradient"
          : computed.backgroundImage.startsWith("linear-gradient")
            ? "linear-gradient"
            : computed.backgroundImage !== "none"
              ? "image"
              : computed.backgroundColor !== "rgba(0, 0, 0, 0)"
                ? "solid"
                : undefined;
        pseudoElements.push({ rect: rect(element), pattern: backgroundPattern, style: {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
          borderColor: computed.borderColor,
          borderWidth: computed.borderWidth,
          borderRadius: computed.borderRadius,
          boxShadow: computed.boxShadow,
          position: computed.position
        }, confidence: "high", evidence: viewportName });
        if (pseudoElements.length >= 24) break;
      }
      if (pseudoElements.length >= 24) break;
    }
    const logos = Array.from(document.querySelectorAll("img,header svg,nav svg"))
      .filter((element) => visible(element) && !excludedAncestor(element))
      .map((element) => {
        const identifier = `${element.getAttribute("alt") || ""} ${element.id || ""} ${typeof element.className === "string" ? element.className : ""}`;
        const inHeader = Boolean(element.closest("header,nav"));
        const url = element.tagName.toLowerCase() === "img" ? (element.currentSrc || element.src) : undefined;
        const score = (/logo|wordmark|brand/i.test(identifier) ? 60 : 0) + (inHeader ? 30 : 0) + (url ? 10 : 0);
        return { url, score, reasons: [inHeader ? "visible header identity" : "visible image", /logo|wordmark|brand/i.test(identifier) ? "semantic logo marker" : "visual candidate"] };
      })
      .filter((item) => item.url && item.score >= 40)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
    const images = Array.from(document.images)
      .filter((element) => visible(element) && !excludedAncestor(element))
      .map((element) => ({ url: element.currentSrc || element.src, ...rect(element), role: element.closest("header,nav") ? "identity" : "editorial" }))
      .slice(0, 50);
    const headerElement = Array.from(document.querySelectorAll("header,nav")).find((element) => visible(element) && !excludedAncestor(element));
    const siteName = document.querySelector('meta[property="og:site_name"]')?.getAttribute("content") || document.querySelector('meta[name="application-name"]')?.getAttribute("content") || undefined;
    return {
      status: "ok",
      metrics: {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollHeight: Math.max(document.body?.scrollHeight || 0, document.documentElement.scrollHeight || 0),
        bodyBackground: getComputedStyle(document.body).backgroundColor
      },
      identity: { siteName },
      colors,
      typography,
      buttons,
      layouts,
      cards,
      pseudoElements,
      logos,
      images,
      header: headerElement ? { rect: rect(headerElement), style: style(headerElement), confidence: "high", evidence: viewportName } : undefined
    };
  }, evidence);
}

async function capture(context, sourceUrl, viewport, maxScreenshotHeight, signal) {
  if (signal.aborted) throw signal.reason;
  const page = await context.newPage();
  const checkedHosts = new Map();
  await page.route("**/*", async (route) => {
    const value = route.request().url();
    if (/^(data|blob|about):/.test(value)) return route.continue();
    try {
      const parsed = new URL(value);
      const cacheKey = `${parsed.protocol}//${parsed.host}`;
      if (!checkedHosts.has(cacheKey)) checkedHosts.set(cacheKey, assertPublicUrl(value));
      await checkedHosts.get(cacheKey);
      return route.continue();
    } catch {
      return route.abort("blockedbyclient");
    }
  });
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 16_000 });
  await assertPublicUrl(page.url());
  const preparation = await preparePage(page);
  const signals = await extractSignals(page, viewport.name);
  const fullHeight = signals.metrics.scrollHeight;
  const screenshot = await page.screenshot(fullHeight <= maxScreenshotHeight
    ? { fullPage: true, animations: "disabled", type: "png" }
    : { clip: { x: 0, y: 0, width: viewport.width, height: maxScreenshotHeight }, animations: "disabled", type: "png" });
  await page.close();
  return {
    ...signals,
    lazyLoad: {
      completed: preparation.completed,
      steps: preparation.steps,
      finalScrollHeight: preparation.scrollHeight,
      capped: preparation.capped
    },
    excludedSignals: preparation.excluded,
    screenshot: {
      sha256: crypto.createHash("sha256").update(screenshot).digest("hex"),
      bytes: screenshot.byteLength,
      width: viewport.width,
      height: Math.min(fullHeight, maxScreenshotHeight),
      clipped: fullHeight > maxScreenshotHeight
    }
  };
}

export async function harvestBrand({ domain, sourceUrl, signal }) {
  const executablePath = chromePath();
  if (!executablePath) throw new Error("browser_not_available");
  const maxScreenshotHeight = Math.min(30_000, Math.max(4_000, Number(process.env.HARVEST_MAX_SCREENSHOT_HEIGHT ?? 24_000)));
  const providerPromise = brandfetch(domain, signal);
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--disable-dev-shm-usage", "--disable-background-networking", "--disable-extensions", "--no-first-run"]
  });
  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128 Safari/537.36 FollozeBrandHarvester/1.0",
      ignoreHTTPSErrors: false,
      serviceWorkers: "block"
    });
    const desktop = await capture(context, sourceUrl, DESKTOP, maxScreenshotHeight, signal);
    const mobile = await capture(context, sourceUrl, MOBILE, maxScreenshotHeight, signal);
    await context.close();
    return {
      browserStatus: "ok",
      identity: desktop.identity,
      desktop,
      mobile,
      screenshots: { desktop: desktop.screenshot, mobile: mobile.screenshot },
      brandfetch: await providerPromise
    };
  } finally {
    await browser.close();
  }
}
