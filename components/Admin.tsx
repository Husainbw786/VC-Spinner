"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { money, monthLabel, pinMessage, thisMonth, whatsappLink } from "@/lib/committee";
import type { AdminState } from "@/lib/types";

type ActResult = { pin?: string; turnId?: string; state: AdminState };
type Act = (action: string, payload?: Record<string, unknown>) => Promise<ActResult>;

async function request(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    cache: "no-store",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Try again.");

export default function Admin() {
  const [phase, setPhase] = useState<"loading" | "login" | "ready" | "error">("loading");
  const [data, setData] = useState<AdminState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await request("GET", "/api/admin");
      if (r.status === 401) return setPhase("login");
      if (!r.ok) {
        setError(r.data.error ?? "Couldn't load the admin page.");
        return setPhase("error");
      }
      setData(r.data);
      setPhase("ready");
    } catch {
      setError("Couldn't reach the server. Check your internet and refresh.");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    load();
  }, [load]);

  const act: Act = useCallback(async (action, payload = {}) => {
    const r = await request("POST", "/api/admin", { action, ...payload });
    if (r.status === 401) {
      setPhase("login");
      throw new Error("Your admin login expired. Log in again.");
    }
    if (!r.ok) throw new Error(r.data.error ?? "Couldn't save. Try again.");
    setData(r.data.state);
    return r.data as ActResult;
  }, []);

  async function logout() {
    await request("DELETE", "/api/admin/session").catch(() => {});
    setData(null);
    setPhase("login");
  }

  if (phase === "loading") {
    return (
      <div className="page narrow">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="page narrow">
        <section className="card stack">
          <h1 className="card-title">Can&apos;t open admin</h1>
          <p>{error}</p>
        </section>
      </div>
    );
  }

  if (phase === "login" || !data) {
    return (
      <div className="page narrow">
        <LoginForm onDone={load} />
      </div>
    );
  }

  return (
    <div className="page">
      <header className="admin-head">
        <div className="stack-tight">
          <p className="eyebrow">Admin</p>
          <h1 className="admin-title">{data.group?.name ?? "Set up your committee"}</h1>
        </div>
        <div className="row">
          <a className="btn btn-ghost" href="/">
            Open draw page
          </a>
          <button className="btn btn-ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <div className="admin-grid">
        <MonthCard key={data.plan?.month ?? "done"} data={data} act={act} origin={origin} />
        <LastDrawCard data={data} act={act} />
      </div>

      <SettingsForm data={data} act={act} />
      <DangerZone data={data} act={act} />
    </div>
  );
}

function LoginForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await request("POST", "/api/admin/session", { password });
      if (!r.ok) return setErr(r.data.error ?? "Couldn't log in.");
      setPassword("");
      onDone();
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <div className="stack-tight">
        <p className="eyebrow">Committee draw</p>
        <h1 className="card-title">Admin login</h1>
        <p className="muted">Manage members and open each month&apos;s spins.</p>
      </div>
      <div className="field">
        <label htmlFor="admin-password">Admin password</label>
        <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {err && (
        <p className="form-error" role="alert">
          {err}
        </p>
      )}
      <button className="btn btn-primary" disabled={busy || !password}>
        {busy ? "Checking…" : "Log in"}
      </button>
    </form>
  );
}

