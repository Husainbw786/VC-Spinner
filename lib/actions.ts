// Admin actions. Each one mutates the state in place or throws an AppError (nothing is saved then).
import { randomUUID } from "crypto";
import { currentPlan, wheelSlots } from "./committee";
import { generatePin, hashPin } from "./auth";
import { AppError } from "./errors";
import type { Member, State } from "./types";

type Body = Record<string, unknown>;

const bad = (message: string) => new AppError(message, 400);

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function wholeNumber(value: unknown, min: number, max: number): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export function runAction(s: State, body: Body): { pin?: string; turnId?: string } {
  switch (body.action) {
    case "saveGroup":
      saveGroup(s, body);
      return {};
    case "openTurn":
      return openTurn(s, body);
    case "resetPin":
      return resetPin(s, body);
    case "cancelTurn":
      s.turns = s.turns.filter((t) => t.id !== body.turnId);
      return {};
    case "undoLastDraw":
      undoLastDraw(s, body);
      return {};
    case "clearDraws":
      if (body.confirm !== "CLEAR") throw bad("Type CLEAR to confirm.");
      s.draws = [];
      s.turns = [];
      return {};
    default:
      throw bad("Unknown action.");
  }
}

function saveGroup(s: State, body: Body) {
  const name = text(body.name, 60);
  if (!name) throw bad("Give the group a name.");

  const amount = wholeNumber(body.amount, 1, 1_000_000_000);
  if (amount === null) throw bad("The monthly amount must be a whole number above 0.");

  const currency = text(body.currency, 4) || "₹";

  const perMonth = wholeNumber(body.perMonth, 1, 5);
  if (perMonth === null) throw bad("Pick how many winners there are each month.");

  const startMonth = typeof body.startMonth === "string" ? body.startMonth : "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth)) throw bad("Pick the month of the first draw.");

  if (s.group && s.draws.length > 0) {
    if (startMonth !== s.group.startMonth) throw bad("The first draw month can't change once draws have started.");
    if (perMonth !== s.group.perMonth) throw bad("Winners per month can't change once draws have started.");
  }

  if (!Array.isArray(body.members)) throw bad("Add the members.");
  const existing = new Map(s.members.map((m) => [m.id, m]));
  const members: Member[] = [];
  const seen = new Set<string>();
  for (const raw of body.members.slice(0, 200) as Body[]) {
    const memberName = text(raw?.name, 40);
    if (!memberName) continue;
    const key = memberName.toLowerCase();
    if (seen.has(key)) throw bad(`"${memberName}" is listed twice. Use one row and set their shares to 2 instead.`);
    seen.add(key);
    const shares = wholeNumber(raw.shares, 1, 10);
    if (shares === null) throw bad(`Set how many shares ${memberName} has (1 to 10).`);
    const openedBefore = wholeNumber(raw.openedBefore, 0, shares);
    if (openedBefore === null) throw bad(`${memberName} can't have more shares opened than they own.`);
    const id = typeof raw.id === "string" && existing.has(raw.id) ? raw.id : randomUUID().slice(0, 8);
    const phone = typeof raw.phone === "string" ? raw.phone.replace(/[^\d+]/g, "").slice(0, 16) : "";
    members.push({ id, name: memberName, phone, shares, openedBefore });
  }
  if (members.length < 2) throw bad("A committee needs at least 2 members.");

  const byId = new Map(members.map((m) => [m.id, m]));
  const wins = new Map<string, number>();
  for (const d of s.draws) {
    wins.set(d.winnerId, (wins.get(d.winnerId) ?? 0) + 1);
    for (const id of [d.winnerId, d.spinnerId]) {
      if (!byId.has(id)) throw bad(`${existing.get(id)?.name ?? "A member"} is in the draw history, so they can't be removed.`);
    }
  }
  for (const [id, count] of wins) {
    const m = byId.get(id)!;
    if (m.shares - m.openedBefore < count) {
      throw bad(`${m.name} has already won ${count} ${count === 1 ? "time" : "times"} in this app. Give them more shares or fewer opened before.`);
    }
  }
  for (const t of s.turns) {
    if (!byId.has(t.spinnerId)) throw bad(`${existing.get(t.spinnerId)?.name ?? "That member"} has an open spin. Cancel it first.`);
  }

  s.group = { name, amount, currency, startMonth, perMonth };
  s.members = members;
  // Drop open spins that no longer fit this month (e.g. fewer shares left).
  const plan = currentPlan(s.group, s.members, s.draws);
  s.turns = plan ? s.turns.slice(0, plan.spinsThisMonth - plan.doneThisMonth) : [];
}

function readPin(body: Body): string {
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  if (pin && !/^[A-Za-z0-9]{4,20}$/.test(pin)) throw bad("A custom password needs 4 to 20 letters or numbers.");
  return pin || generatePin();
}

function openTurn(s: State, body: Body): { pin: string; turnId: string } {
  if (!s.group || s.members.length < 2) throw bad("Set up the group first.");
  if (wheelSlots(s.members, s.draws).length === 0) throw bad("Everyone has already received their amount.");
  const plan = currentPlan(s.group, s.members, s.draws)!;
  if (s.turns.length >= plan.spinsThisMonth - plan.doneThisMonth) {
    throw bad("All spins for this month are already open. Cancel one to choose someone else.");
  }

  const spinner = s.members.find((m) => m.id === body.spinnerId);
  if (!spinner) throw bad("Pick who spins.");
  if (s.turns.some((t) => t.spinnerId === spinner.id)) throw bad(`${spinner.name} already has an open spin this month.`);

  const pin = readPin(body);
  const turnId = randomUUID().slice(0, 8);
  s.turns.push({ id: turnId, spinnerId: spinner.id, pinHash: hashPin(pin), failedAttempts: 0, openedAt: new Date().toISOString() });
  return { pin, turnId };
}

function resetPin(s: State, body: Body): { pin: string; turnId: string } {
  const turn = s.turns.find((t) => t.id === body.turnId);
  if (!turn) throw bad("That spin isn't open any more. Refresh the page.");
  const pin = readPin(body);
  turn.pinHash = hashPin(pin);
  turn.failedAttempts = 0;
  return { pin, turnId: turn.id };
}

function undoLastDraw(s: State, body: Body) {
  const last = s.draws.at(-1);
  if (!last) throw bad("There's no draw to undo.");
  if (body.drawnAt !== last.drawnAt) throw bad("The draws changed since you opened this page. Refresh and try again.");
  s.draws.pop();
  s.turns = [];
}
