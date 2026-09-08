import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

const safeFetchMocks = vi.hoisted(() => ({
  fetchPinnedPublicBytes: vi.fn()
}));

vi.mock("@/lib/safe-fetch", () => safeFetchMocks);

import {
  fetchPublicUrlSourceArtifact,
  normalizePublicHtmlSource
} from "@/lib/content-url";

interface ExpectedArticleFixture {
  title: string;
  description: string;
  status: string;
  confidence: string;
  sectionTitles: string[];
  audiences: string[];
  nextAction: string;
  moduleKinds: string[];
}

async function articleFixture(): Promise<{ html: string; expected: ExpectedArticleFixture }> {
  const fixtureRoot = new URL("../../tests/fixtures/content-intelligence/", import.meta.url);
  const [html, expected] = await Promise.all([
    readFile(new URL("revenue-marketing-brief.html", fixtureRoot), "utf8"),
    readFile(new URL("revenue-marketing-expected.json", fixtureRoot), "utf8")
  ]);
  return { html, expected: JSON.parse(expected) as ExpectedArticleFixture };
}

function pdfFixture(title: string, lines: string[]): Uint8Array {
  const text = lines.map((line, index) => `${index > 0 ? "T* " : ""}(${line.replace(/[()\\]/g, " ")}) Tj`).join(" ");
  const stream = `BT /F1 18 Tf 22 TL 72 720 Td ${text} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Title (${title}) >>`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

afterEach(() => {
  safeFetchMocks.fetchPinnedPublicBytes.mockReset();
});

describe("public source content normalization", () => {
  it("keeps the complete offer when its main element is unclosed around a nested article", () => {
    const artifact = normalizePublicHtmlSource({ sourceUrl: "https://example.com/audit-assurance/",
      html: `<html><head><title>Audit services | Acme</title></head><body><main><h1>Audit &amp; Assurance Solutions</h1>
        <p>Acme reviews financial records and reports findings to the stakeholders responsible for the decision.</p>
        <article><h2>Account for the next decision</h2><p>Our advisors explain reporting requirements and the audit scope before the work begins. The team reviews records with the people responsible for them and discusses the resulting findings with the stakeholders who need to act.</p></article>
        <h2>Our Focus Areas</h2><p>Financial audits review the records supporting the financial statements. Controls reviews examine how those records are prepared and checked.</p>
        <footer><p>Unrelated navigation must stay out of the source.</p></footer></body></html>` });
    expect(artifact.content.sections.map(({ title }) => title)).toEqual([
      "Audit & Assurance Solutions", "Account for the next decision", "Our Focus Areas"
    ]);
    expect(artifact.content.text).toContain("Controls reviews examine");
    expect(artifact.content.text).not.toContain("Unrelated navigation");
    expect(artifact.extraction.truncated).toBe(false);
  });

  it("keeps each linked service card's label and description in its own cited source section", () => {
    const artifact = normalizePublicHtmlSource({ sourceUrl: "https://www.aprio.com/audit-assurance/", html: `
      <main><h1>Audit &amp; Assurance Solutions</h1>
        <p>Aprio helps organizations address audit and assurance requirements with focused services.</p>
        <h2>Our Focus Areas</h2>
        <div class="service-card"><a href="/employee-benefit-plan-audits/">Employee Benefit Plan (EBP) Audits</a><p>Our employee benefit plan audit team helps plan sponsors meet their reporting responsibilities.</p></div>
        <div class="service-card"><a href="/financial-audit-assurance/">Financial Audit &amp; Assurance Services</a><p>Financial audit and assurance services evaluate financial statements and reporting controls.</p></div>
        <div class="service-card"><a href="/non-financial-audit-assurance/">Non-Financial Audit &amp; Assurance Services</a><p>Non-financial assurance work addresses reporting needs beyond financial statements.</p></div>
        <div class="service-card"><a href="/uniform-guidance-compliance/">Uniform Guidance Compliance</a><p>Uniform Guidance compliance support helps organizations prepare for applicable federal requirements.</p></div>
        <div class="related-content service-card"><a href="/insights/">Related insight</a><p>Unrelated editorial copy must never become a service claim.</p></div>
      </main>` });

    const cards = artifact.content.sections.filter((section) => section.title !== "Audit & Assurance Solutions");
    expect(cards.map((section) => section.title)).toEqual([
      "Employee Benefit Plan (EBP) Audits",
      "Financial Audit & Assurance Services",
      "Non-Financial Audit & Assurance Services",
      "Uniform Guidance Compliance"
    ]);
    expect(cards.every((section) => section.citationIds.length === 1)).toBe(true);
    expect(cards.map((section) => section.text)).toEqual(expect.arrayContaining([
      expect.stringContaining("plan sponsors"),
      expect.stringContaining("financial statements"),
      expect.stringContaining("beyond financial statements"),
      expect.stringContaining("federal requirements")
    ]));
    expect(artifact.content.text).not.toContain("Unrelated editorial copy");
    expect(artifact.content.links.find((link) => link.label === "Uniform Guidance Compliance")?.citationIds).toEqual(
      cards.find((section) => section.title === "Uniform Guidance Compliance")?.citationIds
    );
    expect(artifact.understanding.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceSectionTitle: "Employee Benefit Plan (EBP) Audits",
        sourceSectionId: cards[0]?.id
      }),
      expect.objectContaining({
        sourceSectionTitle: "Uniform Guidance Compliance",
        sourceSectionId: cards[3]?.id
      })
    ]));
  });

  it("leaves ambiguous linked labels unowned instead of borrowing a sibling description", () => {
    const artifact = normalizePublicHtmlSource({ sourceUrl: "https://example.com/services", html: `
      <main><h1>Services</h1><p>We explain several services for buyers evaluating their options.</p><h2>Focus areas</h2>
      <div class="service-card"><a href="/one">Service One</a><a href="/two">Service Two</a><p>One shared description cannot be safely assigned to either service.</p></div>
      </main>` });
    expect(artifact.content.sections.map((section) => section.title)).not.toContain("Service One");
    expect(artifact.content.sections.map((section) => section.title)).not.toContain("Service Two");
    expect(artifact.understanding.claims.every((claim) => claim.sourceSectionTitle !== "Service One" && claim.sourceSectionTitle !== "Service Two")).toBe(true);
  });

  it("turns a golden HTML article into a cited source artifact", async () => {
    const { html, expected } = await articleFixture();
    const artifact = normalizePublicHtmlSource({
      html,
      sourceUrl: "https://example.com/download?id=42",
      finalUrl: "https://example.com/research/revenue-marketing-gap",
      createdAt: "2026-08-04T12:00:00.000Z"
    });

    expect(artifact.content.title).toBe(expected.title);
    expect(artifact.content.description).toBe(expected.description);
    expect(artifact.status).toBe(expected.status);
    expect(artifact.confidence).toBe(expected.confidence);
    expect(artifact.source.finalUrl).toBe("https://example.com/research/revenue-marketing-gap");
    expect(artifact.content.sections.map((section) => section.title)).toEqual(expected.sectionTitles);
    expect(artifact.understanding.audiences.map((audience) => audience.name)).toEqual(
      expect.arrayContaining(expected.audiences)
    );
    expect(artifact.understanding.nextAction?.label).toBe(expected.nextAction);
    expect(artifact.understanding.experiencePlan.modules.map((module) => module.kind)).toEqual(
      expected.moduleKinds
    );
    expect(artifact.understanding.premise).toBe(expected.description);
    expect(artifact.understanding.claims.length).toBeGreaterThanOrEqual(3);
    expect(artifact.understanding.claims.every((claim) => claim.citationIds.length > 0)).toBe(true);
    expect(artifact.understanding.proof.some((proof) => /42 percent/i.test(proof.text))).toBe(true);
    expect(artifact.content.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "chart", confidence: "high" }),
      expect.objectContaining({ kind: "table", confidence: "high" })
    ]));
    expect(artifact.content.links.map((link) => link.url)).toContain("https://example.com/request-demo");
    expect(artifact.content.text).not.toMatch(/Copyright|Products Privacy/);
  });

  it("marks a byte-limited HTML extraction for review without losing its citations", async () => {
    const { html } = await articleFixture();
    const artifact = normalizePublicHtmlSource({
      html,
      sourceUrl: "https://example.com/research/revenue-marketing-gap",
      truncated: true,
      createdAt: "2026-08-04T12:00:00.000Z"
    });

    expect(artifact.status).toBe("needs-review");
    expect(artifact.extraction.status).toBe("partial");
    expect(artifact.extraction.truncated).toBe(true);
    expect(artifact.content.citations.length).toBeGreaterThan(2);
  });

  it("keeps invalid or private URLs behind the protected fetch boundary", async () => {
    safeFetchMocks.fetchPinnedPublicBytes.mockRejectedValue(new Error("Private URL rejected"));
    const artifact = await fetchPublicUrlSourceArtifact("http://127.0.0.1/internal", {
      timeoutMs: 20,
      createdAt: "2026-08-04T12:00:00.000Z"
    });

    expect(artifact.status).toBe("failed");
    expect(artifact.diagnostics.failureCode).toBe("public_source_fetch_failed");
    expect(artifact.content.text).toBe("");
    expect(artifact.source.sourceUrl).toBeUndefined();
  });

  it("preserves a submitted source URL separately from its canonical redirect", async () => {
    safeFetchMocks.fetchPinnedPublicBytes.mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html" },
      bytes: new TextEncoder().encode("<main><h1>Product overview</h1><p>A detailed product overview for buyers evaluating the platform and its operating model.</p></main>"),
      finalUrl: new URL("https://example.com/platform/overview"),
      truncated: false
    });

    const artifact = await fetchPublicUrlSourceArtifact("https://example.com/platform");

    expect(artifact.source.sourceUrl).toBe("https://example.com/platform");
    expect(artifact.source.finalUrl).toBe("https://example.com/platform/overview");
  });

  it("extracts a public PDF URL through the PDF source pipeline", async () => {
    const pdf = pdfFixture("GxP Systems on AWS", [
      "GxP Systems on AWS",
      "Life sciences leaders use governed cloud controls to support validated workloads and compliance evidence.",
      "The guide connects architecture decisions, operating controls, and audit-ready documentation."
    ]);
    safeFetchMocks.fetchPinnedPublicBytes.mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/pdf" },
      bytes: pdf,
      finalUrl: new URL("https://example.com/guide.pdf"),
      truncated: false
    });

    const artifact = await fetchPublicUrlSourceArtifact("https://example.com/guide.pdf");

    expect(artifact.source.kind).toBe("public-url");
    expect(artifact.source.mediaType).toBe("application/pdf");
    expect(artifact.extraction.method).toBe("pdf-text");
    // The tiny one-page fixture may legitimately need review because it has
    // less evidence than a real whitepaper, but it must make it through the
    // PDF extraction path instead of failing as a non-HTML response.
    expect(["ready", "needs-review"]).toContain(artifact.status);
    expect(artifact.content.title).toBe("GxP Systems on AWS");
    expect(artifact.content.text).toMatch(/governed cloud controls/i);
    expect(artifact.content.citations).toHaveLength(1);
  });

  it("rejects a public non-HTML, non-PDF response explicitly", async () => {
    safeFetchMocks.fetchPinnedPublicBytes.mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json" },
      bytes: new TextEncoder().encode("{}"),
      finalUrl: new URL("https://example.com/data.json"),
      truncated: false
    });

    const artifact = await fetchPublicUrlSourceArtifact("https://example.com/data.json");

    expect(artifact.status).toBe("failed");
    expect(artifact.diagnostics.failureCode).toBe("public_source_not_html");
  });

  it("fails an oversized or truncated public PDF before extraction", async () => {
    safeFetchMocks.fetchPinnedPublicBytes.mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/pdf" },
      bytes: new TextEncoder().encode("%PDF-1.4\npartial"),
      finalUrl: new URL("https://example.com/large.pdf"),
      truncated: true
    });

    const artifact = await fetchPublicUrlSourceArtifact("https://example.com/large.pdf");

    expect(artifact.status).toBe("failed");
    expect(artifact.diagnostics.failureCode).toBe("public_source_pdf_truncated");
    expect(artifact.extraction.truncated).toBe(false);
  });

});
