import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { readUpload, saveUploadedCombinedPdf, uploadPathFor } from "@/lib/fileStore";
import { convertDocxToPdfWithRetry, mergeForDuplexPrint, type DocxForPdf } from "@/lib/pdfPrint";

export const runtime = "nodejs";

type CombineUploadedPrintRequestBody = {
  sessionId: string;
  files: { docId: string; originalName: string }[];
};

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as CombineUploadedPrintRequestBody;
  const { sessionId, files } = body ?? {};
  if (!sessionId || !files?.length) {
    return NextResponse.json({ error: "Missing sessionId or files" }, { status: 400 });
  }

  const docs: DocxForPdf[] = [];
  const errors: { file: string; message: string }[] = [];

  for (const file of files) {
    try {
      docs.push({
        fileName: file.originalName,
        docx: await readUpload(uploadPathFor(sessionId, file.docId)),
      });
    } catch {
      errors.push({ file: file.originalName, message: "Uploaded file could not be found (session may have expired)" });
    }
  }

  if (errors.length > 0 || docs.length === 0) {
    return NextResponse.json({ error: "Could not prepare every uploaded document for PDF", errors }, { status: 500 });
  }

  const pdfBuffers: Buffer[] = [];
  for (const doc of docs) {
    try {
      pdfBuffers.push(await convertDocxToPdfWithRetry(doc));
    } catch (e) {
      errors.push({
        file: doc.fileName,
        message: e instanceof Error ? e.message : "Unknown error converting this file",
      });
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Could not convert every uploaded document to PDF", errors }, { status: 502 });
  }

  const { pdf, pageCount, blankPagesAdded } = await mergeForDuplexPrint(pdfBuffers);
  await saveUploadedCombinedPdf(sessionId, pdf);

  return NextResponse.json({
    ok: true,
    sessionId,
    generatedCount: docs.length,
    pageCount,
    blankPagesAdded,
    errors,
    downloadUrl: `/api/download-uploaded-print?sessionId=${encodeURIComponent(sessionId)}`,
  });
}
