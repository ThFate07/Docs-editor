import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isAuthenticated } from "@/lib/auth";

export const runtime = "nodejs";

const DOCX_CONTENT_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
];
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

function isAllowedUploadPath(pathname: string): boolean {
  return /^uploads\/[^/]+\/[^/]+\.docx$/i.test(pathname);
}

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  if (body.type === "blob.generate-client-token" && !(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const json = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!isAllowedUploadPath(pathname)) {
          throw new Error("Only .docx uploads are allowed");
        }

        return {
          allowedContentTypes: DOCX_CONTENT_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
        };
      },
    });

    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Blob upload setup failed" },
      { status: 400 }
    );
  }
}
