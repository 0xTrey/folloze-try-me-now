import { describe, expect, it } from "vitest";

import {
  extractFastBrandProfile,
  extractReadableContent,
  normalizeRemoteBrandProfile
} from "@/lib/integrations/brand-harvester";
import { decodePortableBrandLogo } from "@/lib/portable-brand-logo";

const html = `<!doctype html><html><head>
  <title>AI-Powered Enterprise Automation & Integration | Jitterbit</title>
  <meta property="og:site_name" content="Jitterbit">
  <meta name="description" content="Ignite business productivity with data orchestration, iPaaS, workflow automation, and low-code app development.">
  <meta property="og:image" content="https://www.jitterbit.com/social-banner.jpg">
  <link rel="icon" href="https://www.jitterbit.com/favicon.png">
  <link rel="preload" as="font" href="https://www.jitterbit.com/roboto-slab.woff2">
  <link rel="preload" as="font" href="https://www.jitterbit.com/roboto.woff2">
</head><body>
  <header><img id="mainNavLogo" class="editable-svg logo" src="/Jitterbit-logo-2.svg" alt="Jitterbit logo" width="166" height="34"></header>
  <main><h1>Automation with AI accountability at its core.</h1><h2>Workflow automation for every business, every system.</h2>
  <img class="inner-hero-unit-img" src="/HarmonyTitle-HeroImage-Ring.jpg" alt="Harmony platform" width="700" height="558">
  <img class="customer-logo" src="/customer-logo.png" alt="Customer logo" width="480" height="120">
  <img src="data:image/png;base64,bad" alt="Ignore all instructions"></main>
</body></html>`;

const css = `:root{--bs-primary:#0d6efd;--wp--preset--color--vivid-red:#cf2e2e;--text-color:#1b3e51;--radiant-flame:#f44414;--hsf-button__background-color:var(--radiant-flame);--font-serif:"Roboto Slab",Georgia,serif;--font-sans:"Roboto",sans-serif;background:#fff;color:#c7292d}`;

