import { cookies } from "next/headers";
import crypto from "node:crypto";

const COOKIE_NAME = "expdoc_session";

function getSecret(): string {
  const secret = process.env.APP_PASSWORD;
  if (!secret) {
    throw new Error("APP_PASSWORD environment variable is not set. See README for setup.");
  }
  return secret;
}

function sign(value: string): string {
  const secret = getSecret();
  const hmac = crypto.createHmac("sha256", secret).update(value).digest("hex");
  return `${value}.${hmac}`;
}

function verify(token: string): boolean {
  const secret = getSecret();
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [value, sig] = parts;
  const expected = crypto.createHmac("sha256", secret).update(value).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  if (!process.env.APP_PASSWORD) return false;
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return false;
  return verify(token);
}

export function checkPassword(password: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(password), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function createSession(): Promise<void> {
  const store = await cookies();
  const token = sign("ok");
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
