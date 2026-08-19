import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { readUpload, uploadPathFor } from "@/lib/fileStore";
import { detectHeader } from "@/lib/docxHeader";

export const runtime = "nodejs";

type UploadedBlobInput = {
  docId: string;
  originalName: string;
  pathname: string;
};

type UploadAnalyzeRequestBody = {
  sessionId: string;
  files: UploadedBlobInput[];
};

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as UploadAnalyzeRequestBody;
  const { sessionId, files } = body ?? {};
  if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  if (!Array.isArray(files) || !files.length) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }

  const results = [];

  for (const file of files) {
    if (!file.originalName.toLowerCase().endsWith(".docx")) {
      results.push({ originalName: file.originalName, error: "Only .docx files are supported" });
      continue;
    }

    const expectedPathname = uploadPathFor(sessionId, file.docId);
    if (file.pathname !== expectedPathname) {
      results.push({ originalName: file.originalName, error: "Uploaded file path did not match this session" });
      continue;
    }

    let buffer: Buffer;
    try {
      buffer = await readUpload(expectedPathname);
    } catch {
      results.push({ originalName: file.originalName, docId: file.docId, error: "Uploaded file could not be found" });
      continue;
    }

    let detection;
    try {
      detection = await detectHeader(buffer);
    } catch {
      results.push({
        originalName: file.originalName,
        docId: file.docId,
        error: "Could not read this file — is it a valid .docx?",
      });
      continue;
    }

    results.push({
      originalName: file.originalName,
      docId: file.docId,
      state: detection.state,
      rawText: detection.rawText,
      detected: detection.detected,
    });
  }

  return NextResponse.json({ sessionId, files: results });
}
