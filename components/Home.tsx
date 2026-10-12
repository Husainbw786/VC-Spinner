"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import confetti from "canvas-confetti";
import Wheel, { WHEEL_COLORS } from "./Wheel";
import {
  drawMonth,
  money,
  monthLabel,
  remainingShares,
  resultMessage,
  waitingNames,
  wheelSlots,
  whatsappLink,
} from "@/lib/committee";
import type { Draw, PublicState } from "@/lib/types";

const SPIN_MS = 7000;
const POLL_MS = 5000;

type Result = { draw: Draw; next: PublicState };

function nameIn(state: PublicState, id: string): string {
  return state.members.find((m) => m.id === id)?.name ?? "Someone";
}

/** Which spin of its month a draw was, e.g. 2 of 2. */
function positionOf(state: PublicState, draw: Draw): { position: number; of: number } {
  const sameMonth = state.draws.filter((d) => d.month === draw.month);
  const of = state.plan?.month === draw.month ? state.plan.spinsThisMonth : Math.max(sameMonth.length, 1);
  return { position: sameMonth.findIndex((d) => d.drawnAt === draw.drawnAt) + 1, of };
}

/** `state` is the state after the draw, so "still to open" is correct. */
function shareText(state: PublicState, draw: Draw, url: string): string {
  const { position, of } = positionOf(state, draw);
  return resultMessage({
    groupName: state.group?.name ?? "Committee",
    draw,
    position,
    spinsInMonth: of,
    currency: state.group?.currency ?? "₹",
    winnerName: nameIn(state, draw.winnerId),
    spinnerName: nameIn(state, draw.spinnerId),
    waiting: waitingNames(state.members, state.draws),
    url,
  });
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function Home({ initial, initialError }: { initial: PublicState | null; initialError: string | null }) {
  const [state, setState] = useState(initial);
  const [loadError, setLoadError] = useState(initialError);
  const [rotation, setRotation] = useState(() => {
    const n = initial ? wheelSlots(initial.members, initial.draws).length : 0;
    return n ? 360 - 180 / n : 0; // rest with the pointer in the middle of the first slice
  });
  const [spinMs, setSpinMs] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [reveal, setReveal] = useState<Result | null>(null);
  const [pins, setPins] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  const stateRef = useRef(state);
  const rotationRef = useRef(rotation);
  const pendingRef = useRef<Result | null>(null);
  // True from the moment a spin starts until the winner card is closed. Polling leaves the page alone meanwhile.
  const busyRef = useRef(false);
  const fallbackRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const finishSpin = useCallback(() => {
    const result = pendingRef.current;
    if (!result) return;
    pendingRef.current = null;
    window.clearTimeout(fallbackRef.current);
    setSpinning(false);
    setReveal(result);
    if (!reducedMotion()) {
      const colors = WHEEL_COLORS.map((c) => c.fill);
      confetti({ particleCount: 140, spread: 80, origin: { y: 0.55 }, colors, zIndex: 100 });
      window.setTimeout(() => confetti({ particleCount: 90, spread: 120, origin: { y: 0.45 }, colors, zIndex: 100 }), 350);
    }
  }, []);

  /** Spin the wheel as it looks now (before the draw) so it lands on one of the winner's slices. */
  const startSpin = useCallback(
    (draw: Draw, next: PublicState) => {
      busyRef.current = true;
      pendingRef.current = { draw, next };
      const current = stateRef.current;
      const slots = current ? wheelSlots(current.members, current.draws) : [];
      const matches = slots.flatMap((m, i) => (m.id === draw.winnerId ? [i] : []));
      if (matches.length === 0) {
        finishSpin();
        return;
      }
      const index = matches[Math.floor(Math.random() * matches.length)];
      const reduced = reducedMotion();
      const seg = 360 / slots.length;
      const landing = index * seg + seg / 2 + (Math.random() - 0.5) * seg * 0.6;
      const desired = ((-landing % 360) + 360) % 360;
      const from = rotationRef.current;
      const target = from + (reduced ? 1 : 6) * 360 + ((desired - (from % 360) + 360) % 360);
      const ms = reduced ? 1200 : SPIN_MS;
      rotationRef.current = target;
      setSpinMs(ms);
      setSpinning(true);
      setRotation(target);
      window.clearTimeout(fallbackRef.current);
      fallbackRef.current = window.setTimeout(finishSpin, ms + 800);
    },
    [finishSpin],
  );

  const closeReveal = useCallback(() => {
    if (!reveal) return;
    setState(reveal.next);
    setReveal(null);
    setSpinMs(0);
    busyRef.current = false;
  }, [reveal]);

  useEffect(() => {
    if (!reveal) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeReveal();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reveal, closeReveal]);

  // Keep everyone's page in sync. When someone else spins, watchers see the wheel spin too.
  useEffect(() => {
    let stopped = false;
    async function tick() {
      if (busyRef.current || document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        const data = await res.json();
        if (stopped || busyRef.current) return;
        if (!res.ok) {
          setLoadError(data.error ?? "Couldn't load the committee.");
          return;
        }
        setLoadError(null);
        const next = data as PublicState;
        const prev = stateRef.current;
        if (prev?.group && next.draws.length === prev.draws.length + 1) {
          startSpin(next.draws[next.draws.length - 1], next);
        } else if (!prev || next.updatedAt !== prev.updatedAt) {
          setState(next);
        }
      } catch {
        // Offline for a moment; the next tick tries again.
      }
    }
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [startSpin]);

  async function onSpin(e: FormEvent, turnId: string) {
    e.preventDefault();
    const pin = (pins[turnId] ?? "").trim();
    if (!pin) {
      setErrors((x) => ({ ...x, [turnId]: "Enter the password the admin sent you." }));
      return;
    }
    busyRef.current = true;
    setSubmitting(turnId);
    setErrors((x) => ({ ...x, [turnId]: "" }));
    try {
      const res = await fetch("/api/spin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ turnId, pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        busyRef.current = false;
        setErrors((x) => ({ ...x, [turnId]: data.error ?? "Couldn't spin. Try again." }));
        if (data.state) setState(data.state);
        return;
      }
      setPins((x) => ({ ...x, [turnId]: "" }));
      startSpin(data.draw, data.state);
    } catch {
      busyRef.current = false;
      setErrors((x) => ({ ...x, [turnId]: "Couldn't reach the server. Check your internet and try again." }));
    } finally {
      setSubmitting(null);
    }
  }

  if (!state) {
    return (
      <div className="page">
        <section className="card empty">
          <h1>Can&apos;t load the committee</h1>
          <p>{loadError ?? "Try refreshing the page."}</p>
        </section>
      </div>
    );
  }

  const group = state.group;
  if (!group || state.members.length < 2) {
    return (
      <div className="page">
        <section className="card empty">
          <p className="eyebrow">Committee draw</p>
          <h1>Not set up yet</h1>
          <p>The admin adds the group name, monthly amount and members first.</p>
          <a className="btn btn-primary" href="/admin">
            Go to admin
          </a>
        </section>
      </div>
    );
  }

  const slots = wheelSlots(state.members, state.draws);
  const wheel = (state.done ? state.members : slots).map((m, i) => ({ key: `${m.id}-${i}`, name: m.name }));
  const left = remainingShares(state.members, state.draws);
  const waiting = state.members.filter((m) => (left.get(m.id) ?? 0) > 0);
  const openedBefore = state.members.filter((m) => m.openedBefore > 0);
  const plan = state.plan;
  const monthDraws = plan ? state.draws.filter((d) => d.month === plan.month) : [];
  const unassigned = plan ? plan.spinsThisMonth - monthDraws.length - state.turns.length : 0;
  const lastMonthDraws =
    monthDraws.length === 0 && state.draws.length > 0 ? state.draws.filter((d) => d.month === state.draws.at(-1)!.month) : [];
  const totalAppDraws = state.draws.length + slots.length;
  const busy = spinning || submitting !== null || !!reveal;
  const monthTotal = group.amount * state.totalShares;

  return (
    <div className="page">
      <header className="masthead">
        <p className="eyebrow">Monthly committee</p>
        <h1>{group.name}</h1>
        <p className="sub">
          {money(group.amount, group.currency)} per share each month · {state.members.length} members · {state.totalShares} shares
          {group.perMonth > 1 ? ` · ${group.perMonth} winners a month` : ""}
        </p>
      </header>

      {loadError && (
        <p className="banner" role="status">
          {loadError}
        </p>
      )}

      <main className="stage">
        <section className="wheel-col" aria-label="Wheel">
          <Wheel slots={wheel} rotation={rotation} durationMs={spinMs} symbol={group.currency} dimmed={state.done} onSpinEnd={finishSpin} />
          <p className="wheel-caption">
            {state.done
              ? "Every share has been opened."
              : `${slots.length} ${slots.length === 1 ? "share" : "shares"} left on the wheel. Two shares means two slices.`}
          </p>
        </section>

        <section className="panel" aria-live="polite">
          {state.done || !plan ? (
            <div className="stack">
              <p className="eyebrow">Committee complete</p>
              <h2 className="panel-title">Everyone has received their amount</h2>
              <p className="muted">{state.draws.length} draws in this app.</p>
            </div>
          ) : (
            <>
              <div className="stack-tight">
                <p className="eyebrow">{monthLabel(plan.month)} draw</p>
                <p className="pot">
                  <span className="pot-amount">{money(state.perWinner, group.currency)}</span>
                  <span className="pot-math">{plan.spinsThisMonth > 1 ? `to each of ${plan.spinsThisMonth} winners` : "to the winner"}</span>
                </p>
                <p className="muted">
                  {state.totalShares} shares × {money(group.amount, group.currency)} = {money(monthTotal, group.currency)} this month
                </p>
              </div>

              <ol className="spins">
                {monthDraws.map((d, i) => (
                  <li key={d.drawnAt} className="spin spin-done">
                    <span className="spin-no">Spin {i + 1}</span>
                    <div className="spin-body">
                      <p>
                        <strong>{nameIn(state, d.winnerId)}</strong> won {money(d.amount, group.currency)}
                      </p>
                      <p className="muted">Spun by {nameIn(state, d.spinnerId)}</p>
                      <a className="btn btn-whatsapp btn-small" href={whatsappLink(shareText(state, d, origin))} target="_blank" rel="noopener noreferrer">
                        Share on WhatsApp
                      </a>
                    </div>
                  </li>
                ))}
                {state.turns.map((t, j) => {
                  const spinner = nameIn(state, t.spinnerId);
                  return (
                    <li key={t.id} className="spin spin-open">
                      <span className="spin-no">Spin {monthDraws.length + j + 1}</span>
                      <div className="spin-body">
                        <p className="spinner-line">
                          <span className="chip chip-gold">Spinner</span>
                          <span className="spinner-name">{spinner}</span>
                        </p>
                        {t.locked ? (
                          <p className="notice">Too many wrong passwords. {spinner} needs a new password from the admin.</p>
                        ) : (
                          <form className="spin-form" onSubmit={(e) => onSpin(e, t.id)}>
                            <label htmlFor={`pin-${t.id}`}>Password for {spinner}</label>
                            <div className="spin-row">
                              <input
                                id={`pin-${t.id}`}
                                type="password"
                                autoComplete="off"
                                value={pins[t.id] ?? ""}
                                onChange={(e) => setPins((x) => ({ ...x, [t.id]: e.target.value }))}
                                disabled={busy}
                              />
                              <button className="btn btn-spin" disabled={busy}>
                                {submitting === t.id ? "Checking…" : spinning ? "Spinning…" : "Spin"}
                              </button>
                            </div>
                            {errors[t.id] && (
                              <p className="form-error" role="alert">
                                {errors[t.id]}
                              </p>
                            )}
                          </form>
                        )}
                      </div>
                    </li>
                  );
                })}
                {Array.from({ length: Math.max(0, unassigned) }, (_, k) => (
                  <li key={`waiting-${k}`} className="spin spin-waiting">
                    <span className="spin-no">Spin {monthDraws.length + state.turns.length + k + 1}</span>
                    <p className="muted spin-body">The admin will choose who spins and send them a password.</p>
                  </li>
                ))}
              </ol>
              {state.turns.length > 0 && <p className="hint">Only the spinner has their password. Everyone else can watch the wheel live on this page.</p>}
            </>
          )}

          {lastMonthDraws.length > 0 && (
            <div className="last">
              <p className="eyebrow">Last draw · {monthLabel(lastMonthDraws[0].month)}</p>
              {lastMonthDraws.map((d) => (
                <div key={d.drawnAt} className="last-item">
                  <p className="last-line">
                    <strong>{nameIn(state, d.winnerId)}</strong> took {money(d.amount, group.currency)}
                    <span className="muted"> · spun by {nameIn(state, d.spinnerId)}</span>
                  </p>
                  <a className="btn btn-whatsapp btn-small" href={whatsappLink(shareText(state, d, origin))} target="_blank" rel="noopener noreferrer">
                    Share on WhatsApp
                  </a>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <section className="ledger" aria-labelledby="ledger-title">
        <h2 id="ledger-title">Draw history</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Month</th>
                <th>Winner</th>
                <th>Spun by</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: totalAppDraws }, (_, i) => {
                const draw = state.draws[i];
                const month = draw?.month ?? drawMonth(group, i);
                const isNow = !draw && month === plan?.month;
                return (
                  <tr key={i} className={draw ? "" : isNow ? "next" : "upcoming"}>
                    <td className="num">{i + 1}</td>
                    <td>{monthLabel(month)}</td>
                    <td>{draw ? <strong>{nameIn(state, draw.winnerId)}</strong> : isNow ? "This month" : "—"}</td>
                    <td>{draw ? nameIn(state, draw.spinnerId) : "—"}</td>
                    <td className="num">{money(draw ? draw.amount : state.perWinner, group.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="ledger-lists">
          {waiting.length > 0 && (
            <div className="stack-tight">
              <h3>Still to open ({slots.length})</h3>
              <ul className="chips">
                {waiting.map((m) => (
                  <li key={m.id}>
                    {m.name}
                    {left.get(m.id)! > 1 && <span className="count">×{left.get(m.id)}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {openedBefore.length > 0 && (
            <div className="stack-tight">
              <h3>Opened before this app ({openedBefore.reduce((n, m) => n + m.openedBefore, 0)})</h3>
              <ul className="chips chips-quiet">
                {openedBefore.map((m) => (
                  <li key={m.id}>
                    {m.name}
                    {m.openedBefore > 1 && <span className="count">×{m.openedBefore}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <footer className="footer">
        <p>The server picks each winner at random. Every share still waiting is one ticket.</p>
        <a href="/admin">Admin</a>
      </footer>

      {reveal && (
        <div className="reveal-backdrop" role="dialog" aria-modal="true" aria-labelledby="reveal-name" onClick={closeReveal}>
          <div className="reveal-card" onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow">
              {monthLabel(reveal.draw.month)}
              {(() => {
                const { position, of } = positionOf(reveal.next, reveal.draw);
                return of > 1 ? ` · winner ${position} of ${of}` : " winner";
              })()}
            </p>
            <p id="reveal-name" className="reveal-name">
              {nameIn(reveal.next, reveal.draw.winnerId)}
            </p>
            <p className="reveal-pot">
              takes home <strong>{money(reveal.draw.amount, group.currency)}</strong>
            </p>
            <p className="muted">Spun by {nameIn(reveal.next, reveal.draw.spinnerId)}</p>
            <div className="reveal-actions">
              <a className="btn btn-whatsapp" href={whatsappLink(shareText(reveal.next, reveal.draw, origin))} target="_blank" rel="noopener noreferrer">
                Share on WhatsApp
              </a>
              <button className="btn btn-ghost" onClick={closeReveal} autoFocus>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
