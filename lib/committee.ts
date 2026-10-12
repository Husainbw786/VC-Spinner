// Pure helpers shared by the server and the browser.
import type { Draw, Group, MonthPlan } from "./types";

/** Wrong passwords allowed per opened spin before it locks. */
export const MAX_ATTEMPTS = 10;

type Holder = { id: string; shares: number; openedBefore: number };

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

export function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function money(amount: number, currency: string): string {
  return `${currency}${amount.toLocaleString("en-IN")}`;
}

export function totalShares(members: Holder[]): number {
  return members.reduce((n, m) => n + m.shares, 0);
}

/** Shares each member still has to win. */
export function remainingShares(members: Holder[], draws: Draw[]): Map<string, number> {
  const won = new Map<string, number>();
  for (const d of draws) won.set(d.winnerId, (won.get(d.winnerId) ?? 0) + 1);
  return new Map(members.map((m) => [m.id, Math.max(0, m.shares - m.openedBefore - (won.get(m.id) ?? 0))]));
}

/**
 * One wheel slice per share still to win. A person with two shares left appears twice,
 * spread apart. The server and the browser build the same order.
 */
export function wheelSlots<T extends Holder>(members: T[], draws: Draw[]): T[] {
  const left = remainingShares(members, draws);
  const rounds = Math.max(0, ...left.values());
  const slots: T[] = [];
  for (let round = 0; round < rounds; round++) {
    for (const m of members) if ((left.get(m.id) ?? 0) > round) slots.push(m);
  }
  return slots;
}

/** Each month every share pays `amount`; the total is split between that month's winners. */
export function perWinner(group: Group, members: Holder[]): number {
  return Math.round((group.amount * totalShares(members)) / group.perMonth);
}

export function drawMonth(group: Group, drawIndex: number): string {
  return addMonths(group.startMonth, Math.floor(drawIndex / group.perMonth));
}

export function currentPlan(group: Group, members: Holder[], draws: Draw[]): MonthPlan | null {
  const left = wheelSlots(members, draws).length;
  if (left === 0) return null;
  const doneThisMonth = draws.length % group.perMonth;
  return {
    month: drawMonth(group, draws.length),
    doneThisMonth,
    spinsThisMonth: doneThisMonth + Math.min(group.perMonth - doneThisMonth, left),
  };
}

/** Names still waiting, with a count for people who have more than one share left. */
export function waitingNames(members: (Holder & { name: string })[], draws: Draw[]): string[] {
  const left = remainingShares(members, draws);
  return members
    .filter((m) => (left.get(m.id) ?? 0) > 0)
    .map((m) => (left.get(m.id)! > 1 ? `${m.name} (${left.get(m.id)})` : m.name));
}

export function whatsappLink(text: string, phone?: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function resultMessage(o: {
  groupName: string;
  draw: Draw;
  position: number;
  spinsInMonth: number;
  currency: string;
  winnerName: string;
  spinnerName: string;
  waiting: string[];
  url: string;
}): string {
  const heading =
    o.spinsInMonth > 1
      ? `*${o.groupName}* · ${monthLabel(o.draw.month)} · draw ${o.position} of ${o.spinsInMonth}`
      : `*${o.groupName}* · ${monthLabel(o.draw.month)} draw`;
  const lines = [
    heading,
    `Winner: *${o.winnerName}*`,
    `Amount: ${money(o.draw.amount, o.currency)}`,
    `Spun by ${o.spinnerName}`,
    "",
    o.waiting.length ? `Still to open: ${o.waiting.join(", ")}` : "Everyone has now received their amount.",
  ];
  if (o.url) lines.push(o.url);
  return lines.join("\n");
}

export function pinMessage(o: { groupName: string; spinnerName: string; month: string; pin: string; url: string }): string {
  return [
    `Hi ${o.spinnerName}, you're spinning the wheel for *${o.groupName}* this month (${monthLabel(o.month)}).`,
    "",
    `Open ${o.url} and enter this password: *${o.pin}*`,
    "",
    "Please don't share it with anyone.",
  ].join("\n");
}