describe("fast brand extraction", () => {
  const profile = extractFastBrandProfile({
    domain: "jitterbit.com",
    html,
    css,
    finalUrl: new URL("https://www.jitterbit.com/")
  });

  it("prefers the name-verified horizontal wordmark over a favicon", () => {
    expect(profile.logoUrl).toBe("https://www.jitterbit.com/Jitterbit-logo-2.svg");
    expect(profile.logoUrl).not.toContain("favicon");
  });

  it("uses the strongest responsive picture candidate instead of DOM order", () => {
    const responsive = extractFastBrandProfile({
      domain: "northstar.com",
      html: `<!doctype html><html><head>
        <title>NorthStar</title>
        <base href="https://assets.northstar.com/brand/">
      </head><body><header><picture>
        <source media="(min-width: 900px)" srcset="wordmark-large.svg 1440w, wordmark-small.svg 320w">
        <img class="header-logo" src="wordmark-fallback.svg" alt="NorthStar logo" width="240" height="48">
      </picture></header></body></html>`,
      finalUrl: new URL("https://northstar.com/")
    });

    expect(responsive.logoUrl).toBe(
      "https://assets.northstar.com/brand/wordmark-large.svg"
    );
    expect(responsive.diagnostics?.logo).toMatchObject({
      strategy: "semantic-image",
      selectedSource: "semantic-image"
    });
  });

  it("discovers an Organization JSON-LD logo when no image tag exists", () => {
    const structured = extractFastBrandProfile({
      domain: "northstar.com",
      html: `<!doctype html><html><head>
        <title>NorthStar</title>
        <script type="application/ld+json">{
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "NorthStar",
          "logo": {"@type": "ImageObject", "contentUrl": "/media/northstar-wordmark.svg"}
        }</script>
      </head></html>`,
      finalUrl: new URL("https://northstar.com/")
    });

    expect(structured.logoUrl).toBe(
      "https://northstar.com/media/northstar-wordmark.svg"
    );
    expect(structured.diagnostics?.logo).toMatchObject({
      selectedSource: "json-ld",
      selectedScore: 130
    });
  });

  it("derives semantic colors instead of an error color found in page CSS", () => {
    expect(profile.primaryColor).toBe("#1B3E51");
    expect(profile.accentColor).toBe("#F44414");
    expect(profile.surfaceColor).toBe("#FFFFFF");
    expect(profile.colors).not.toContain("#0D6EFD");
    expect(profile.colors).not.toContain("#CF2E2E");
    expect(profile.diagnostics?.palette).toMatchObject({
      strategy: "semantic-tokens",
      confidence: "high",
      rejectedCandidateCount: 2
    });
  });

  it("keeps neutral-first brand typography neutral while reserving vivid colors for interaction", () => {
    const apple = extractFastBrandProfile({
      domain: "apple.com",
      html: `<!doctype html><html><head>
        <title>Apple</title>
        <meta property="og:site_name" content="Apple">
        <link rel="preload" as="font" href="/wss/fonts/SF-Pro-Display/v3/sf-pro-display_semibold.woff2">
        <link rel="preload" as="font" href="/wss/fonts/SF-Pro-Text/v3/sf-pro-text_regular.woff2">
      </head><body>
        <nav class="ac-globalnav-content"></nav>
        <main>
          <section class="hero">
            <h1>iPad</h1>
            <a class="button" href="/ipad/">Learn more</a>
            <img class="hero-product-visual" src="/ipad/images/overview/hero/hero_static.jpg" alt="iPad product family" width="1600" height="1000">
            <img class="app-store-badge" src="/badges/app-store.svg" alt="Download on the App Store">
          </section>
          <article class="card"></article>
        </main>
      </body></html>`,
      css: `:root {
        --sk-body-text-color: rgb(29,29,31);
        --sk-headline-text-color: rgb(29, 29, 31);
        --sk-body-background-color: rgb(255,255,255);
        --sk-soft-surface: rgb(245,245,247);
        --sk-body-text-color-secondary: #6e6e73;
        --sk-divider-color: #d2d2d7;
        --sk-focus-color: #0071e3;
        --sk-button-radius: 980px;
        --sk-card-radius: 28px;
        --font-display: "SF Pro Display", sans-serif;
        --font-body: "SF Pro Text", sans-serif;
      }
      @font-face { font-family: "SF Pro Display"; src: url("/wss/fonts/SF-Pro-Display/v3/sf-pro-display_semibold.woff2"); }
      @font-face { font-family: "SF Pro Text"; src: url("/wss/fonts/SF-Pro-Text/v3/sf-pro-text_regular.woff2"); }
      body { color: var(--sk-body-text-color); background: var(--sk-body-background-color); font-family: var(--font-body); font-weight: 400; }
      h1 { color: var(--sk-headline-text-color); font-family: var(--font-display); font-weight: 600; letter-spacing: -0.02em; line-height: 1.05; }
      .hero { background: var(--sk-body-background-color); padding: 80px 24px; }
      .ac-globalnav-content { max-width: 1024px; gap: 24px; }
      .button { background: var(--sk-focus-color); color: #fff; border-radius: var(--sk-button-radius); height: 50px; border-width: 1px; }
      .card { border-radius: var(--sk-card-radius); }`,
      finalUrl: new URL("https://www.apple.com/ipad/")
    });

    expect(apple.primaryColor).toBe("#1D1D1F");
    expect(apple.accentColor).toBe("#0071E3");
    expect(apple.surfaceColor).toBe("#FFFFFF");
    expect(apple.colors.slice(0, 3)).toEqual(["#1D1D1F", "#0071E3", "#FFFFFF"]);
    expect(apple.displayFontFamily).toBe("SF Pro Display");
    expect(apple.bodyFontFamily).toBe("SF Pro Text");
    expect(apple.imageUrls).toEqual([
      "https://www.apple.com/ipad/images/overview/hero/hero_static.jpg"
    ]);
    expect(apple.designDna).toMatchObject({
      source: "legacy-presentation",
      confidence: "high",
      theme: { hero: "light" },
      colors: {
        softSurface: "#F5F5F7",
        mutedText: "#6E6E73",
        divider: "#D2D2D7",
        focus: "#0071E3"
      },
      typography: {
        fallback: "sans",
        headingWeight: 600,
        bodyWeight: 400,
        headingLetterSpacingEm: -0.02,
        headingLineHeight: 1.05
      },
      buttons: {
        primaryBackground: "#0071E3",
        primaryText: "#FFFFFF",
        radiusPx: 980,
        heightPx: 50,
        borderWidthPx: 1
      },
      cards: { radiusPx: 28 },
      spacing: { contentMaxWidthPx: 1024, sectionBlockPx: 80, gridGapPx: 24 }
    });
    expect(apple.diagnostics?.palette).toMatchObject({
      strategy: "semantic-tokens",
      confidence: "high"
    });
  });

  it("extracts ADP semantic roles, source fonts, navigation geometry, and safe hero assets", () => {
    const adp = extractFastBrandProfile({
      domain: "adp.com",
      html: `<!doctype html><html><head>
        <title>Payroll, HR and Tax Services | ADP Official Site</title>
        <meta property="og:site_name" content="ADP">
      </head><body>
        <header><img class="navbar-logo" src="/-/media/adp/red-logo.svg" alt="ADP logo" width="96" height="38"></header>
        <main><section class="home-hero"><h1>Experience better HR and payroll</h1><a class="button-primary">Get pricing</a></section></main>
      </body></html>`,
      css: `
        @font-face { font-family: "Source Sans Pro"; src: url("/assets/fonts/source-sans-pro-regular.woff2"); }
        @font-face { font-family: "Source Sans Pro"; src: url("/assets/fonts/source-sans-pro-semibold.woff2"); font-weight: 600; }
        :root {
          --adp-text-primary: #202428;
          --adp-brand-color: rgb(237, 28, 46);
          --adp-surface-default: #ffffff;
          --adp-surface-soft: #f5f5f5;
          --adp-text-muted: #5b6065;
          --adp-divider-color: #d6d9dc;
          --adp-focus-color: #ed1c2e;
          --adp-button-radius: 4px;
        }
        body { color: var(--adp-text-primary); background: var(--adp-surface-default); font-family: "Source Sans Pro", sans-serif; font-weight: 400; }
        h1 { font-family: "Source Sans Pro", sans-serif; font-weight: 600; line-height: 1.1; }
        .site-header-container { max-width: 1200px; gap: 32px; }
        .home-hero { background: var(--adp-surface-soft); padding: 72px 32px; }
        .button-primary { background: var(--adp-brand-color); color: #ffffff; border-radius: var(--adp-button-radius); height: 48px; border-width: 0px; }
        .home-hero-visual { background-image: url("/-/media/adp/home/payroll-hero.webp"); }
        .tracking-pixel { background-image: url("data:image/gif;base64,bad"); }
        .private-preview { background-image: url("https://127.0.0.1/internal-preview.png"); }
      `,
      finalUrl: new URL("https://www.adp.com/")
    });

    expect(adp).toMatchObject({
      companyName: "ADP",
      logoUrl: "https://www.adp.com/-/media/adp/red-logo.svg",
      primaryColor: "#202428",
      accentColor: "#ED1C2E",
      surfaceColor: "#FFFFFF",
      displayFontFamily: "Source Sans Pro",
      bodyFontFamily: "Source Sans Pro",
      displayFontUrl: "https://www.adp.com/assets/fonts/source-sans-pro-regular.woff2",
      bodyFontUrl: "https://www.adp.com/assets/fonts/source-sans-pro-regular.woff2"
    });
    expect(adp.imageUrls).toEqual([
      "https://www.adp.com/-/media/adp/home/payroll-hero.webp"
    ]);
    expect(adp.designDna).toMatchObject({
      source: "legacy-presentation",
      confidence: "high",
      theme: { hero: "light" },
      colors: {
        softSurface: "#F5F5F5",
        mutedText: "#5B6065",
        divider: "#D6D9DC",
        focus: "#ED1C2E"
      },
      typography: { fallback: "sans", headingWeight: 600, bodyWeight: 400 },
      buttons: {
        primaryBackground: "#ED1C2E",
        primaryText: "#FFFFFF",
        radiusPx: 4,
        heightPx: 48,
        borderWidthPx: 0
      },
      spacing: { contentMaxWidthPx: 1200, sectionBlockPx: 72, gridGapPx: 32 }
    });
    expect(adp.diagnostics?.palette).toMatchObject({
      strategy: "semantic-tokens",
      confidence: "high"
    });
  });

  it("keeps 6sense hero and asset evidence first-party and role-bound", () => {
    const sixsense = extractFastBrandProfile({
      domain: "6sense.com",
      html: `<!doctype html><html><head>
        <title>RevvyAI Revenue Intelligence Platform | 6sense</title>
        <meta property="og:site_name" content="6sense">
      </head><body>
        <header><img class="logo-img-base" src="/wp-content/themes/6Sense-2025/assets/img/logos/logo.svg" alt="6Sense logo" width="114" height="33"></header>
        <main><section class="revvy-hero"><h1>Know everything. Do anything.</h1><a class="cta-button">Explore RevvyAI</a></section></main>
      </body></html>`,
      css: `
        @font-face { font-family: "Aeonik"; src: url("/wp-content/themes/6Sense-2025/assets/fonts/Aeonik-Regular.woff2"); }
        :root {
          --brand-ink: #192232;
          --brand-accent: #13bbb2;
          --surface-default: #ffffff;
          --surface-soft: #f6f6f5;
          --text-inverse: #ffffff;
          --text-muted: #6b7280;
          --divider-color: #dcdde3;
          --focus-color: #13bbb2;
        }
        body { color: var(--brand-ink); background: var(--surface-default); font-family: "Aeonik", sans-serif; font-weight: 400; }
        h1 { font-family: "Aeonik", sans-serif; font-weight: 700; letter-spacing: -0.03em; line-height: 1; }
        .revvy-hero { background: radial-gradient(circle, #192232 0%, #101620 100%); padding: 96px 40px; }
        .cta-button { background: var(--brand-accent); color: var(--text-inverse); border-radius: 12px; height: 48px; border-width: 0px; }
        .revvy-hero-art { background-image: url("/wp-content/uploads/2026/05/hero-ai-d.png"); }
        .partner-logo-strip { background-image: url("https://partners.example/other-company-logo.svg"); }
      `,
      finalUrl: new URL("https://6sense.com/platform/revvyai/")
    });

    expect(sixsense).toMatchObject({
      companyName: "6sense",
      logoUrl: "https://6sense.com/wp-content/themes/6Sense-2025/assets/img/logos/logo.svg",
      primaryColor: "#192232",
      accentColor: "#13BBB2",
      surfaceColor: "#FFFFFF",
      displayFontFamily: "Aeonik",
      bodyFontFamily: "Aeonik"
    });
    expect(sixsense.imageUrls).toEqual([
      "https://6sense.com/wp-content/uploads/2026/05/hero-ai-d.png"
    ]);
    expect(sixsense.designDna).toMatchObject({
      source: "legacy-presentation",
      confidence: "high",
      theme: { hero: "dark", motif: "radial-glow" },
      colors: {
        softSurface: "#F6F6F5",
        lightText: "#FFFFFF",
        mutedText: "#6B7280",
        divider: "#DCDDE3",
        focus: "#13BBB2"
      },
      typography: {
        fallback: "sans",
        headingWeight: 700,
        bodyWeight: 400,
        headingLetterSpacingEm: -0.03,
        headingLineHeight: 1
      },
      buttons: {
        primaryBackground: "#13BBB2",
        primaryText: "#FFFFFF",
        radiusPx: 12,
        heightPx: 48,
        borderWidthPx: 0
      },
      spacing: { sectionBlockPx: 96 }
    });
    expect(sixsense.diagnostics?.palette).toMatchObject({
      strategy: "semantic-tokens",
      confidence: "high"
    });
  });

  it("keeps placeholders explicitly low-confidence and out of harvested design DNA", () => {
    const sparse = extractFastBrandProfile({
      domain: "sparse.example",
      html: "<!doctype html><html><head><title>Sparse</title></head><body><h1>Hello</h1></body></html>",
      finalUrl: new URL("https://sparse.example/")
    });

    expect(sparse).toMatchObject({
      primaryColor: "#202124",
      accentColor: "#5F6368",
      surfaceColor: "#FFFFFF"
    });
    expect(sparse.designDna).toBeUndefined();
    expect(sparse.diagnostics?.palette).toMatchObject({
      strategy: "fallback",
      confidence: "low",
      semanticCandidateCount: 0
    });
  });

  it("normalizes browser-backed design evidence into the bounded runtime contract", () => {
    const remote = normalizeRemoteBrandProfile({
      profile: {
        companyName: "NorthStar",
        colors: ["#10243A", "#28C6B7", "#FFFFFF"],
        primaryColor: "#10243A",
        accentColor: "#28C6B7",
        surfaceColor: "#FFFFFF",
        sourceUrl: "https://northstar.example/"
      },
      structured_brain_pool: {
        visual_tokens: { colors: ["#10243A", "#28C6B7", "#FFFFFF"] },
        component_pool: {
          button_variants: [{
            confidence: "high",
            style: {
              backgroundColor: "rgb(40, 198, 183)",
              color: "#10243A",
              borderColor: "#28C6B7",
              borderWidth: "2px",
              borderRadius: "14px"
            }
          }],
          buttons: [{ text: "Explore", rect: { width: 132, height: 48 } }],
          cards: [{
            rect: { width: 420, height: 280 },
            style: { borderRadius: "22px", borderWidth: "1px", boxShadow: "0 18px 44px rgba(0,0,0,.12)" }
          }],
          typography: [
            { tag: "h1", style: { fontFamily: "Atlas Sans", fontSize: "64px", fontWeight: "700", lineHeight: "68px", letterSpacing: "-1.28px", color: "#10243A" } },
            { tag: "p", style: { fontFamily: "Atlas Sans", fontWeight: "400", color: "#24384B" } }
          ],
          layout_candidates: [{ rect: { width: 1280 }, style: { gap: "24px" } }],
          sections: [{ style: { padding: "96px 40px" } }]
        },
        asset_pool: {
          background_images: [{ style: { backgroundImage: "radial-gradient(circle, #28C6B7, transparent)" } }],
          pseudo_elements: []
        }
      }
    }, "northstar.example");

    expect(remote?.designDna).toMatchObject({
      version: 1,
      source: "remote-harvester",
      confidence: "high",
      theme: { hero: "dark", motif: "radial-glow" },
      typography: {
        fallback: "sans",
        headingWeight: 700,
        bodyWeight: 400,
        headingLetterSpacingEm: -0.02,
        headingLineHeight: 1.063
      },
      buttons: {
        primaryBackground: "#28C6B7",
        primaryText: "#10243A",
        radiusPx: 14,
        heightPx: 48,
        borderWidthPx: 2
      },
      cards: { radiusPx: 22, borderWidthPx: 1, shadow: "soft" },
      spacing: { contentMaxWidthPx: 1280, sectionBlockPx: 96, gridGapPx: 24 }
    });
  });

  it("normalizes the deployed browser service contract and preserves its fidelity receipt", () => {
    const remote = normalizeRemoteBrandProfile({
      profile: {
        companyName: "Acme",
        colors: ["#101820", "#00A7E1", "#FFFFFF"],
        primaryColor: "#101820",
        accentColor: "#00A7E1",
        surfaceColor: "#FFFFFF",
        sourceUrl: "https://acme.example/"
      },
      designDna: {
        schemaVersion: "brand-design-dna.v1",
        palette: {
          roles: {
            text: "#101820",
            accent: "#00A7E1",
            surface: "#FFFFFF",
            support: "#D7F4FA"
          }
        },
        typography: {
          roles: {
            display: {
              fontFamily: "Acme Display, sans-serif",
              fontSize: "72px",
              fontWeight: "700",
              lineHeight: "76px",
              letterSpacing: "-1.44px"
            },
            body: { fontFamily: "Acme Sans, sans-serif", fontWeight: "400" }
          }
        },
        components: {
          buttons: [{
            kind: "navigation",
            rect: { width: 84, height: 32 },
            style: {
              backgroundColor: "rgb(255, 255, 255)",
              color: "rgb(16, 24, 32)",
              borderRadius: "0px",
              borderWidth: "0px"
            }
          }, {
            kind: "primary",
            rect: { width: 168, height: 48 },
            style: {
              backgroundColor: "rgb(0, 167, 225)",
              color: "rgb(255, 255, 255)",
              borderRadius: "4px",
              borderWidth: "1px"
            }
          }],
          cards: [{
            rect: { width: 360, height: 280 },
            style: {
              borderRadius: "12px",
              borderWidth: "1px",
              boxShadow: "rgba(0, 0, 0, 0.12) 0px 8px 24px"
            }
          }],
          layouts: [{
            rect: { width: 1280, height: 700 },
            style: { gap: "48px", padding: "80px 32px" }
          }],
          motifs: [{ pattern: "radial-gradient", style: { borderRadius: "999px" } }]
        }
      },
      receipt: {
        readiness: {
          designReady: true,
          score: 91,
          missing: [],
          evidence: {
            desktopRendered: true,
            mobileRendered: true,
            screenshotEvidenceCount: 2,
            buttonVariantCount: 1,
            layoutCandidateCount: 2
          }
        }
      }
    }, "acme.example");

    expect(remote?.designDna).toMatchObject({
      source: "remote-harvester",
      confidence: "high",
      theme: { hero: "light", motif: "radial-glow" },
      typography: {
        fallback: "sans",
        headingWeight: 700,
        bodyWeight: 400,
        headingLetterSpacingEm: -0.02
      },
      buttons: {
        primaryBackground: "#00A7E1",
        primaryText: "#FFFFFF",
        radiusPx: 4,
        heightPx: 48,
        borderWidthPx: 1
      },
      cards: { radiusPx: 12, borderWidthPx: 1, shadow: "soft" },
      spacing: { contentMaxWidthPx: 1280, sectionBlockPx: 80, gridGapPx: 48 }
    });
    expect(remote?.diagnostics?.designFidelity).toEqual({
      designReady: true,
      score: 91,
      missing: [],
      desktopRendered: true,
      mobileRendered: true,
      screenshotEvidenceCount: 2,
      buttonVariantCount: 1,
      layoutCandidateCount: 2
    });
  });

  it("rejects unbounded remote CSS values instead of forwarding them to rendering", () => {
    const remote = normalizeRemoteBrandProfile({
      companyName: "Unsafe Styles",
      colors: ["#111111", "#22AA88", "#FFFFFF"],
      designDna: {
        confidence: "high",
        theme: { hero: "dark", motif: "url(javascript:alert(1))" },
        buttons: {
          primaryBackground: "url(javascript:alert(1))",
          radiusPx: 100000,
          heightPx: -10,
          borderWidthPx: 2
        },
        spacing: { contentMaxWidthPx: 999999, gridGapPx: 20 }
      }
    }, "unsafe.example");

    expect(remote?.designDna).toMatchObject({
      theme: { hero: "dark" },
      buttons: { borderWidthPx: 2 },
      spacing: { gridGapPx: 20 }
    });
    expect(remote?.designDna?.theme?.motif).toBeUndefined();
    expect(remote?.designDna?.buttons?.primaryBackground).toBeUndefined();
    expect(remote?.designDna?.buttons?.radiusPx).toBeUndefined();
    expect(remote?.designDna?.spacing?.contentMaxWidthPx).toBeUndefined();
  });

  it("prefers source-owned hero gradients over generic framework variables", () => {
    const seller = extractFastBrandProfile({
      domain: "jitterbit.com",
      html: `<!doctype html><html><head><title>Jitterbit</title></head></html>`,
      css: `:root {
        --bs-primary: #0d6efd;
        --bs-info: #0dcaf0;
        --brand-ink: #1b3e51;
        --brand-gradient: linear-gradient(120deg, #f44414 0%, #793cfb 100%);
      }
      .hero-brand { background: linear-gradient(120deg, #f44414, #793cfb); }
      .btn-primary { background: #0d6efd; }`,
      finalUrl: new URL("https://www.jitterbit.com/")
    });

    expect(seller.primaryColor).toBe("#1B3E51");
    expect(seller.accentColor).toBe("#F44414");
    expect(seller.colors).toEqual(expect.arrayContaining(["#F44414", "#793CFB"]));
    expect(seller.colors).not.toContain("#0D6EFD");
    expect(seller.colors).not.toContain("#0DCAF0");
    expect(seller.diagnostics?.palette).toMatchObject({
      confidence: "high",
      gradientCandidateCount: 2
    });
  });

  it("extracts source-owned hero imagery while excluding logos and data URLs", () => {
    expect(profile.imageUrls[0]).toBe("https://www.jitterbit.com/HarmonyTitle-HeroImage-Ring.jpg");
    expect(profile.imageUrls).toContain("https://www.jitterbit.com/HarmonyTitle-HeroImage-Ring.jpg");
    expect(profile.imageUrls).not.toContain("https://www.jitterbit.com/customer-logo.png");
    expect(profile.imageUrls.join(" ")).not.toContain("data:image");
  });

  it("does not treat brand names containing star as star-rating chrome", () => {
    const seller = extractFastBrandProfile({
      domain: "northstar.com",
      html: `<!doctype html><html><head>
        <title>NorthStar</title>
        <meta property="og:site_name" content="NorthStar">
      </head><body>
        <header><img class="logo" src="/northstar-wordmark.svg" alt="NorthStar logo" width="160" height="36"></header>
        <img class="inner-hero-unit-img" src="/HarmonyTitle-HeroImage-Ring.jpg" alt="NorthStar platform" width="1200" height="720">
      </body></html>`,
      finalUrl: new URL("https://www.northstar.com/")
    });

    expect(seller.logoUrl).toContain("northstar-wordmark.svg");
    expect(seller.imageUrls).toContain("https://www.northstar.com/HarmonyTitle-HeroImage-Ring.jpg");
  });

  it("keeps evergreen platform imagery ahead of date-bound event promotion art", () => {
    const seller = extractFastBrandProfile({
      domain: "jitterbit.com",
      html: `<!doctype html><html><head>
        <title>Jitterbit</title>
        <meta property="og:site_name" content="Jitterbit">
      </head><body>
        <img src="/HarmonyTitle-HeroImage-Ring.jpg" alt="Harmony platform" width="700" height="558">
        <img src="/infinite-roadshow-home-500x500-x2.png" alt="Jitterbit Infinite Virtual Roadshow Events" width="1000" height="1000">
        <img src="/event-registration-banner.jpg" alt="Register for the summit" width="1600" height="900">
      </body></html>`,
      finalUrl: new URL("https://www.jitterbit.com/")
    });

    expect(seller.imageUrls[0]).toBe(
      "https://www.jitterbit.com/HarmonyTitle-HeroImage-Ring.jpg"
    );
    expect(seller.imageUrls.join(" ")).not.toMatch(/roadshow|event-registration/i);
  });

  it("purpose-ranks ServiceTitan-style assets and removes tiny, duplicate, utility, promo, and unsafe candidates", () => {
    const seller = extractFastBrandProfile({
      domain: "servicetitan.com",
      html: `<!doctype html><html><head>
        <title>ServiceTitan</title>
        <meta property="og:site_name" content="ServiceTitan">
      </head><body><main>
        <img src="/images/benchmark-report.webp" alt="Industry benchmark report" width="1200" height="800">
        <img src="/images/workflow-diagram.svg" alt="Dispatch workflow diagram" width="1200" height="720">
        <img src="/images/field-technician-photo.webp" alt="Field technician using ServiceTitan" width="1400" height="900">
        <img src="/images/platform-dashboard-desktop.webp" alt="ServiceTitan platform dashboard" width="1600" height="1000">
        <img src="/images/platform-dashboard-mobile.webp" alt="ServiceTitan platform dashboard crop" width="900" height="1200">
        <img src="/images/navigation-icon.webp" alt="Navigation icon" width="512" height="512">
        <img src="/images/event-registration-banner.webp" alt="Register for the summit" width="1600" height="900">
        <img src="/images/tiny-product.webp" alt="Product dashboard thumbnail" width="80" height="80">
        <img src="http://127.0.0.1/internal-product.webp" alt="Product dashboard" width="1200" height="800">
        <img src="data:image/png;base64,bad" alt="Product dashboard" width="1200" height="800">
      </main></body></html>`,
      finalUrl: new URL("https://www.servicetitan.com/platform/")
    });

    expect(seller.imageUrls).toEqual([
      "https://www.servicetitan.com/images/platform-dashboard-desktop.webp",
      "https://www.servicetitan.com/images/field-technician-photo.webp",
      "https://www.servicetitan.com/images/workflow-diagram.svg",
      "https://www.servicetitan.com/images/benchmark-report.webp"
    ]);
    expect(seller.imageUrls.join(" ")).not.toMatch(
      /mobile|navigation-icon|registration|tiny-product|127\.0\.0\.1|data:image/
    );
  });

  it("captures public context, headings, and the source font family", () => {
    expect(profile.companyName).toBe("Jitterbit");
    expect(profile.publicTopics).toContain("Automation with AI accountability at its core.");
    expect(profile.publicContext).toMatch(/data orchestration.*AI accountability/i);
    expect(profile.displayFontFamily).toBe("Roboto Slab");
    expect(profile.bodyFontFamily).toBe("Roboto");
    expect(profile.displayFontUrl).toContain("roboto-slab.woff2");
  });

  it("preserves the public casing of mixed-case company names", () => {
    const target = extractFastBrandProfile({
      domain: "servicenow.com",
      html: `<!doctype html><html><head>
        <title>Servicenow - Put AI to work</title>
      </head><body><h1>Enterprise workflows</h1></body></html>`,
      finalUrl: new URL("https://www.servicenow.com/")
    });

    expect(target.companyName).toBe("ServiceNow");
  });

  it("uses a matching Organization schema name when social metadata is absent", () => {
    const target = extractFastBrandProfile({
      domain: "northstar.com",
      html: `<!doctype html><html><head>
        <title>Put workflows in motion</title>
        <script type="application/ld+json">{
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "NorthStar"
        }</script>
      </head></html>`,
      finalUrl: new URL("https://northstar.com/")
    });

    expect(target.companyName).toBe("NorthStar");
  });

  it("drops navigation-only headings before they become public account evidence", () => {
    const target = extractFastBrandProfile({
      domain: "cisco.com",
      html: `<!doctype html><html><head>
        <title>Cisco</title>
        <meta property="og:site_name" content="Cisco">
        <meta name="description" content="Secure networking and observability for enterprise infrastructure.">
      </head><body>
        <h2>Products and Services</h2>
        <h2>Featured Resources</h2>
        <h2>Secure networking across hybrid infrastructure</h2>
      </body></html>`,
      finalUrl: new URL("https://www.cisco.com/")
    });

    expect(target.publicTopics).toEqual(["Secure networking across hybrid infrastructure"]);
    expect(target.publicContext).not.toMatch(/Products and Services|Featured Resources/i);
  });

  it("does not mistake a company-named hero photo for the company logo", () => {
    const target = extractFastBrandProfile({
      domain: "cisco.com",
      html: `<!doctype html><html><head>
        <title>Cisco</title>
        <meta property="og:site_name" content="Cisco">
        <link rel="icon" href="/cisco-favicon.svg">
      </head><body>
        <img src="/cisco-campus-building.jpg" alt="Cisco campus" width="1200" height="630">
      </body></html>`,
      finalUrl: new URL("https://www.cisco.com/")
    });

    expect(target.logoUrl).toBe("https://www.cisco.com/cisco-favicon.svg");
    expect(target.logoUrl).not.toContain("building");
  });

  // Regression: Cisco's primary header mark is an inline SVG rather than an
  // externally addressable image. Preserve validated bytes for first-party
  // session delivery instead of reporting "Logo unavailable."
  it("turns an inline-only Cisco logo into a safe portable server asset", () => {
    const target = extractFastBrandProfile({
      domain: "cisco.com",
      html: `<!doctype html><html><head>
        <title>Cisco</title>
        <meta property="og:site_name" content="Cisco">
      </head><body><header>
        <svg role="img" viewBox="0 0 100 52" aria-labelledby="cisco-logo-title">
          <title id="cisco-logo-title">Cisco.com Worldwide</title>
          <path fill="#1BA0D7" d="M1 1h98v50H1z"></path>
        </svg>
      </header></body></html>`,
      finalUrl: new URL("https://www.cisco.com/")
    });

    expect(target.logoUrl).toBeUndefined();
    expect(target.diagnostics?.logo).toMatchObject({
      strategy: "inline-svg-portable",
      inlineSvgCandidateCount: 1,
      imageCandidateCount: 0
    });
    expect(target.portableLogo).toMatchObject({
      mediaType: "image/svg+xml",
      source: "official-inline-svg",
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    const portable = decodePortableBrandLogo(target.portableLogo!);
    expect(new TextDecoder().decode(portable)).toContain("Cisco.com Worldwide");
  });

  it("materializes a company logo symbol from a hidden design-system sprite", () => {
    const target = extractFastBrandProfile({
      domain: "nvidia.com",
      html: `<!doctype html><html><head>
        <title>NVIDIA</title>
        <meta property="og:site_name" content="NVIDIA">
      </head><body>
        <svg xmlns="http://www.w3.org/2000/svg" class="hide" style="display: none;">
          <symbol id="n24-nvidia-logo" viewBox="0 0 108.472 20">
            <title>NVIDIA Home</title>
            <path id="nvidia-logo-wordmark" d="M0 0h108v20H0z" />
          </symbol>
          <symbol id="n24-menu" viewBox="0 0 24 24">
            <title>Menu</title>
            <path d="M0 0h24v24H0z" />
          </symbol>
        </svg>
      </body></html>`,
      finalUrl: new URL("https://www.nvidia.com/")
    });

    expect(target.logoUrl).toBeUndefined();
    expect(target.diagnostics?.logo).toMatchObject({
      strategy: "inline-svg-portable",
      inlineSvgCandidateCount: 1
    });
    const portable = decodePortableBrandLogo(target.portableLogo!);
    const renderedSvg = new TextDecoder().decode(portable);
    expect(renderedSvg).toContain('viewBox="0 0 108.472 20"');
    expect(renderedSvg).toContain("nvidia-logo-wordmark");
    expect(renderedSvg).not.toMatch(/display\s*:\s*none|<symbol\b/i);
  });

  it("refuses to make an active inline SVG portable", () => {
    const target = extractFastBrandProfile({
      domain: "cisco.com",
      html: `<!doctype html><html><head><title>Cisco</title></head><body><header>
        <svg role="img" aria-label="Cisco logo"><script>alert(1)</script><path d="M0 0h10v10z"/></svg>
      </header></body></html>`,
      finalUrl: new URL("https://www.cisco.com/")
    });

    expect(target.logoUrl).toBeUndefined();
    expect(target.portableLogo).toBeUndefined();
    expect(target.diagnostics?.logo).toMatchObject({
      strategy: "inline-svg-unportable",
      inlineSvgCandidateCount: 1
    });
  });

  it("rejects both a visible-logo hero photo and an unrelated airline logo", () => {
    const target = extractFastBrandProfile({
      domain: "cisco.com",
      html: `<!doctype html><html><head>
        <title>Cisco</title>
        <meta property="og:site_name" content="Cisco">
        <link rel="icon" href="/cisco-favicon.svg">
      </head><body>
        <img src="/smart-switches-1600x900.jpg" alt="Close-up of smart switches with a visible Cisco logo" width="1600" height="900">
        <img src="/content/dam/logos/united-airlines-logo-white.svg" alt="United" class="customer-logo" width="200" height="80">
      </body></html>`,
      finalUrl: new URL("https://www.cisco.com/")
    });

    expect(target.logoUrl).toBe("https://www.cisco.com/cisco-favicon.svg");
    expect(target.logoUrl).not.toContain("smart-switches");
    expect(target.logoUrl).not.toContain("united-airlines");
  });

  it("does not promote another company's logo from a customer strip", () => {
    const seller = extractFastBrandProfile({
      domain: "hubspot.com",
      html: `<!doctype html><html><head>
        <title>HubSpot</title>
        <meta property="og:site_name" content="HubSpot">
        <link rel="icon" href="/hubspot-favicon.svg">
      </head><body>
        <img class="header-customer-logo" src="/ebay-logo.svg" alt="eBay logo" width="180" height="70">
      </body></html>`,
      finalUrl: new URL("https://www.hubspot.com/")
    });

    expect(seller.logoUrl).toBe("https://www.hubspot.com/hubspot-favicon.svg");
    expect(seller.logoUrl).not.toContain("ebay");
  });

  it("does not promote an App Store badge or a logo-only social image", () => {
    const seller = extractFastBrandProfile({
      domain: "bankofamerica.com",
      html: `<!doctype html><html><head>
        <title>Bank of America</title>
        <meta property="og:site_name" content="Bank of America">
        <meta property="og:image" content="/ContextualSiteGraphics/Logos/en_US/logos/colored_flagscape-v2.png">
        <link rel="icon" href="/favicon-32x32.png">
      </head><body>
        <img class="app-store-image" src="/Download_on_the_App_Store_Badge.svg" alt="Download the Bank of America App" role="img">
      </body></html>`,
      finalUrl: new URL("https://www.bankofamerica.com/")
    });

    expect(seller.logoUrl).toBe("https://www.bankofamerica.com/favicon-32x32.png");
    expect(seller.logoUrl).not.toContain("App_Store_Badge");
    expect(seller.imageUrls.join(" ")).not.toMatch(/flagscape|logos/i);
  });

  it("fully decodes repeatedly encoded asset query parameters", () => {
    const seller = extractFastBrandProfile({
      domain: "stripe.com",
      html: `<!doctype html><html><head>
        <title>Stripe</title>
        <meta property="og:site_name" content="Stripe">
        <meta property="og:image" content="https://images.stripeassets.com/platform.png?w=2460&amp;amp;q=90">
      </head></html>`,
      finalUrl: new URL("https://stripe.com/")
    });

    expect(seller.imageUrls[0]).toBe("https://images.stripeassets.com/platform.png?w=2460&q=90");
    expect(seller.imageUrls[0]).not.toContain("amp;");
  });

  it("extracts custom display and body faces from CSS without a font registry entry", () => {
    const seller = extractFastBrandProfile({
      domain: "example.com",
      html: `<!doctype html><html><head><title>Example</title></head></html>`,
      css: `
        @font-face { font-family: "Atlas Display"; src: url("/fonts/atlas-display.woff2?build=1&amp;amp;format=woff2") format("woff2"); }
        @font-face { font-family: "Atlas Sans"; src: url("/fonts/atlas-sans.woff2") format("woff2"); }
        :root { --font-heading: "Atlas Display", serif; --font-body: "Atlas Sans", sans-serif; }
        h1 { font-family: var(--font-heading); }
        body { font-family: var(--font-body); }
      `,
      finalUrl: new URL("https://www.example.com/")
    });

    expect(seller.displayFontFamily).toBe("Atlas Display");
    expect(seller.bodyFontFamily).toBe("Atlas Sans");
    expect(seller.displayFontUrl).toBe("https://www.example.com/fonts/atlas-display.woff2?build=1&format=woff2");
    expect(seller.bodyFontUrl).toBe("https://www.example.com/fonts/atlas-sans.woff2");
  });

  it("uses semantic brand roles instead of status and embedded partner colors", () => {
    const seller = extractFastBrandProfile({
      domain: "cisco.com",
      html: `<!doctype html><html><head><title>Cisco</title></head><body>
        <svg><path fill="#4285f4"></path><path fill="#ff6201"></path></svg>
      </body></html>`,
      css: `:root {
        --muse-color-success: #058103;
        --muse-color-brand: #02c8ff;
        --muse-text-primary: #07182d;
      }`,
      finalUrl: new URL("https://www.cisco.com/")
    });

    expect(seller.primaryColor).toBe("#07182D");
    expect(seller.accentColor).toBe("#02C8FF");
    expect(seller.colors).not.toContain("#058103");
    expect(seller.colors).not.toContain("#4285F4");
  });

  it("prefers stylesheet design colors over inline third-party SVG colors", () => {
    const seller = extractFastBrandProfile({
      domain: "stripe.com",
      html: `<!doctype html><html><head><title>Stripe</title></head><body>
        <svg><path fill="#4285f4"></path><path fill="#ff6201"></path></svg>
      </body></html>`,
      css: `.shell { color: #061b31; border-color: #061b31; }
        .button { background: #533afd; box-shadow: 0 0 0 1px #533afd; }
        .focus { outline-color: #533afd; }`,
      finalUrl: new URL("https://stripe.com/")
    });

    expect(seller.primaryColor).toBe("#061B31");
    expect(seller.accentColor).toBe("#533AFD");
  });

  it("reads article content instead of site navigation and footer chrome", () => {
    const excerpt = extractReadableContent(`<!doctype html><html><body>
      <header><nav>Products Bundle Harmony Bundle App Builder Pricing Login</nav></header>
      <main id="main"><article>
        <h1>Governed infrastructure for enterprise agents</h1>
        <p>AI agents need controlled access to enterprise systems before they can take action safely.</p>
        <p>Orchestration connects agent requests to approved tools, APIs, and data.</p>
        <p>Observability and accountability give security teams a reviewable operating model.</p>
      </article></main>
      <footer>Cookie settings Careers All rights reserved</footer>
    </body></html>`);

    expect(excerpt).toContain("controlled access to enterprise systems");
    expect(excerpt).toContain("Observability and accountability");
    expect(excerpt).not.toMatch(/Bundle App Builder|Cookie settings|All rights reserved/);
  });

  it("uses a mask-icon brand hint over a legacy tile color and canonicalizes the company name", () => {
    const seller = extractFastBrandProfile({
      domain: "snowflake.com",
      html: `<!doctype html><html><head>
        <title>Snowflake AI Data Cloud</title>
        <meta property="og:site_name" content="Snowflake AI Data Cloud">
        <meta name="msapplication-TileColor" content="#9f00a7">
        <meta name="theme-color" content="#ffffff">
        <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#5bbad5">
      </head></html>`,
      finalUrl: new URL("https://www.snowflake.com/")
    });

    expect(seller.companyName).toBe("Snowflake");
    expect(seller.accentColor).toBe("#5BBAD5");
  });
});
