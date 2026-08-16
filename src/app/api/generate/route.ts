import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { isAuthenticated } from "@/lib/auth";
import { readUpload, uploadPathFor, saveGeneratedZip } from "@/lib/fileStore";
import { generateForPerson } from "@/lib/docxHeader";
import { listPeople } from "@/lib/peopleStore";

export const runtime = "nodejs";

type GenerateRequestBody = {
  sessionId: string;
  files: { docId: string; originalName: string }[];
  personIds?: string[]; // if omitted, use everyone in the saved list
};

function sanitizeForFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "").trim().replace(/\s+/g, "_");
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as GenerateRequestBody;
  const { sessionId, files, personIds } = body ?? {};
  if (!sessionId || !files?.length) {
    return NextResponse.json({ error: "Missing sessionId or files" }, { status: 400 });
  }

  const allPeople = await listPeople();
  const people = personIds?.length ? allPeople.filter((p) => personIds.includes(p.id)) : allPeople;
  if (!people.length) {
    return NextResponse.json({ error: "No people to generate for. Add people first." }, { status: 400 });
  }

  const zip = new JSZip();
  const errors: { file: string; person: string; message: string }[] = [];
  let successCount = 0;

  for (const file of files) {
    let buffer: Buffer;
    try {
      buffer = await readUpload(uploadPathFor(sessionId, file.docId));
    } catch {
      errors.push({ file: file.originalName, person: "*", message: "Uploaded file could not be found (session may have expired)" });
      continue;
    }

    const baseName = file.originalName.replace(/\.docx$/i, "");
    for (const person of people) {
      try {
        const out = await generateForPerson(buffer, person);
        const fileName = `${sanitizeForFilename(baseName)}_${sanitizeForFilename(person.name)}.docx`;
        zip.file(fileName, out);
        successCount++;
      } catch (e) {
        errors.push({
          file: file.originalName,
          person: person.name,
          message: e instanceof Error ? e.message : "Unknown error generating this file",
        });
      }
    }
  }

  if (successCount === 0) {
    return NextResponse.json({ error: "Nothing was generated", errors }, { status: 500 });
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  await saveGeneratedZip(sessionId, zipBuffer);

  return NextResponse.json({
    ok: true,
    sessionId,
    generatedCount: successCount,
    errors,
    downloadUrl: `/api/download?sessionId=${encodeURIComponent(sessionId)}`,
  });
}
