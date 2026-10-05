import { describe, expect, it } from "vitest";
import { eventContribution, priceQuotation, requiredDeposit, summarizePayments } from "./money";
import { applyStockMovement, availableOf, enquiryFlags, formatReference, normalizePhone, planPreparationTasks, rangesOverlap } from "./operations";
import { can } from "./permissions";
import { quotationEditMode, transitionEnquiry, transitionQuote } from "./states";

describe("permissions", () => {
  it("keeps financial writes with finance and leadership, not event staff or administrators", () => {
    expect(can("finance", "payments.write")).toBe(true);
    expect(can("leadership", "payments.write")).toBe(true);
    expect(can("leadership", "reports.finance")).toBe(true);
    expect(can("event_staff", "payments.write")).toBe(false);
    expect(can("event_staff", "quotes.read")).toBe(false);
    expect(can("sales_coordinator", "payments.write")).toBe(false);
    expect(can("administrator", "users.manage")).toBe(true);
    expect(can("administrator", "payments.write")).toBe(false);
    expect(can("leadership", "users.manage")).toBe(false);
    expect(can("super_admin", "users.manage")).toBe(true);
    expect(can("super_admin", "payments.write")).toBe(true);
    expect(can("super_admin", "settings.commercial")).toBe(true);
    expect(can("operations_lead", "inventory.override")).toBe(true);
    expect(can("sales_coordinator", "bookings.override_deposit")).toBe(false);
  });
});

describe("enquiry transitions", () => {
  it("requires a lost reason", () => {
    const result = transitionEnquiry("negotiation", "lost", { hasLostReason: false, hasConfirmedBooking: false });
    expect(result.ok).toBe(false);
  });

  it("allows lost when a reason is present", () => {
    const result = transitionEnquiry("negotiation", "lost", { hasLostReason: true, hasConfirmedBooking: false });
    expect(result.ok).toBe(true);
  });

  it("refuses confirmed without a confirmed booking", () => {
    const result = transitionEnquiry("deposit_pending", "confirmed", { hasLostReason: false, hasConfirmedBooking: false });
    expect(result.ok).toBe(false);
  });
});

describe("quotations", () => {
  it("prices lines, tax, and header discount without mutating inputs", () => {
    const priced = priceQuotation(
      [
        { description: "Venue hire", quantity: 1, unitPriceCents: 18_000_000, taxRate: 0, discountCents: 0 },
        { description: "Additional hours", quantity: 2, unitPriceCents: 1_500_000, taxRate: 0.16, discountCents: 0 },
      ],
      500_000,
    );
    expect(priced.subtotalCents).toBe(21_000_000);
    expect(priced.taxCents).toBe(480_000);
    expect(priced.totalCents).toBe(20_980_000);
  });

  it("forces a new version once a quote has left draft", () => {
    expect(quotationEditMode("draft")).toBe("update_draft");
    expect(quotationEditMode("sent")).toBe("new_version");
    expect(transitionQuote("sent", "draft").ok).toBe(false);
    expect(transitionQuote("sent", "accepted").ok).toBe(true);
  });
});

describe("deposits and payments", () => {
  it("does not invent a deposit percentage", () => {
    expect(requiredDeposit(100_000_00, { mode: "none", percent: null, fixedCents: null })).toBe(0);
    expect(requiredDeposit(100_000_00, { mode: "percent", percent: null, fixedCents: null })).toBe(0);
    expect(requiredDeposit(100_000_00, { mode: "percent", percent: 40, fixedCents: null })).toBe(40_000_00);
  });

  it("summarises collections and contribution", () => {
    const summary = summarizePayments(
      [
        { type: "deposit", amountCents: 40_000_00 },
        { type: "balance", amountCents: 50_000_00 },
        { type: "refund", amountCents: 5_000_00 },
      ],
      100_000_00,
    );
    expect(summary.netCents).toBe(85_000_00);
    expect(summary.outstandingCents).toBe(15_000_00);
    expect(summary.financialStatus).toBe("partially_paid");
    const contribution = eventContribution(100_000_00, 35_000_00);
    expect(contribution.grossContributionCents).toBe(65_000_00);
    expect(contribution.margin).toBeCloseTo(0.65);
  });
});

describe("inventory", () => {
  const base = { onHand: 70, reserved: 0, checkedOut: 0 };

  it("rejects reservations above available stock", () => {
    const result = applyStockMovement(base, { type: "reserve", qty: 80 });
    expect(result.ok).toBe(false);
  });

  it("allows an explicit override and keeps issued stock reconcilable", () => {
    const reserved = applyStockMovement(base, { type: "reserve", qty: 80 }, true);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    expect(availableOf(reserved.state)).toBe(-10);
    const issued = applyStockMovement(reserved.state, { type: "event_issue", qty: 70 });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const returned = applyStockMovement(issued.state, { type: "event_return", qty: 68 });
    expect(returned.ok).toBe(true);
    if (!returned.ok) return;
    const damaged = applyStockMovement(returned.state, { type: "damage", qty: 2, from: "checked_out" });
    expect(damaged.ok).toBe(true);
    if (!damaged.ok) return;
    expect(damaged.state.checkedOut).toBe(0);
    expect(damaged.state.onHand).toBe(68);
    expect(availableOf(damaged.state)).toBe(58);
  });
});

describe("calendar and follow-up hygiene", () => {
  it("detects overlapping ranges", () => {
    const start = new Date("2026-10-12T06:00:00Z");
    const end = new Date("2026-10-12T15:00:00Z");
    expect(rangesOverlap(start, end, new Date("2026-10-12T14:00:00Z"), new Date("2026-10-12T18:00:00Z"))).toBe(true);
    expect(rangesOverlap(start, end, end, new Date("2026-10-12T18:00:00Z"))).toBe(false);
  });

  it("flags forgotten enquiries", () => {
    const flags = enquiryFlags({
      status: "contacted",
      ownerId: null,
      nextAction: "",
      nextActionAt: null,
      lastActivityAt: new Date("2026-09-01"),
      now: new Date("2026-10-05"),
      staleDays: 7,
    });
    expect(flags).toContain("No owner");
    expect(flags).toContain("No next action");
    expect(flags.some((flag) => flag.includes("No activity"))).toBe(true);
  });

  it("places preparation tasks relative to the event date", () => {
    const tasks = planPreparationTasks(new Date("2026-10-20T06:00:00Z"), [
      { key: "vendors", label: "Confirm vendors", offsetDays: -7 },
    ]);
    expect(tasks[0].dueAt.toISOString()).toBe("2026-10-13T06:00:00.000Z");
  });

  it("normalises Kenyan numbers and reference sequences", () => {
    expect(normalizePhone("0712 345 678")).toBe("254712345678");
    expect(formatReference("ENQ", 2026, 42)).toBe("ENQ-2026-0042");
  });
});
