import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { readGeneratedPdf } from "@/lib/fileStore";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

  try {
    const buffer = await readGeneratedPdf(sessionId);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="combined_print_${sessionId.slice(0, 8)}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Combined print PDF not found. It may have expired — please regenerate." }, { status: 404 });
  }
}
