import type { EnquiryStatus } from "./states";
import { isOpenEnquiry } from "./states";

export type StockState = {
  onHand: number;
  reserved: number;
  checkedOut: number;
};

export type StockMovementInput =
  | { type: "stock_in"; qty: number }
  | { type: "stock_out"; qty: number }
  | { type: "reserve"; qty: number }
  | { type: "release"; qty: number }
  | { type: "event_issue"; qty: number }
  | { type: "event_return"; qty: number }
  | { type: "damage" | "loss"; qty: number; from: "checked_out" | "on_hand" }
  | { type: "adjustment"; delta: number };

export function availableOf(state: StockState): number {
  return state.onHand - state.reserved - state.checkedOut;
}

export function stockIsBalanced(state: StockState): boolean {
  return availableOf(state) + state.reserved + state.checkedOut === state.onHand
    && state.onHand >= 0
    && state.reserved >= 0
    && state.checkedOut >= 0;
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

export function applyStockMovement(
  state: StockState,
  movement: StockMovementInput,
  override = false,
): { ok: true; state: StockState } | { ok: false; error: string } {
  const next: StockState = { ...state };
  if (("qty" in movement && movement.qty <= 0) || ("delta" in movement && movement.delta === 0)) {
    return fail("Quantity must be greater than zero.");
  }

  const takeAvailable = (amount: number) => {
    if (availableOf(next) < amount && !override) {
      return fail("That quantity is not available. An authorised override is required to go below available stock.");
    }
    next.onHand -= amount;
    return null;
  };

  if (movement.type === "stock_in") {
    next.onHand += movement.qty;
  } else if (movement.type === "stock_out") {
    const blocked = takeAvailable(movement.qty);
    if (blocked) return blocked;
  } else if (movement.type === "reserve") {
    if (availableOf(next) < movement.qty && !override) {
      return fail("Reservation exceeds available stock.");
    }
    next.reserved += movement.qty;
  } else if (movement.type === "release") {
    if (next.reserved < movement.qty) return fail("Cannot release more than is reserved.");
    next.reserved -= movement.qty;
  } else if (movement.type === "event_issue") {
    if (next.reserved < movement.qty) return fail("Issue only stock that is reserved for the event.");
    next.reserved -= movement.qty;
    next.checkedOut += movement.qty;
  } else if (movement.type === "event_return") {
    if (next.checkedOut < movement.qty) return fail("Cannot return more than is checked out.");
    next.checkedOut -= movement.qty;
  } else if (movement.type === "damage" || movement.type === "loss") {
    if (movement.from === "checked_out") {
      if (next.checkedOut < movement.qty) return fail("Damage or loss exceeds what is checked out.");
      next.checkedOut -= movement.qty;
      next.onHand -= movement.qty;
    } else {
      const blocked = takeAvailable(movement.qty);
      if (blocked) return blocked;
    }
  } else if (movement.type === "adjustment") {
    next.onHand += movement.delta;
    if (availableOf(next) < 0 && !override) {
      return fail("Adjustment would make available stock negative.");
    }
    if (next.onHand < 0) return fail("On-hand stock cannot be negative.");
  }

  if (!stockIsBalanced(next) && !(override && availableOf(next) < 0 && next.onHand >= 0 && next.reserved >= 0 && next.checkedOut >= 0)) {
    if (next.reserved < 0 || next.checkedOut < 0 || next.onHand < 0) {
      return fail("Stock movement would break inventory integrity.");
    }
  }
  if (next.onHand < 0 || next.reserved < 0 || next.checkedOut < 0) {
    return fail("Stock movement would break inventory integrity.");
  }
  if (availableOf(next) < 0 && availableOf(next) < availableOf(state) && !override) {
    return fail("That quantity is not available. An authorised override is required to go below available stock.");
  }
  return { ok: true, state: next };
}

export function isPastDue(value: Date | string | null | undefined, status?: string): boolean {
  if (!value || status === "completed" || status === "cancelled") return false;
  return new Date(value).getTime() < Date.now();
}

export function rangesOverlap(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && startB < endA;
}

export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function formatReference(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function combineNairobi(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 3, minute || 0, 0));
}

export function eventRange(date: string, startTime: string, endTime: string, endDate?: string) {
  const start = combineNairobi(date, startTime);
  const end = combineNairobi(endDate || date, endTime);
  if (end <= start) end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export function nairobiDateParts(value: Date, timeZone = "Africa/Nairobi") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
  const [year, month, day] = parts.split("-").map(Number);
  return { year, month, day };
}

export function nairobiMorning(base: Date, offsetDays: number, timeZone = "Africa/Nairobi"): Date {
  const { year, month, day } = nairobiDateParts(base, timeZone);
  const morning = new Date(Date.UTC(year, month - 1, day, 6, 0, 0));
  morning.setUTCDate(morning.getUTCDate() + offsetDays);
  return morning;
}

export function formatWhen(value: string | Date | null | undefined, timeZone = "Africa/Nairobi", withTime = false): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-KE", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export function enquiryFlags(input: {
  status: EnquiryStatus;
  ownerId?: string | null;
  nextAction?: string | null;
  nextActionAt?: string | Date | null;
  lastActivityAt?: string | Date | null;
  now: Date;
  staleDays: number;
}): string[] {
  if (!isOpenEnquiry(input.status)) return [];
  const flags: string[] = [];
  if (!input.ownerId) flags.push("No owner");
  if (!input.nextAction || !input.nextActionAt) flags.push("No next action");
  if (input.nextActionAt && new Date(input.nextActionAt).getTime() < input.now.getTime()) flags.push("Overdue follow-up");
  const last = input.lastActivityAt ? new Date(input.lastActivityAt) : null;
  if (last && input.now.getTime() - last.getTime() > input.staleDays * 24 * 60 * 60 * 1000) {
    flags.push(`No activity for ${input.staleDays}+ days`);
  }
  return flags;
}

export type PrepTaskTemplate = { key: string; label: string; offsetDays: number };

export function planPreparationTasks(eventStart: Date, templates: PrepTaskTemplate[], timeZone = "Africa/Nairobi") {
  return templates.map((template) => ({
    ...template,
    dueAt: nairobiMorning(eventStart, template.offsetDays, timeZone),
  }));
}

export const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 } as const;
export type Priority = keyof typeof PRIORITY_RANK;
