import { MAX_ATTEMPTS, currentPlan, perWinner, totalShares, wheelSlots } from "./committee";
import type { AdminState, PublicState, State } from "./types";

export function toPublic(s: State): PublicState {
  const done = s.members.length > 0 && wheelSlots(s.members, s.draws).length === 0;
  return {
    group: s.group,
    members: s.members.map(({ phone: _phone, ...m }) => m),
    draws: s.draws,
    turns: done ? [] : s.turns.map((t) => ({ id: t.id, spinnerId: t.spinnerId, locked: t.failedAttempts >= MAX_ATTEMPTS })),
    plan: s.group ? currentPlan(s.group, s.members, s.draws) : null,
    perWinner: s.group ? perWinner(s.group, s.members) : 0,
    totalShares: totalShares(s.members),
    done,
    updatedAt: s.updatedAt,
  };
}

export function toAdmin(s: State): AdminState {
  const pub = toPublic(s);
  return {
    ...pub,
    members: s.members,
    turns: pub.done
      ? []
      : s.turns.map((t) => ({
          id: t.id,
          spinnerId: t.spinnerId,
          failedAttempts: t.failedAttempts,
          openedAt: t.openedAt,
          locked: t.failedAttempts >= MAX_ATTEMPTS,
        })),
    maxAttempts: MAX_ATTEMPTS,
  };
}
