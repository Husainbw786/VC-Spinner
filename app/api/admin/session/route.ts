import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, SESSION_MAX_AGE, checkAdminPassword, createSessionToken } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

// Log in
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const password = typeof body?.password === "string" ? body.password : "";
    if (!checkAdminPassword(password)) {
      // Slow down password guessing.
      await new Promise((r) => setTimeout(r, 700));
      return NextResponse.json({ error: "That admin password is wrong." }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(ADMIN_COOKIE, createSessionToken(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}

// Log out
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}
