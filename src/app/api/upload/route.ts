import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { newSessionId, saveUpload } from "@/lib/fileStore";
import { detectHeader } from "@/lib/docxHeader";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const files = formData.getAll("files") as File[];
  if (!files.length) return NextResponse.json({ error: "No files uploaded" }, { status: 400 });

  const sessionId = newSessionId();
  const results = [];

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      results.push({ originalName: file.name, error: "Only .docx files are supported" });
      continue;
    }
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const uploaded = await saveUpload(sessionId, file.name, buffer);

    let detection;
    try {
      detection = await detectHeader(buffer);
    } catch (e) {
      results.push({
        originalName: file.name,
        docId: uploaded.id,
        error: "Could not read this file — is it a valid .docx?",
      });
      continue;
    }

    results.push({
      originalName: file.name,
      docId: uploaded.id,
      state: detection.state,
      rawText: detection.rawText,
      detected: detection.detected,
    });
  }

  return NextResponse.json({ sessionId, files: results });
}
