import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getGeneratedZip } from "@/lib/fileStore";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

  try {
    const blob = await getGeneratedZip(sessionId);
    return new NextResponse(blob.stream, {
      status: 200,
      headers: {
        "Content-Type": blob.blob.contentType || "application/zip",
        "Content-Disposition": `attachment; filename="experiment_docs_${sessionId.slice(0, 8)}.zip"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Generated file not found. It may have expired — please regenerate." }, { status: 404 });
  }
}
