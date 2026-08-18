import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Local-filesystem-backed store for uploaded/generated files, keyed by a
 * session id (one "batch" of uploads at a time).
 *
 * On Vercel, the local filesystem is ephemeral per-invocation, so this
 * works for `next dev` / a traditional Node host, but for a real Vercel
 * deployment swap this for Vercel Blob — see README "Deploying to Vercel".
 */

const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");
const GENERATED_DIR = path.join(process.cwd(), "data", "generated");

async function ensureDirs() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.mkdir(GENERATED_DIR, { recursive: true });
}

export type UploadedDoc = {
  id: string;
  originalName: string;
  storedPath: string;
};

export async function saveUpload(sessionId: string, originalName: string, buffer: Buffer): Promise<UploadedDoc> {
  await ensureDirs();
  const sessionDir = path.join(UPLOADS_DIR, sessionId);
  await fs.mkdir(sessionDir, { recursive: true });
  const id = randomUUID();
  const storedPath = path.join(sessionDir, `${id}.docx`);
  await fs.writeFile(storedPath, buffer);
  return { id, originalName, storedPath };
}

export async function readUpload(storedPath: string): Promise<Buffer> {
  return fs.readFile(storedPath);
}

export function uploadPathFor(sessionId: string, docId: string): string {
  return path.join(UPLOADS_DIR, sessionId, `${docId}.docx`);
}

export async function saveGeneratedZip(sessionId: string, buffer: Buffer): Promise<string> {
  await ensureDirs();
  const sessionDir = path.join(GENERATED_DIR, sessionId);
  await fs.mkdir(sessionDir, { recursive: true });
  const zipPath = path.join(sessionDir, "batch.zip");
  await fs.writeFile(zipPath, buffer);
  return zipPath;
}

export async function readGeneratedZip(sessionId: string): Promise<Buffer> {
  const zipPath = path.join(GENERATED_DIR, sessionId, "batch.zip");
  return fs.readFile(zipPath);
}

export async function saveGeneratedPdf(sessionId: string, buffer: Buffer): Promise<string> {
  await ensureDirs();
  const sessionDir = path.join(GENERATED_DIR, sessionId);
  await fs.mkdir(sessionDir, { recursive: true });
  const pdfPath = path.join(sessionDir, "combined-print.pdf");
  await fs.writeFile(pdfPath, buffer);
  return pdfPath;
}

export async function readGeneratedPdf(sessionId: string): Promise<Buffer> {
  const pdfPath = path.join(GENERATED_DIR, sessionId, "combined-print.pdf");
  return fs.readFile(pdfPath);
}

export async function saveUploadedCombinedPdf(sessionId: string, buffer: Buffer): Promise<string> {
  await ensureDirs();
  const sessionDir = path.join(GENERATED_DIR, sessionId);
  await fs.mkdir(sessionDir, { recursive: true });
  const pdfPath = path.join(sessionDir, "uploaded-combined-print.pdf");
  await fs.writeFile(pdfPath, buffer);
  return pdfPath;
}

export async function readUploadedCombinedPdf(sessionId: string): Promise<Buffer> {
  const pdfPath = path.join(GENERATED_DIR, sessionId, "uploaded-combined-print.pdf");
  return fs.readFile(pdfPath);
}

export function newSessionId(): string {
  return randomUUID();
}