function MonthCard({ data, act, origin }: { data: AdminState; act: Act; origin: string }) {
  const [shownPins, setShownPins] = useState<Record<string, string>>({});
  const [spinnerId, setSpinnerId] = useState("");
  const [customPin, setCustomPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const group = data.group;
  if (!group || data.members.length < 2) {
    return (
      <section className="card stack">
        <h2 className="card-title">This month</h2>
        <p className="muted">Add the group name, monthly amount and members below. Then you can open the first spins here.</p>
      </section>
    );
  }
  if (data.done || !data.plan) {
    return (
      <section className="card stack">
        <p className="eyebrow">Committee complete</p>
        <h2 className="card-title">Everyone has received their amount</h2>
        <p className="muted">All {data.totalShares} shares have been opened.</p>
      </section>
    );
  }

  const plan = data.plan;
  const name = (id: string) => data.members.find((m) => m.id === id)?.name ?? "Unknown";
  const phone = (id: string) => data.members.find((m) => m.id === id)?.phone ?? "";
  const monthDraws = data.draws.filter((d) => d.month === plan.month);
  const canOpen = plan.spinsThisMonth - monthDraws.length - data.turns.length;
  const taken = new Set(data.turns.map((t) => t.spinnerId));
  const choices = data.members.filter((m) => !taken.has(m.id));
  const selected = choices.some((m) => m.id === spinnerId) ? spinnerId : "";

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  const open = () =>
    run(async () => {
      const r = await act("openTurn", { spinnerId: selected, pin: customPin });
      setShownPins((x) => ({ ...x, [r.turnId!]: r.pin! }));
      setSpinnerId("");
      setCustomPin("");
    });

  const newPassword = (turnId: string) =>
    run(async () => {
      const r = await act("resetPin", { turnId });
      setShownPins((x) => ({ ...x, [r.turnId!]: r.pin! }));
    });

  const cancel = (turnId: string) => run(async () => void (await act("cancelTurn", { turnId })));

  return (
    <section className="card stack">
      <div className="stack-tight">
        <p className="eyebrow">
          {plan.spinsThisMonth} {plan.spinsThisMonth === 1 ? "spin" : "spins"} · {money(data.perWinner, group.currency)} to each winner
        </p>
        <h2 className="card-title">{monthLabel(plan.month)} draw</h2>
      </div>

      {monthDraws.length > 0 && (
        <ul className="plain-list">
          {monthDraws.map((d, i) => (
            <li key={d.drawnAt}>
              Spin {i + 1}: <strong>{name(d.winnerId)}</strong> won · spun by {name(d.spinnerId)}
            </li>
          ))}
        </ul>
      )}

      {data.turns.map((t, i) => (
        <div key={t.id} className="turn-item stack">
          <div className="stack-tight">
            <h3>
              Spin {monthDraws.length + i + 1}: open for {name(t.spinnerId)}
            </h3>
            <p className={t.locked ? "notice" : "hint"}>
              {t.locked
                ? `Locked after ${data.maxAttempts} wrong passwords. Make a new password to unlock it.`
                : `Wrong passwords so far: ${t.failedAttempts} of ${data.maxAttempts}.`}
            </p>
          </div>
          {shownPins[t.id] ? (
            <PinPanel pin={shownPins[t.id]} spinner={name(t.spinnerId)} phone={phone(t.spinnerId)} groupName={group.name} month={plan.month} origin={origin} />
          ) : (
            <p className="hint">The password was shown when you opened this spin. If it&apos;s lost, make a new one. The old one stops working.</p>
          )}
          <div className="row">
            <button className="btn btn-ghost btn-small" onClick={() => newPassword(t.id)} disabled={busy}>
              Make a new password
            </button>
            <button className="btn btn-ghost btn-small" onClick={() => cancel(t.id)} disabled={busy}>
              Cancel this spin
            </button>
          </div>
        </div>
      ))}

      {canOpen > 0 && (
        <form
          className="stack open-form"
          onSubmit={(e) => {
            e.preventDefault();
            open();
          }}
        >
          <h3>
            Choose who does spin {monthDraws.length + data.turns.length + 1} of {plan.spinsThisMonth}
          </h3>
          <div className="field">
            <label htmlFor="spinner">Spinner</label>
            <div className="select-row">
              <select id="spinner" value={selected} onChange={(e) => setSpinnerId(e.target.value)}>
                <option value="">Choose a member…</option>
                {choices.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setSpinnerId(choices[Math.floor(Math.random() * choices.length)]?.id ?? "")}
              >
                Pick at random
              </button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="custom-pin">
              Password <span className="muted">(optional)</span>
            </label>
            <input
              id="custom-pin"
              value={customPin}
              onChange={(e) => setCustomPin(e.target.value)}
              placeholder="Leave empty for a random 6-digit one"
              autoComplete="off"
            />
          </div>
          <button className="btn btn-primary" disabled={busy || !selected}>
            {busy ? "Opening…" : "Open spin and make password"}
          </button>
        </form>
      )}

      {err && (
        <p className="form-error" role="alert">
          {err}
        </p>
      )}
    </section>
  );
}

function PinPanel(p: { pin: string; spinner: string; phone: string; groupName: string; month: string; origin: string }) {
  const [copied, setCopied] = useState(false);
  const message = pinMessage({ groupName: p.groupName, spinnerName: p.spinner, month: p.month, pin: p.pin, url: p.origin });

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="pin-panel">
      <p className="pin-label">Password for {p.spinner}</p>
      <p className="pin">{p.pin}</p>
      <div className="row">
        <a className="btn btn-whatsapp" href={whatsappLink(message, p.phone)} target="_blank" rel="noopener noreferrer">
          Send to {p.spinner} on WhatsApp
        </a>
        <button type="button" className="btn btn-ghost" onClick={copy}>
          {copied ? "Copied" : "Copy message"}
        </button>
      </div>
      <p className="hint">
        You&apos;ll only see this password now.
        {p.phone ? "" : ` Add ${p.spinner}'s phone number below to open their chat directly.`}
      </p>
    </div>
  );
}

