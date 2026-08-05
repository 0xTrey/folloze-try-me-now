import { describe, expect, it } from "vitest";

import { extractPdfSourceArtifact } from "@/lib/content-pdf";

function pdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function pdfFixture(input: { title: string; pages: string[][] }): Uint8Array {
  const pageCount = input.pages.length;
  const pageObjectStart = 3;
  const contentObjectStart = pageObjectStart + pageCount;
  const fontObject = contentObjectStart + pageCount;
  const infoObject = fontObject + 1;
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${input.pages.map((_, index) => `${pageObjectStart + index} 0 R`).join(" ")}] /Count ${pageCount} >>`
  ];
  input.pages.forEach((_, index) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${contentObjectStart + index} 0 R >>`
    );
  });
  input.pages.forEach((lines, pageIndex) => {
    const content = lines.length > 0
      ? `BT /F1 ${pageIndex === 0 ? 26 : 14} Tf 18 TL 72 720 Td ${lines.map((line, index) => `${index > 0 ? "T* " : ""}(${pdfText(line)}) Tj`).join(" ")} ET`
      : "";
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push(`<< /Title (${pdfText(input.title)}) >>`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoObject} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

describe("PDF source extraction", () => {
  it("extracts page-level text and citations from a native-text PDF", async () => {
    const bytes = pdfFixture({
      title: "Revenue Marketing Operating Guide",
      pages: [
        [
          "Revenue Marketing Operating Guide",
          "Demand generation teams need an observable content journey for the buying group.",
          "The benchmark found that 42 percent of buyers return before inviting another stakeholder."
        ],
        [
          "Turn the source into a path",
          "Teams should organize the premise, evidence, and next action into an interactive sequence.",
          "Campaign engagement becomes useful when content views and CTA intent retain source context."
        ]
      ]
    });

    const artifact = await extractPdfSourceArtifact(bytes, "upload-9384.pdf", {
      createdAt: "2026-08-04T12:00:00.000Z"
    });

    expect(artifact.status).toBe("ready");
    expect(artifact.content.title).toBe("Revenue Marketing Operating Guide");
    expect(artifact.extraction).toEqual(expect.objectContaining({
      method: "pdf-text",
      status: "complete",
      pageCount: 2,
      extractedPageCount: 2,
      ocr: expect.objectContaining({ status: "not-required", pageNumbers: [] })
    }));
    expect(artifact.content.citations.map((citation) => citation.locator)).toEqual([
      expect.objectContaining({ kind: "pdf-page", page: 1 }),
      expect.objectContaining({ kind: "pdf-page", page: 2 })
    ]);
    expect(artifact.understanding.claims.some((claim) => /42 percent/i.test(claim.text))).toBe(true);
    expect(artifact.understanding.claims.every((claim) => claim.citationIds.length > 0)).toBe(true);
  });

  it("marks capped and image-only documents honestly instead of fabricating source understanding", async () => {
    const mixed = pdfFixture({
      title: "Campaign Evidence Guide",
      pages: [
        [
          "Campaign Evidence Guide",
          "Marketing teams need cited evidence in every generated buyer experience.",
          "A complete source receipt keeps the premise, proof, audience, and next action connected to the original document."
        ],
        []
      ]
    });
    const capped = await extractPdfSourceArtifact(mixed, "campaign-evidence.pdf", {
      maxPages: 1,
      createdAt: "2026-08-04T12:00:00.000Z"
    });
    expect(capped.status).toBe("needs-review");
    expect(capped.extraction.truncated).toBe(true);
    expect(capped.extraction.pageCount).toBe(2);

    const imageOnly = await extractPdfSourceArtifact(
      pdfFixture({ title: "Scanned Buyer Guide", pages: [[]] }),
      "scanned-guide.pdf",
      { createdAt: "2026-08-04T12:00:00.000Z" }
    );
    expect(imageOnly.status).toBe("unreadable");
    expect(imageOnly.extraction.method).toBe("pdf-image-only");
    expect(imageOnly.extraction.ocr).toEqual(expect.objectContaining({
      status: "required",
      pageNumbers: [1]
    }));
    expect(imageOnly.understanding.claims).toEqual([]);
  });

  it("returns a bounded failed artifact for invalid bytes", async () => {
    const artifact = await extractPdfSourceArtifact(
      new TextEncoder().encode("not a PDF"),
      "customer-source.pdf",
      { createdAt: "2026-08-04T12:00:00.000Z" }
    );

    expect(artifact.status).toBe("failed");
    expect(artifact.diagnostics.failureCode).toBe("invalid_pdf_signature");
    expect(artifact.content.text).toBe("");
  });
});
