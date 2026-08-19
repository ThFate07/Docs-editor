import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getGeneratedPdf } from "@/lib/fileStore";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

  try {
    const blob = await getGeneratedPdf(sessionId);
    return new NextResponse(blob.stream, {
      status: 200,
      headers: {
        "Content-Type": blob.blob.contentType || "application/pdf",
        "Content-Disposition": `attachment; filename="combined_print_${sessionId.slice(0, 8)}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Combined print PDF not found. It may have expired — please regenerate." }, { status: 404 });
  }
}
