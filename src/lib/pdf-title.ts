type PdfTitleLine = {
  text: string;
  fontSize: number;
  y: number;
  pageHeight: number;
};

type PdfTitleSignals = {
  metadataTitle?: string | null;
  lines: PdfTitleLine[];
  originalName: string;
};

const genericMetadataTitle = /^(?:untitled|document|microsoft word|powerpoint presentation|adobe indesign|uploaded (?:pdf|document))$/i;
const nonTitleLine = /^(?:page\s+\d+|\d+|https?:\/\/|www\.|prepared(?:\s+for)?\s*:|copyright\b|all rights reserved\b)/i;

function cleanCandidate(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[-–—|:;,.\s]+|[-–—|:;,\s]+$/g, "")
    .trim()
    .slice(0, 180);
}

function titleKey(value: string): string {
  return cleanCandidate(value)
    .replace(/\.(?:pdf|docx?|pptx?)$/i, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function isPlausibleTitle(value: string, originalName: string): boolean {
  const candidate = cleanCandidate(value);
  if (candidate.length < 4 || candidate.length > 180) return false;
  if (genericMetadataTitle.test(candidate) || nonTitleLine.test(candidate)) return false;
  if (!/[\p{L}\p{N}]/u.test(candidate)) return false;
  const candidateKey = titleKey(candidate);
  const filenameKey = titleKey(originalName);
  if (!candidateKey || candidateKey === filenameKey) return false;
  if (/^(?:microsoftword|adobeindesign|powerpointpresentation)/i.test(candidateKey)) return false;
  return true;
}

function lineGroups(lines: PdfTitleLine[]): PdfTitleLine[] {
  const ordered = lines
    .filter((line) => line.text.trim() && line.fontSize > 0)
    .sort((left, right) => right.y - left.y);
  const groups = [...ordered];

  for (let start = 0; start < ordered.length; start += 1) {
    let text = ordered[start]!.text;
    let minimumSize = ordered[start]!.fontSize;
    for (let end = start + 1; end < Math.min(ordered.length, start + 3); end += 1) {
      const previous = ordered[end - 1]!;
      const current = ordered[end]!;
      const sizeRatio = Math.min(previous.fontSize, current.fontSize) / Math.max(previous.fontSize, current.fontSize);
      const gap = previous.y - current.y;
      if (sizeRatio < 0.72 || gap > Math.max(previous.fontSize, current.fontSize) * 1.9) break;
      text = `${text} ${current.text}`;
      minimumSize = Math.min(minimumSize, current.fontSize);
      groups.push({
        text,
        fontSize: minimumSize,
        y: ordered[start]!.y,
        pageHeight: ordered[start]!.pageHeight
      });
    }
  }

  return groups;
}

export function choosePdfDocumentTitle(signals: PdfTitleSignals): string | undefined {
  const metadataTitle = cleanCandidate(signals.metadataTitle ?? "");
  if (isPlausibleTitle(metadataTitle, signals.originalName)) return metadataTitle;

  const candidates = lineGroups(signals.lines)
    .map((line) => {
      const text = cleanCandidate(line.text);
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      const verticalPosition = line.pageHeight > 0 ? line.y / line.pageHeight : 0;
      const score =
        line.fontSize * 10 +
        Math.min(wordCount, 12) * 1.5 +
        Math.max(0, Math.min(1, verticalPosition)) * 24 -
        Math.max(0, text.length - 120) * 0.35;
      return { text, score };
    })
    .filter(({ text }) => isPlausibleTitle(text, signals.originalName))
    .sort((left, right) => right.score - left.score);

  return candidates[0]?.text;
}

export async function extractPdfDocumentTitle(
  bytes: Uint8Array,
  originalName: string
): Promise<string | undefined> {
  let loadingTask: { promise: Promise<unknown>; destroy: () => Promise<void> } | undefined;
  try {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: bytes.slice(), useWorkerFetch: false });
    loadingTask = task as unknown as typeof loadingTask;
    const document = await task.promise;
    const metadata = await document.getMetadata();
    const info = metadata.info as { Title?: unknown };
    const metadataTitle =
      typeof info.Title === "string"
        ? info.Title
        : metadata.metadata?.get("dc:title") ?? metadata.metadata?.get("title") ?? undefined;
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const fragments = content.items
      .filter((item): item is Extract<(typeof content.items)[number], { str: string }> => "str" in item)
      .map((item) => ({
        text: cleanCandidate(item.str),
        x: Number(item.transform[4]) || 0,
        y: Number(item.transform[5]) || 0,
        fontSize: Math.max(Number(item.height) || 0, Math.hypot(Number(item.transform[0]) || 0, Number(item.transform[1]) || 0))
      }))
      .filter((item) => item.text && item.fontSize > 0)
      .sort((left, right) => right.y - left.y || left.x - right.x);

    const lines: Array<PdfTitleLine & { x: number }> = [];
    for (const fragment of fragments) {
      const existing = lines.find(
        (line) => Math.abs(line.y - fragment.y) <= Math.max(2, Math.min(line.fontSize, fragment.fontSize) * 0.28)
      );
      if (existing) {
        existing.text = cleanCandidate(`${existing.text} ${fragment.text}`);
        existing.fontSize = Math.max(existing.fontSize, fragment.fontSize);
        existing.x = Math.min(existing.x, fragment.x);
      } else {
        lines.push({ ...fragment, pageHeight: viewport.height });
      }
    }

    return choosePdfDocumentTitle({ metadataTitle, lines, originalName });
  } catch {
    return undefined;
  } finally {
    await loadingTask?.destroy().catch(() => undefined);
  }
}

export function pdfTitleFallback(): string {
  return "Uploaded document";
}
