import { combineNairobi } from "../domain/operations";

export function sid(value: unknown): string {
  if (!value) return "";
  return String(value);
}

export function asDate(value?: string | null) {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return combineNairobi(value, "09:00");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

export function shillings(value?: number | null) {
  if (value == null || Number.isNaN(value)) return undefined;
  return Math.round(value * 100);
}
