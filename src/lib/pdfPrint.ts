import { PDFDocument } from "pdf-lib";

export type DocxForPdf = {
  fileName: string;
  docx: Buffer;
};

export type DuplexMergeResult = {
  pdf: Buffer;
  pageCount: number;
  blankPagesAdded: number;
};

const CONVERSION_COOLDOWN_MS = 3_000;
const CONVERSION_RETRY_DELAYS_MS = [5_000, 10_000, 20_000];

function gotenbergUrl(): string {
  const url = process.env.GOTENBERG_URL?.replace(/\/+$/, "");
  if (!url) throw new Error("GOTENBERG_URL is not configured");
  return url;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientConversionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /\b(404|408|429|500|502|503|504)\b/.test(error.message) || /not found|bad gateway|timeout|timed out/i.test(error.message);
}

async function convertDocxToPdf(doc: DocxForPdf): Promise<Buffer> {
  const formData = new FormData();
  const file = new Blob([new Uint8Array(doc.docx)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  formData.append("files", file, doc.fileName);

  const res = await fetch(`${gotenbergUrl()}/forms/libreoffice/convert`, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(180_000),
  });

  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(message || `Gotenberg returned ${res.status} ${res.statusText}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

export async function convertDocxToPdfWithRetry(doc: DocxForPdf): Promise<Buffer> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= CONVERSION_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await sleep(CONVERSION_RETRY_DELAYS_MS[attempt - 1]);
    } else {
      await sleep(CONVERSION_COOLDOWN_MS);
    }

    try {
      return await convertDocxToPdf(doc);
    } catch (error) {
      lastError = error;
      if (!isTransientConversionError(error)) break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown error converting this file");
}

export async function mergeForDuplexPrint(pdfBuffers: Buffer[]): Promise<DuplexMergeResult> {
  const merged = await PDFDocument.create();
  let blankPagesAdded = 0;

  for (let i = 0; i < pdfBuffers.length; i++) {
    const source = await PDFDocument.load(pdfBuffers[i]);
    const sourcePages = await merged.copyPages(source, source.getPageIndices());
    for (const page of sourcePages) merged.addPage(page);

    if (i < pdfBuffers.length - 1 && sourcePages.length % 2 === 1) {
      const lastPage = sourcePages[sourcePages.length - 1];
      const { width, height } = lastPage.getSize();
      merged.addPage([width, height]);
      blankPagesAdded++;
    }
  }

  const bytes = await merged.save();
  return {
    pdf: Buffer.from(bytes),
    pageCount: merged.getPageCount(),
    blankPagesAdded,
  };
}
