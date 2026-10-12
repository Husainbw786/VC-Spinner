import { createHash, createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { AppError } from "./errors";

export const ADMIN_COOKIE = "committee_admin";
const SESSION_DAYS = 7;
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;

function adminPassword(): string {
  const p = process.env.ADMIN_PASSWORD;
  if (!p) {
    throw new AppError(
      "ADMIN_PASSWORD isn't set. Add it in Vercel → Settings → Environment Variables (or .env.local), then restart.",
      503,
    );
  }
  return p;
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// Keyed on the admin password, so changing ADMIN_PASSWORD logs every admin out.
function sign(value: string): string {
  return createHmac("sha256", `session:${adminPassword()}`).update(value).digest("hex");
}

export function checkAdminPassword(input: string): boolean {
  return safeEqual(input, adminPassword());
}

export function createSessionToken(): string {
  const expires = String(Date.now() + SESSION_MAX_AGE * 1000);
  return `${expires}.${sign(expires)}`;
}

export function requireAdmin(req: NextRequest): void {
  const token = req.cookies.get(ADMIN_COOKIE)?.value ?? "";
  const [expires, sig] = token.split(".");
  const valid = !!expires && !!sig && Number(expires) > Date.now() && safeEqual(sig, sign(expires));
  if (!valid) throw new AppError("Please log in as admin.", 401);
}

export function generatePin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pin, salt, 32).toString("hex")}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  return timingSafeEqual(scryptSync(pin, salt, 32), Buffer.from(hash, "hex"));
}
