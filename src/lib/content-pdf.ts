import {
  cleanSourceText,
  createFailedSourceArtifact,
  createSourceArtifact,
  type SourceArtifact,
  type SourceAssetCandidate,
  type SourceCitation,
  type SourceLink,
  type SourceSection
} from "@/lib/content-intelligence";
import {
  choosePdfDocumentTitle,
  pdfTitleFallback
} from "@/lib/pdf-title";

interface PdfTextLine {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  pageHeight: number;
}

export interface ExtractPdfSourceOptions {
  maxPages?: number;
  maxTextChars?: number;
  createdAt?: string;
}

function median(values: number[]): number {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : sorted[middle] ?? 0;
}

function joinLineText(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  if (/-$/.test(left) && /^[a-z]/.test(right)) return `${left.slice(0, -1)}${right}`;
  return `${left} ${right}`;
}

function mergePdfLines(fragments: PdfTextLine[]): PdfTextLine[] {
  const ordered = [...fragments].sort((left, right) => right.y - left.y || left.x - right.x);
  const lines: PdfTextLine[] = [];
  for (const fragment of ordered) {
    const line = lines.find((candidate) =>
      Math.abs(candidate.y - fragment.y) <= Math.max(2, Math.min(candidate.fontSize, fragment.fontSize) * 0.3)
    );
    if (line) {
      line.text = cleanSourceText(joinLineText(line.text, fragment.text), 2_000);
      line.fontSize = Math.max(line.fontSize, fragment.fontSize);
      line.x = Math.min(line.x, fragment.x);
    } else {
      lines.push({ ...fragment, text: cleanSourceText(fragment.text, 2_000) });
    }
  }
  return lines
    .filter((line) => line.text.length > 0)
    .sort((left, right) => right.y - left.y || left.x - right.x);
}

function probablePageHeading(lines: PdfTextLine[], fallback: string): string {
  const bodySize = median(lines.map((line) => line.fontSize));
  const candidate = lines
    .filter((line) => line.text.length >= 3 && line.text.length <= 160)
    .filter((line) => line.y / Math.max(line.pageHeight, 1) >= 0.55)
    .map((line) => ({
      line,
      score: line.fontSize / Math.max(bodySize, 1) * 50 + line.y / Math.max(line.pageHeight, 1) * 20
    }))
    .sort((left, right) => right.score - left.score)[0]?.line;
  return candidate?.text ?? fallback;
}

function pdfLink(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function annotationText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return cleanSourceText(value, 180).replace(/\s+/g, " ") || undefined;
}

function pdfMetadataTitle(metadata: {
  info: unknown;
  metadata?: { get: (name: string) => unknown } | null;
}): string | undefined {
  const info = metadata.info as { Title?: unknown };
  const title = typeof info.Title === "string"
    ? info.Title
    : metadata.metadata?.get("dc:title") ?? metadata.metadata?.get("title") ?? undefined;
  return typeof title === "string" ? cleanSourceText(title, 240) : undefined;
}

function imageOperationCount(fnArray: number[], operations: typeof import("pdfjs-dist/legacy/build/pdf.mjs")["OPS"]): number {
  const imageOperations = new Set([
    operations.paintImageXObject,
    operations.paintImageXObjectRepeat,
    operations.paintInlineImageXObject,
    operations.paintInlineImageXObjectGroup
  ]);
  return fnArray.filter((operation) => imageOperations.has(operation)).length;
}

