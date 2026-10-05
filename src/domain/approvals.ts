import type { ApprovalThresholds } from "./settings";

export const APPROVAL_ACTIONS = [
  "discount_threshold",
  "confirm_without_deposit",
  "inventory_writeoff",
  "refund",
  "procurement_threshold",
  "quote_below_minimum",
  "hold_extension",
] as const;

export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export const APPROVAL_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const COMMERCIAL_APPROVALS = new Set<ApprovalAction>([
  "discount_threshold",
  "confirm_without_deposit",
  "refund",
  "quote_below_minimum",
]);

export const OPERATIONAL_APPROVALS = new Set<ApprovalAction>(["inventory_writeoff", "procurement_threshold", "hold_extension"]);

export function aboveThreshold(amount: number, threshold: number | null | undefined): boolean {
  if (threshold == null) return false;
  return amount > threshold;
}

export function discountNeedsApproval(discountPercent: number, thresholds: ApprovalThresholds): boolean {
  if (thresholds.maxDiscountPercent == null) return false;
  return discountPercent > thresholds.maxDiscountPercent;
}

export function priceBelowMinimum(unitPriceCents: number, thresholds: ApprovalThresholds): boolean {
  if (thresholds.minimumUnitPriceCents == null) return false;
  return unitPriceCents < thresholds.minimumUnitPriceCents;
}

export function quotationDiscountPercent(grossCents: number, discountCents: number): number {
  if (grossCents <= 0) return 0;
  return (discountCents / grossCents) * 100;
}
