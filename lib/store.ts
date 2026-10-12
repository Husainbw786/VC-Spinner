// The whole committee is one small JSON document. On Vercel it lives in Upstash Redis;
// locally (no Redis env vars) it lives in .data/state.json.
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { Redis } from "@upstash/redis";
import { AppError } from "./errors";
import type { State } from "./types";

const STATE_KEY = "committee:state";
const LOCK_KEY = "committee:lock";

export function emptyState(): State {
  return { group: null, members: [], draws: [], turns: [], updatedAt: new Date(0).toISOString() };
}

/** Fill in fields that data saved by an older version of the app doesn't have. */
function normalize(raw: any): State {
  if (!raw) return emptyState();
  return {
    group: raw.group ? { perMonth: 1, ...raw.group } : null,
    members: (raw.members ?? []).map((m: object) => ({ phone: "", shares: 1, openedBefore: 0, ...m })),
    draws: (raw.draws ?? []).map(({ pot, ...d }: { pot?: number }) => ({ amount: pot, ...d })),
    turns: raw.turns ?? (raw.turn ? [{ id: "t0", ...raw.turn }] : []),
    updatedAt: raw.updatedAt ?? new Date(0).toISOString(),
  };
}

interface Store {
  read(): Promise<State>;
  write(state: State): Promise<void>;
  withLock<T>(fn: () => Promise<T>): Promise<T>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class RedisStore implements Store {
  constructor(private redis: Redis) {}

  async read() {
    return normalize(await this.redis.get(STATE_KEY));
  }

  async write(state: State) {
    await this.redis.set(STATE_KEY, state);
  }

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const token = randomUUID();
    const deadline = Date.now() + 5000;
    while (!(await this.redis.set(LOCK_KEY, token, { nx: true, px: 10_000 }))) {
      if (Date.now() > deadline) throw new AppError("Someone else is saving right now. Try again in a moment.", 503);
      await sleep(100);
    }
    try {
      return await fn();
    } finally {
      await this.redis.eval(
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
        [LOCK_KEY],
        [token],
      );
    }
  }
}

class FileStore implements Store {
  private file = path.join(process.cwd(), ".data", "state.json");
  private queue: Promise<unknown> = Promise.resolve();

  async read(): Promise<State> {
    try {
      return normalize(JSON.parse(await fs.readFile(this.file, "utf8")));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
      throw e;
    }
  }

  async write(state: State) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(state, null, 2));
  }

  withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }
}

const globalStore = globalThis as unknown as { __committeeStore?: Store };

export function getStore(): Store {
  if (globalStore.__committeeStore) return globalStore.__committeeStore;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  let store: Store;
  if (url && token) {
    store = new RedisStore(new Redis({ url, token }));
  } else if (process.env.VERCEL) {
    throw new AppError(
      "Storage isn't connected yet. In Vercel, open this project → Storage → add Upstash Redis, then redeploy.",
      503,
    );
  } else {
    store = new FileStore();
  }
  globalStore.__committeeStore = store;
  return store;
}

/**
 * Read-modify-write under a lock so two people can't draw at the same moment.
 * If `fn` throws, nothing is saved. The state is only written when it actually changed.
 */
export async function mutate<T>(fn: (state: State) => T | Promise<T>): Promise<{ result: T; state: State }> {
  const store = getStore();
  return store.withLock(async () => {
    const state = await store.read();
    const before = JSON.stringify(state);
    const result = await fn(state);
    if (JSON.stringify(state) !== before) {
      state.updatedAt = new Date().toISOString();
      await store.write(state);
    }
    return { result, state };
  });
}
