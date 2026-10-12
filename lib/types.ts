export type Member = {
  id: string;
  name: string;
  phone: string;
  /** How many times this person pays in each month. Each share wins once. */
  shares: number;
  /** Shares that were already opened before the group started using this app. */
  openedBefore: number;
};

export type Group = {
  name: string;
  /** What one share pays every month. */
  amount: number;
  currency: string;
  /** Month of the first draw in this app, as YYYY-MM. */
  startMonth: string;
  /** Winners drawn each month. */
  perMonth: number;
};

export type Draw = {
  month: string;
  winnerId: string;
  spinnerId: string;
  /** What this winner received. */
  amount: number;
  drawnAt: string;
};

/** A spin the admin opened for one chosen spinner, unlocked by its own password. */
export type Turn = {
  id: string;
  spinnerId: string;
  pinHash: string;
  failedAttempts: number;
  openedAt: string;
};

export type State = {
  group: Group | null;
  members: Member[];
  draws: Draw[];
  turns: Turn[];
  updatedAt: string;
};

/** The month being drawn now. The last month can have fewer spins than usual. */
export type MonthPlan = { month: string; doneThisMonth: number; spinsThisMonth: number };

export type PublicMember = Omit<Member, "phone">;

/** What anyone opening the site can see. No phone numbers, no password hashes. */
export type PublicState = {
  group: Group | null;
  members: PublicMember[];
  draws: Draw[];
  turns: { id: string; spinnerId: string; locked: boolean }[];
  plan: MonthPlan | null;
  perWinner: number;
  totalShares: number;
  done: boolean;
  updatedAt: string;
};

export type AdminState = Omit<PublicState, "members" | "turns"> & {
  members: Member[];
  turns: { id: string; spinnerId: string; failedAttempts: number; openedAt: string; locked: boolean }[];
  maxAttempts: number;
};
