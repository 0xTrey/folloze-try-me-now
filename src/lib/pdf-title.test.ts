import { describe, expect, it } from "vitest";

import {
  choosePdfDocumentTitle,
  extractPdfDocumentTitle,
  inferPdfTitleFromFilename,
  pdfTitleFallback
} from "@/lib/pdf-title";

function pdfFixture(title: string): Uint8Array {
  const content = "BT /F1 32 Tf 72 700 Td (The printed cover title) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Title (${title}) >>`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

describe("PDF document title selection", () => {
  it("reads the title from a real PDF information dictionary", async () => {
    await expect(
      extractPdfDocumentTitle(pdfFixture("Now Platform Reference Guide"), "download-10492.pdf")
    ).resolves.toBe("Now Platform Reference Guide");
  });

  it("uses a real PDF metadata title instead of the upload filename", () => {
    expect(
      choosePdfDocumentTitle({
        metadataTitle: "Now Platform Reference Guide",
        originalName: "ebk-now-platform-reference-guide.pdf",
        lines: []
      })
    ).toBe("Now Platform Reference Guide");
  });

  it("ignores filename metadata and reconstructs a prominent multiline cover title", () => {
    expect(
      choosePdfDocumentTitle({
        metadataTitle: "ebk-now-platform-reference-guide.pdf",
        originalName: "ebk-now-platform-reference-guide.pdf",
        lines: [
          { text: "SERVICENOW", fontSize: 11, y: 742, pageHeight: 792 },
          { text: "The Now Platform", fontSize: 34, y: 670, pageHeight: 792 },
          { text: "Reference Guide", fontSize: 34, y: 630, pageHeight: 792 },
          { text: "Connect workflows across the enterprise", fontSize: 13, y: 580, pageHeight: 792 }
        ]
      })
    ).toBe("The Now Platform Reference Guide");
  });

  it("uses a cleaned semantic filename only as a last-resort title", () => {
    expect(
      choosePdfDocumentTitle({
        metadataTitle: "brief.pdf",
        originalName: "brief.pdf",
        lines: []
      })
    ).toBeUndefined();
    expect(inferPdfTitleFromFilename("2026-Jitterbit-AI-Automation-Benchmark-Report.pdf"))
      .toBe("Jitterbit AI Automation Benchmark Report");
    expect(pdfTitleFallback("ebk-now-platform-reference-guide-final-v2.pdf"))
      .toBe("Now Platform Reference Guide");
    expect(pdfTitleFallback("brief.pdf")).toBe("Source document");
  });
});
