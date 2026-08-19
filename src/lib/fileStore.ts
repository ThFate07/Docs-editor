import { randomUUID } from "node:crypto";
import { get, put, type GetBlobResult } from "@vercel/blob";

const ACCESS = "private" as const;
const DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type UploadedDoc = {
  id: string;
  originalName: string;
  storedPath: string;
};

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const arrayBuffer = await new Response(stream).arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function readPrivateBlob(pathname: string): Promise<Buffer> {
  const result = await get(pathname, { access: ACCESS, useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`Blob not found: ${pathname}`);
  }
  return streamToBuffer(result.stream);
}

async function getPrivateBlob(pathname: string): Promise<GetBlobResult & { statusCode: 200 }> {
  const result = await get(pathname, { access: ACCESS, useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`Blob not found: ${pathname}`);
  }
  return result;
}

export function uploadPathFor(sessionId: string, docId: string): string {
  return `uploads/${sessionId}/${docId}.docx`;
}

function generatedZipPath(sessionId: string): string {
  return `generated/${sessionId}/batch.zip`;
}

function generatedPdfPath(sessionId: string): string {
  return `generated/${sessionId}/combined-print.pdf`;
}

function uploadedCombinedPdfPath(sessionId: string): string {
  return `generated/${sessionId}/uploaded-combined-print.pdf`;
}

export async function saveUpload(sessionId: string, originalName: string, buffer: Buffer): Promise<UploadedDoc> {
  const id = randomUUID();
  const storedPath = uploadPathFor(sessionId, id);
  await put(storedPath, buffer, {
    access: ACCESS,
    contentType: DOCX_CONTENT_TYPE,
    allowOverwrite: false,
    multipart: true,
  });
  return { id, originalName, storedPath };
}

export async function readUpload(storedPath: string): Promise<Buffer> {
  return readPrivateBlob(storedPath);
}

export async function saveGeneratedZip(sessionId: string, buffer: Buffer): Promise<string> {
  const pathname = generatedZipPath(sessionId);
  await put(pathname, buffer, {
    access: ACCESS,
    contentType: "application/zip",
    allowOverwrite: true,
    multipart: true,
  });
  return pathname;
}

export async function readGeneratedZip(sessionId: string): Promise<Buffer> {
  return readPrivateBlob(generatedZipPath(sessionId));
}

export async function getGeneratedZip(sessionId: string): Promise<GetBlobResult & { statusCode: 200 }> {
  return getPrivateBlob(generatedZipPath(sessionId));
}

export async function saveGeneratedPdf(sessionId: string, buffer: Buffer): Promise<string> {
  const pathname = generatedPdfPath(sessionId);
  await put(pathname, buffer, {
    access: ACCESS,
    contentType: "application/pdf",
    allowOverwrite: true,
    multipart: true,
  });
  return pathname;
}

export async function readGeneratedPdf(sessionId: string): Promise<Buffer> {
  return readPrivateBlob(generatedPdfPath(sessionId));
}

export async function getGeneratedPdf(sessionId: string): Promise<GetBlobResult & { statusCode: 200 }> {
  return getPrivateBlob(generatedPdfPath(sessionId));
}

export async function saveUploadedCombinedPdf(sessionId: string, buffer: Buffer): Promise<string> {
  const pathname = uploadedCombinedPdfPath(sessionId);
  await put(pathname, buffer, {
    access: ACCESS,
    contentType: "application/pdf",
    allowOverwrite: true,
    multipart: true,
  });
  return pathname;
}

export async function readUploadedCombinedPdf(sessionId: string): Promise<Buffer> {
  return readPrivateBlob(uploadedCombinedPdfPath(sessionId));
}

export async function getUploadedCombinedPdf(sessionId: string): Promise<GetBlobResult & { statusCode: 200 }> {
  return getPrivateBlob(uploadedCombinedPdfPath(sessionId));
}

export function newSessionId(): string {
  return randomUUID();
}