export async function extractPdfSourceArtifact(
  bytes: Uint8Array,
  originalName: string,
  options: ExtractPdfSourceOptions = {}
): Promise<SourceArtifact> {
  const maxPages = Math.max(1, Math.min(options.maxPages ?? 180, 500));
  const maxTextChars = Math.max(10_000, Math.min(options.maxTextChars ?? 180_000, 180_000));
  let loadingTask: { destroy: () => Promise<void> } | undefined;
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    return createFailedSourceArtifact({
      kind: "uploaded-pdf",
      displayName: originalName,
      mediaType: "application/pdf",
      method: "pdf-text",
      failureCode: "invalid_pdf_signature",
      warning: "The uploaded bytes do not contain a valid PDF signature.",
      createdAt: options.createdAt
    });
  }

  try {
    const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({
      data: bytes.slice(),
      useWorkerFetch: false
    });
    loadingTask = task;
    const document = await task.promise;
    const metadata = await document.getMetadata();
    const pageCount = document.numPages;
    const pagesToRead = Math.min(pageCount, maxPages);
    const sections: SourceSection[] = [];
    const citations: SourceCitation[] = [];
    const links: SourceLink[] = [];
    const assets: SourceAssetCandidate[] = [];
    const titleLines: PdfTextLine[] = [];
    const pagesNeedingOcr: number[] = [];
    const warnings: string[] = [];
    let extractedTextLength = 0;
    let pagesWithText = 0;

    for (let pageNumber = 1; pageNumber <= pagesToRead && extractedTextLength < maxTextChars; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const fragments = content.items
        .filter((item): item is Extract<(typeof content.items)[number], { str: string }> => "str" in item)
        .map((item) => ({
          text: cleanSourceText(item.str, 2_000),
          x: Number(item.transform[4]) || 0,
          y: Number(item.transform[5]) || 0,
          fontSize: Math.max(
            Number(item.height) || 0,
            Math.hypot(Number(item.transform[0]) || 0, Number(item.transform[1]) || 0)
          ),
          pageHeight: viewport.height
        }))
        .filter((item) => item.text.length > 0 && item.fontSize > 0);
      const lines = mergePdfLines(fragments);
      if (pageNumber === 1) titleLines.push(...lines);
      const remaining = maxTextChars - extractedTextLength;
      const pageText = cleanSourceText(lines.map((line) => line.text).join("\n"), Math.min(30_000, remaining));

      let imageCount = 0;
      try {
        const operatorList = await page.getOperatorList();
        imageCount = imageOperationCount(operatorList.fnArray, OPS);
      } catch {
        warnings.push(`Embedded visual detection was unavailable on page ${pageNumber}.`);
      }

      if (pageText.length < 40) {
        pagesNeedingOcr.push(pageNumber);
      } else {
        pagesWithText += 1;
        extractedTextLength += pageText.length;
        const citationId = `pdf_page_${pageNumber}`;
        citations.push({
          id: citationId,
          locator: {
            kind: "pdf-page",
            page: pageNumber,
            label: `Page ${pageNumber}`
          },
          excerpt: pageText.replace(/\s+/g, " ").slice(0, 320)
        });
        sections.push({
          id: `pdf_section_${pageNumber}`,
          title: probablePageHeading(lines, `Page ${pageNumber}`),
          level: pageNumber === 1 ? 1 : 2,
          order: pageNumber - 1,
          text: pageText,
          citationIds: [citationId]
        });
      }

      if (imageCount > 0) {
        assets.push({
          id: `pdf_visual_${pageNumber}`,
          kind: "embedded-visual",
          caption: `${imageCount} embedded visual${imageCount === 1 ? "" : "s"} on page ${pageNumber}`,
          page: pageNumber,
          confidence: pageText.length >= 40 ? "medium" : "low",
          citationIds: pageText.length >= 40 ? [`pdf_page_${pageNumber}`] : []
        });
      }

      try {
        const annotations = await page.getAnnotations({ intent: "display" });
        for (const annotation of annotations) {
          const candidate = annotation as { url?: unknown; unsafeUrl?: unknown; title?: unknown; contentsObj?: { str?: unknown } };
          const url = pdfLink(candidate.url) ?? pdfLink(candidate.unsafeUrl);
          if (!url || links.some((link) => link.url === url)) continue;
          const label = annotationText(candidate.contentsObj?.str) ?? annotationText(candidate.title) ?? "Source link";
          links.push({
            id: `pdf_link_${links.length + 1}`,
            label,
            url,
            citationIds: pageText.length >= 40 ? [`pdf_page_${pageNumber}`] : []
          });
        }
      } catch {
        warnings.push(`Link extraction was unavailable on page ${pageNumber}.`);
      }
    }

    const metadataTitle = pdfMetadataTitle(metadata);
    const title = choosePdfDocumentTitle({
      metadataTitle,
      originalName,
      lines: titleLines.map((line) => ({
        text: line.text,
        fontSize: line.fontSize,
        y: line.y,
        pageHeight: line.pageHeight
      }))
    }) ?? pdfTitleFallback(originalName);
    const reachedPageLimit = pageCount > pagesToRead;
    const reachedTextLimit = extractedTextLength >= maxTextChars && pagesToRead < pageCount;
    if (reachedPageLimit) warnings.push(`Only the first ${pagesToRead} pages were inspected.`);
    if (reachedTextLimit) warnings.push("The extracted source text reached the bounded content limit.");
    if (pagesNeedingOcr.length > 0) {
      warnings.push(
        pagesWithText === 0
          ? "No readable text layer was found; OCR is required before factual generation."
          : `${pagesNeedingOcr.length} page${pagesNeedingOcr.length === 1 ? "" : "s"} may require OCR.`
      );
    }
    const ocrStatus = pagesWithText === 0
      ? "required" as const
      : pagesNeedingOcr.length > 0
        ? "recommended" as const
        : "not-required" as const;
    const partial = reachedPageLimit || reachedTextLimit || ocrStatus !== "not-required";
    const method = pagesWithText === 0
      ? "pdf-image-only" as const
      : pagesNeedingOcr.length > 0
        ? "pdf-mixed" as const
        : "pdf-text" as const;

    return createSourceArtifact({
      source: {
        kind: "uploaded-pdf",
        displayName: originalName,
        mediaType: "application/pdf"
      },
      extraction: {
        method,
        status: partial ? "partial" : "complete",
        truncated: reachedPageLimit || reachedTextLimit,
        pageCount,
        extractedPageCount: pagesWithText,
        ocr: {
          status: ocrStatus,
          pageNumbers: pagesNeedingOcr,
          reason: ocrStatus === "required"
            ? "The inspected pages do not contain a usable text layer."
            : ocrStatus === "recommended"
              ? "Some pages do not contain enough text to support source-grounded claims."
              : "Every inspected page contains a usable text layer."
        },
        warnings
      },
      content: {
        title,
        text: cleanSourceText(sections.map((section) => section.text).join("\n\n"), maxTextChars),
        sections,
        links,
        assets,
        citations
      },
      createdAt: options.createdAt
    });
  } catch {
    return createFailedSourceArtifact({
      kind: "uploaded-pdf",
      displayName: originalName,
      mediaType: "application/pdf",
      method: "pdf-text",
      failureCode: "pdf_extraction_failed",
      warning: "The PDF structure could not be read safely.",
      createdAt: options.createdAt
    });
  } finally {
    await loadingTask?.destroy().catch(() => undefined);
  }
}
