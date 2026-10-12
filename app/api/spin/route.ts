import { randomInt } from "crypto";
import { verifyPin } from "@/lib/auth";
import { MAX_ATTEMPTS, currentPlan, drawMonth, perWinner, wheelSlots } from "@/lib/committee";
import { errorResponse } from "@/lib/errors";
import { mutate } from "@/lib/store";
import type { Draw } from "@/lib/types";
import { toPublic } from "@/lib/views";

type Outcome = { status: 200; draw: Draw } | { status: 401 | 409 | 423; error: string };

const LOCKED = "Too many wrong passwords. Ask the admin for a new one.";

// The winner is picked here on the server with a cryptographic random number,
// so nobody can influence it from their browser. The page only animates the result.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
  const turnId = typeof body?.turnId === "string" ? body.turnId : "";
  if (!pin) return Response.json({ error: "Enter the password the admin sent you." }, { status: 400 });

  try {
    const { result, state } = await mutate((s): Outcome => {
      if (!s.group || s.members.length < 2) return { status: 409, error: "The committee isn't set up yet." };
      const slots = wheelSlots(s.members, s.draws);
      if (slots.length === 0) return { status: 409, error: "Everyone has already received their amount." };

      const turn = turnId ? s.turns.find((t) => t.id === turnId) : s.turns.length === 1 ? s.turns[0] : undefined;
      if (!turn) return { status: 409, error: "This spin isn't open right now. Refresh the page or ask the admin." };
      if (turn.failedAttempts >= MAX_ATTEMPTS) return { status: 423, error: LOCKED };

      if (!verifyPin(pin, turn.pinHash)) {
        turn.failedAttempts += 1;
        const left = MAX_ATTEMPTS - turn.failedAttempts;
        if (left === 0) return { status: 423, error: LOCKED };
        return { status: 401, error: `Wrong password. ${left} ${left === 1 ? "try" : "tries"} left.` };
      }

      // Every share still waiting is one ticket, so two shares means twice the chance.
      const winner = slots[randomInt(slots.length)];
      const draw: Draw = {
        month: drawMonth(s.group, s.draws.length),
        winnerId: winner.id,
        spinnerId: turn.spinnerId,
        amount: perWinner(s.group, s.members),
        drawnAt: new Date().toISOString(),
      };
      s.draws.push(draw);
      s.turns = s.turns.filter((t) => t.id !== turn.id);
      // If that finished the month or the whole committee, no other spin should stay open.
      const plan = currentPlan(s.group, s.members, s.draws);
      if (!plan || plan.doneThisMonth === 0) s.turns = [];
      return { status: 200, draw };
    });

    if (result.status !== 200) {
      return Response.json({ error: result.error, state: toPublic(state) }, { status: result.status });
    }
    return Response.json({ draw: result.draw, state: toPublic(state) });
  } catch (e) {
    return errorResponse(e);
  }
}
