import { NextRequest } from "next/server";
import { runAction } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth";
import { AppError, errorResponse } from "@/lib/errors";
import { getStore, mutate } from "@/lib/store";
import { toAdmin } from "@/lib/views";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    requireAdmin(req);
    return Response.json(toAdmin(await getStore().read()), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    requireAdmin(req);
    const body = await req.json().catch(() => null);
    if (!body || typeof body.action !== "string") throw new AppError("Unknown request.", 400);
    const { result, state } = await mutate((s) => runAction(s, body));
    return Response.json({ ...result, state: toAdmin(state) });
  } catch (e) {
    return errorResponse(e);
  }
}
