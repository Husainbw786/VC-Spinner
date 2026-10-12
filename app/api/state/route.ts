import { errorResponse } from "@/lib/errors";
import { getStore } from "@/lib/store";
import { toPublic } from "@/lib/views";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await getStore().read();
    return Response.json(toPublic(state), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
