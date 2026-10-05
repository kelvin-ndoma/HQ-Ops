import { describe, expect, it } from "vitest";
import { aboveThreshold, discountNeedsApproval, priceBelowMinimum } from "./approvals";
import { can } from "./permissions";
import { holdShouldRelease, spaceReserved } from "./states";
import { DEFAULT_COMMERCIAL } from "./settings";

const now = new Date("2026-10-05T12:00:00Z");

describe("venue hold is separate from commercial status", () => {
  it("keeps an awaiting-deposit booking from blocking a space after the hold expires", () => {
    const expired = spaceReserved(
      { status: "awaiting_deposit", holdExpiresAt: "2026-10-04T12:00:00Z", holdReleasedAt: null },
      now,
    );
    expect(expired).toBe(false);
    expect(holdShouldRelease({ status: "awaiting_deposit", holdExpiresAt: "2026-10-04T12:00:00Z" }, now)).toBe(true);
  });

  it("reserves the space while the hold is still active", () => {
    expect(spaceReserved({ status: "awaiting_deposit", holdExpiresAt: "2026-10-06T12:00:00Z" }, now)).toBe(true);
    expect(spaceReserved({ status: "tentative", holdExpiresAt: "2026-10-06T12:00:00Z" }, now)).toBe(true);
  });

  it("does not reserve a deposit-pending booking that never received a hold window", () => {
    expect(spaceReserved({ status: "awaiting_deposit", holdExpiresAt: null }, now)).toBe(false);
    expect(holdShouldRelease({ status: "awaiting_deposit", holdExpiresAt: null }, now)).toBe(true);
  });

  it("keeps confirmed bookings reserved after any hold date", () => {
    expect(spaceReserved({ status: "confirmed", holdExpiresAt: "2026-01-01T00:00:00Z", holdReleasedAt: now }, now)).toBe(true);
  });

  it("stops reserving once the hold is released, without changing the commercial status", () => {
    expect(spaceReserved({ status: "awaiting_deposit", holdExpiresAt: "2026-10-09T12:00:00Z", holdReleasedAt: now }, now)).toBe(false);
    expect(spaceReserved({ status: "cancelled", holdExpiresAt: "2026-10-09T12:00:00Z" }, now)).toBe(false);
  });
});

describe("approval gates stay off until a threshold is configured", () => {
  it("does not require approval when thresholds are unset", () => {
    expect(aboveThreshold(5_000_000, DEFAULT_COMMERCIAL.approvals.refundCents)).toBe(false);
    expect(discountNeedsApproval(40, DEFAULT_COMMERCIAL.approvals)).toBe(false);
    expect(priceBelowMinimum(100, DEFAULT_COMMERCIAL.approvals)).toBe(false);
  });

  it("requires approval only above a configured development threshold", () => {
    const thresholds = { ...DEFAULT_COMMERCIAL.approvals, maxDiscountPercent: 10, refundCents: 1_000_000, minimumUnitPriceCents: 50000 };
    expect(discountNeedsApproval(10, thresholds)).toBe(false);
    expect(discountNeedsApproval(10.1, thresholds)).toBe(true);
    expect(aboveThreshold(1_000_000, thresholds.refundCents)).toBe(false);
    expect(aboveThreshold(1_000_001, thresholds.refundCents)).toBe(true);
    expect(priceBelowMinimum(50000, thresholds)).toBe(false);
    expect(priceBelowMinimum(49999, thresholds)).toBe(true);
  });
});

describe("event and settings permissions", () => {
  it("lets sales see events without operational or financial write access", () => {
    expect(can("sales_coordinator", "events.read")).toBe(true);
    expect(can("sales_coordinator", "events.write")).toBe(false);
    expect(can("sales_coordinator", "events.closeout")).toBe(false);
    expect(can("sales_coordinator", "inventory.move")).toBe(false);
    expect(can("sales_coordinator", "vendors.write")).toBe(false);
    expect(can("sales_coordinator", "costs.write")).toBe(false);
    expect(can("sales_coordinator", "procurement.write")).toBe(false);
    expect(can("sales_coordinator", "bookings.extend_hold")).toBe(false);
    expect(can("sales_coordinator", "bookings.request_hold")).toBe(true);
    expect(can("operations_lead", "bookings.extend_hold")).toBe(true);
    expect(can("operations_lead", "bookings.request_hold")).toBe(false);
    expect(can("leadership", "bookings.extend_hold")).toBe(true);
    expect(can("leadership", "bookings.request_hold")).toBe(false);
    expect(can("leadership", "approvals.review")).toBe(true);
    expect(can("operations_lead", "approvals.review_operations")).toBe(true);
    expect(can("event_staff", "bookings.extend_hold")).toBe(false);
    expect(can("event_staff", "bookings.request_hold")).toBe(false);
    expect(can("finance", "approvals.review_operations")).toBe(false);
  });

  it("splits settings between operations, commercial control, and system administration", () => {
    expect(can("operations_lead", "settings.operations")).toBe(true);
    expect(can("operations_lead", "settings.commercial")).toBe(false);
    expect(can("operations_lead", "settings.system")).toBe(false);
    expect(can("leadership", "settings.commercial")).toBe(true);
    expect(can("leadership", "settings.operations")).toBe(false);
    expect(can("leadership", "settings.system")).toBe(false);
    expect(can("leadership", "users.manage")).toBe(false);
    expect(can("administrator", "settings.system")).toBe(true);
    expect(can("administrator", "settings.commercial")).toBe(true);
    expect(can("administrator", "settings.operations")).toBe(false);
    expect(can("administrator", "users.manage")).toBe(true);
    expect(can("super_admin", "settings.system")).toBe(true);
    expect(can("super_admin", "settings.operations")).toBe(true);
  });
});
