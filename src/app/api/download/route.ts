import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { readGeneratedZip } from "@/lib/fileStore";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

  try {
    const buffer = await readGeneratedZip(sessionId);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="experiment_docs_${sessionId.slice(0, 8)}.zip"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Generated file not found. It may have expired — please regenerate." }, { status: 404 });
  }
}
