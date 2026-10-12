import Home from "@/components/Home";
import { errorMessage } from "@/lib/errors";
import { getStore } from "@/lib/store";
import type { PublicState } from "@/lib/types";
import { toPublic } from "@/lib/views";

export const dynamic = "force-dynamic";

export default async function Page() {
  let initial: PublicState | null = null;
  let error: string | null = null;
  try {
    initial = toPublic(await getStore().read());
  } catch (e) {
    console.error(e);
    error = errorMessage(e);
  }
  return <Home initial={initial} initialError={error} />;
}
