import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { readUpload, saveGeneratedPdf, uploadPathFor } from "@/lib/fileStore";
import { generateForPerson } from "@/lib/docxHeader";
import { convertDocxToPdfWithRetry, mergeForDuplexPrint } from "@/lib/pdfPrint";
import { listPeople } from "@/lib/peopleStore";

export const runtime = "nodejs";

type GeneratePrintRequestBody = {
  sessionId: string;
  files: { docId: string; originalName: string }[];
  personIds?: string[];
  selections?: { docId: string; personId: string }[];
};

type GeneratedDoc = {
  fileName: string;
  docx: Buffer;
};

function sanitizeForFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "").trim().replace(/\s+/g, "_");
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as GeneratePrintRequestBody;
  const { sessionId, files, personIds, selections } = body ?? {};
  if (!sessionId || !files?.length) {
    return NextResponse.json({ error: "Missing sessionId or files" }, { status: 400 });
  }

  const allPeople = await listPeople();
  const people = personIds?.length ? allPeople.filter((p) => personIds.includes(p.id)) : allPeople;
  if (!people.length) {
    return NextResponse.json({ error: "No people to generate for. Add people first." }, { status: 400 });
  }
  if (selections && selections.length === 0) {
    return NextResponse.json({ error: "Select at least one doc/person pair to generate." }, { status: 400 });
  }

  const generatedDocs: GeneratedDoc[] = [];
  const errors: { file: string; person: string; message: string }[] = [];
  const selectedPairs = selections ? new Set(selections.map((s) => `${s.docId}:${s.personId}`)) : null;
  const uploadBuffers = new Map<string, Buffer>();

  for (const file of files) {
    try {
      uploadBuffers.set(file.docId, await readUpload(uploadPathFor(sessionId, file.docId)));
    } catch {
      errors.push({ file: file.originalName, person: "*", message: "Uploaded file could not be found (session may have expired)" });
    }
  }

  for (const person of people) {
    for (const file of files) {
      if (selectedPairs && !selectedPairs.has(`${file.docId}:${person.id}`)) continue;
      const buffer = uploadBuffers.get(file.docId);
      if (!buffer) continue;

      try {
        const docx = await generateForPerson(buffer, person);
        const baseName = file.originalName.replace(/\.docx$/i, "");
        const fileName = `${sanitizeForFilename(baseName)}_${sanitizeForFilename(person.name)}.docx`;
        generatedDocs.push({ fileName, docx });
      } catch (e) {
        errors.push({
          file: file.originalName,
          person: person.name,
          message: e instanceof Error ? e.message : "Unknown error generating this file",
        });
      }
    }
  }

  if (errors.length > 0 || generatedDocs.length === 0) {
    return NextResponse.json({ error: "Could not prepare every document for print PDF", errors }, { status: 500 });
  }

  const pdfBuffers: Buffer[] = [];
  for (const doc of generatedDocs) {
    try {
      pdfBuffers.push(await convertDocxToPdfWithRetry(doc));
    } catch (e) {
      errors.push({
        file: doc.fileName,
        person: "*",
        message: e instanceof Error ? e.message : "Unknown error converting this file",
      });
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Could not convert every document to PDF", errors }, { status: 502 });
  }

  const { pdf, pageCount, blankPagesAdded } = await mergeForDuplexPrint(pdfBuffers);
  await saveGeneratedPdf(sessionId, pdf);

  return NextResponse.json({
    ok: true,
    sessionId,
    generatedCount: generatedDocs.length,
    pageCount,
    blankPagesAdded,
    errors,
    downloadUrl: `/api/download-print?sessionId=${encodeURIComponent(sessionId)}`,
  });
}