function LastDrawCard({ data, act }: { data: AdminState; act: Act }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const last = data.draws.at(-1);
  if (!last || !data.group) {
    return (
      <section className="card stack">
        <h2 className="card-title">Last draw</h2>
        <p className="muted">No draws in this app yet. Results show up here and on the draw page.</p>
      </section>
    );
  }
  const name = (id: string) => data.members.find((m) => m.id === id)?.name ?? "Unknown";

  async function undo() {
    setBusy(true);
    setErr(null);
    try {
      await act("undoLastDraw", { drawnAt: last!.drawnAt });
      setConfirming(false);
    } catch (e) {
      setErr(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack">
      <p className="eyebrow">Last draw · {monthLabel(last.month)}</p>
      <h2 className="card-title">{name(last.winnerId)}</h2>
      <p className="muted">
        Took {money(last.amount, data.group.currency)} · spun by {name(last.spinnerId)}
      </p>
      {confirming ? (
        <div className="confirm stack-tight">
          <p>
            Undo this draw? {name(last.winnerId)} goes back on the wheel. Any open spins are cancelled too, so you&apos;ll send new passwords.
          </p>
          <div className="row">
            <button className="btn btn-danger" onClick={undo} disabled={busy}>
              {busy ? "Undoing…" : "Yes, undo it"}
            </button>
            <button className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button className="btn btn-ghost" onClick={() => setConfirming(true)}>
            Undo this draw
          </button>
        </div>
      )}
      {err && (
        <p className="form-error" role="alert">
          {err}
        </p>
      )}
    </section>
  );
}

type Row = { key: string; id?: string; name: string; phone: string; shares: number; openedBefore: number };

const newKey = () => Math.random().toString(36).slice(2);
const blankRow = (): Row => ({ key: newKey(), name: "", phone: "", shares: 1, openedBefore: 0 });
const rowsFrom = (data: AdminState): Row[] =>
  data.members.length
    ? data.members.map((m) => ({ key: m.id, id: m.id, name: m.name, phone: m.phone, shares: m.shares, openedBefore: m.openedBefore }))
    : [blankRow(), blankRow(), blankRow()];

/** Turn two pasted lists into member rows. A name listed twice means two shares. */
function rowsFromLists(waiting: string, opened: string, current: Row[]): Row[] {
  const byName = new Map(current.filter((r) => r.name.trim()).map((r) => [r.name.trim().toLowerCase(), r]));
  const rows = new Map<string, Row>();
  const add = (line: string, wasOpened: boolean) => {
    const name = line.trim().replace(/\s+/g, " ");
    if (!name) return;
    const key = name.toLowerCase();
    const old = byName.get(key);
    const row = rows.get(key) ?? { key: old?.key ?? newKey(), id: old?.id, name, phone: old?.phone ?? "", shares: 0, openedBefore: 0 };
    row.shares += 1;
    if (wasOpened) row.openedBefore += 1;
    rows.set(key, row);
  };
  waiting.split("\n").forEach((l) => add(l, false));
  opened.split("\n").forEach((l) => add(l, true));
  return [...rows.values()];
}

function SettingsForm({ data, act }: { data: AdminState; act: Act }) {
  const g = data.group;
  const [name, setName] = useState(g?.name ?? "");
  const [amount, setAmount] = useState(g ? String(g.amount) : "");
  const [currency, setCurrency] = useState(g?.currency ?? "₹");
  const [startMonth, setStartMonth] = useState(g?.startMonth ?? thisMonth());
  const [perMonth, setPerMonth] = useState(g?.perMonth ?? 1);
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(data));
  const [pasteWaiting, setPasteWaiting] = useState("");
  const [pasteOpened, setPasteOpened] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const wins = new Map<string, number>();
  for (const d of data.draws) wins.set(d.winnerId, (wins.get(d.winnerId) ?? 0) + 1);
  const lockReason = new Map<string, string>();
  for (const d of data.draws) {
    lockReason.set(d.spinnerId, "In history");
    lockReason.set(d.winnerId, "Has won");
  }
  for (const t of data.turns) lockReason.set(t.spinnerId, "Spinning now");

  const filled = rows.filter((r) => r.name.trim());
  const shares = filled.reduce((n, r) => n + r.shares, 0);
  const opened = filled.reduce((n, r) => n + r.openedBefore, 0);
  const amountNum = Number(amount);
  const locked = data.draws.length > 0;

  function update(key: string, patch: Partial<Row>) {
    setNotice(null);
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        next.openedBefore = Math.min(next.openedBefore, next.shares);
        return next;
      }),
    );
  }

  function applyPaste() {
    const next = rowsFromLists(pasteWaiting, pasteOpened, rows);
    if (next.length === 0) return setErr("Paste at least one name.");
    setErr(null);
    setRows(next);
    setNotice(`Filled ${next.length} members with ${next.reduce((n, r) => n + r.shares, 0)} shares. Check them, then save.`);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      const r = await act("saveGroup", {
        name,
        amount: amountNum,
        currency,
        startMonth,
        perMonth,
        members: rows.map(({ id, name, phone, shares, openedBefore }) => ({ id, name, phone, shares, openedBefore })),
      });
      setRows(rowsFrom(r.state));
      setNotice("Saved");
    } catch (e) {
      setErr(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2 className="card-title">Group settings</h2>

      <div className="settings-grid">
        <div className="field span-2">
          <label htmlFor="group-name">Group name</label>
          <input id="group-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. VC 2026" maxLength={60} />
        </div>
        <div className="field">
          <label htmlFor="amount">Each share pays per month</label>
          <input id="amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} placeholder="2000" />
        </div>
        <div className="field">
          <label htmlFor="currency">Currency symbol</label>
          <input id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={4} />
        </div>
        <div className="field">
          <label htmlFor="per-month">Winners each month</label>
          <select id="per-month" value={perMonth} onChange={(e) => setPerMonth(Number(e.target.value))} disabled={locked}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="start-month">First draw in this app</label>
          <input id="start-month" type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} disabled={locked} />
        </div>
        {locked && <p className="hint span-2">Winners per month and the first month are locked because draws have started.</p>}
      </div>

      <div className="stack-tight">
        <h3>Members ({filled.length})</h3>
        <p className="hint">
          Shares: how many times the person pays each month. Opened before: shares that already won before you started using this app. Phone numbers are only
          used for the &quot;Send on WhatsApp&quot; button. Include the country code, e.g. 91 98765 43210.
        </p>
      </div>

      <details className="paste">
        <summary>Fill from a pasted list</summary>
        <div className="stack paste-body">
          <p className="hint">One name per line. Write a name twice if that person has 2 shares. Phone numbers you already typed are kept.</p>
          <div className="paste-grid">
            <div className="field">
              <label htmlFor="paste-waiting">Not opened yet</label>
              <textarea id="paste-waiting" rows={8} value={pasteWaiting} onChange={(e) => setPasteWaiting(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="paste-opened">Already opened before this app</label>
              <textarea id="paste-opened" rows={8} value={pasteOpened} onChange={(e) => setPasteOpened(e.target.value)} />
            </div>
          </div>
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={applyPaste}>
              Replace the members list
            </button>
          </div>
        </div>
      </details>

      <ul className="member-list">
        {rows.map((r, i) => {
          const reason = r.id ? lockReason.get(r.id) : undefined;
          const minShares = Math.max(1, r.openedBefore + (r.id ? (wins.get(r.id) ?? 0) : 0));
          return (
            <li key={r.key} className="member-row">
              <input
                id={`member-name-${r.key}`}
                className="m-name"
                aria-label={`Member ${i + 1} name`}
                value={r.name}
                onChange={(e) => update(r.key, { name: e.target.value })}
                placeholder={`Member ${i + 1} name`}
                maxLength={40}
              />
              <select
                id={`member-shares-${r.key}`}
                className="m-shares"
                aria-label={`${r.name || `Member ${i + 1}`} shares`}
                value={r.shares}
                onChange={(e) => update(r.key, { shares: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n} disabled={n < minShares}>
                    {n} {n === 1 ? "share" : "shares"}
                  </option>
                ))}
              </select>
              <select
                id={`member-opened-${r.key}`}
                className="m-opened"
                aria-label={`${r.name || `Member ${i + 1}`} shares opened before this app`}
                value={r.openedBefore}
                onChange={(e) => update(r.key, { openedBefore: Number(e.target.value) })}
              >
                {Array.from({ length: r.shares + 1 }, (_, n) => (
                  <option key={n} value={n}>
                    {n === 0 ? "None opened" : `${n} opened before`}
                  </option>
                ))}
              </select>
              <input
                id={`member-phone-${r.key}`}
                className="m-phone"
                aria-label={`${r.name || `Member ${i + 1}`} phone`}
                inputMode="tel"
                value={r.phone}
                onChange={(e) => update(r.key, { phone: e.target.value })}
                placeholder="Phone (optional)"
              />
              <button
                type="button"
                className="btn btn-ghost btn-small m-remove"
                onClick={() => {
                  setNotice(null);
                  setRows((rs) => rs.filter((x) => x.key !== r.key));
                }}
                disabled={!!reason}
                title={reason ? `${reason}, so they can't be removed` : "Remove"}
              >
                {reason ?? "Remove"}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="row">
        <button type="button" className="btn btn-ghost" onClick={() => setRows((rs) => [...rs, blankRow()])}>
          Add member
        </button>
      </div>

      {shares > 0 && amountNum > 0 && (
        <p className="summary">
          {shares} shares × {money(amountNum, currency)} = <strong>{money(shares * amountNum, currency)}</strong> a month
          {perMonth > 1 ? (
            <>
              , split between {perMonth} winners: <strong>{money(Math.round((shares * amountNum) / perMonth), currency)}</strong> each
            </>
          ) : null}
          . {shares - opened} {shares - opened === 1 ? "share is" : "shares are"} still to open
          {opened > 0 ? ` (${opened} opened before)` : ""}.
        </p>
      )}

      {err && (
        <p className="form-error" role="alert">
          {err}
        </p>
      )}
      <div className="row">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </button>
        {notice && (
          <span className="saved" role="status">
            {notice}
          </span>
        )}
      </div>
    </form>
  );
}

function DangerZone({ data, act }: { data: AdminState; act: Act }) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (data.draws.length === 0) return null;

  async function clear(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await act("clearDraws", { confirm });
      setConfirm("");
    } catch (e) {
      setErr(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack danger-zone" onSubmit={clear}>
      <h2 className="card-title">Start over</h2>
      <p className="muted">
        Clears all {data.draws.length} draws made in this app, so those shares go back on the wheel. Members, shares and settings stay. This can&apos;t be undone.
      </p>
      <div className="field">
        <label htmlFor="clear-confirm">Type CLEAR to confirm</label>
        <input id="clear-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
      </div>
      {err && (
        <p className="form-error" role="alert">
          {err}
        </p>
      )}
      <div className="row">
        <button className="btn btn-danger" disabled={busy || confirm !== "CLEAR"}>
          Clear all draws
        </button>
      </div>
    </form>
  );
}
