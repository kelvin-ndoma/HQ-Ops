export const ENQUIRY_STAGES = [
  "new",
  "contacted",
  "qualified",
  "site_visit",
  "quote_sent",
  "negotiation",
  "deposit_pending",
  "confirmed",
] as const;

export const ENQUIRY_EXITS = ["lost", "cancelled", "postponed"] as const;

export type EnquiryStage = (typeof ENQUIRY_STAGES)[number];
export type EnquiryExit = (typeof ENQUIRY_EXITS)[number];
export type EnquiryStatus = EnquiryStage | EnquiryExit;

export const ENQUIRY_STATUS_LABELS: Record<EnquiryStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  site_visit: "Site Visit",
  quote_sent: "Quote Sent",
  negotiation: "Negotiation",
  deposit_pending: "Deposit Pending",
  confirmed: "Confirmed",
  lost: "Lost",
  cancelled: "Cancelled",
  postponed: "Postponed",
};

export const QUOTE_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "declined",
  "expired",
  "superseded",
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  superseded: "Superseded",
};

export const BOOKING_STATUSES = [
  "tentative",
  "awaiting_deposit",
  "confirmed",
  "completed",
  "cancelled",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  tentative: "Tentative",
  awaiting_deposit: "Awaiting Deposit",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const EVENT_STATUSES = [
  "planning",
  "ready",
  "live",
  "completed",
  "closed",
  "cancelled",
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  planning: "Planning",
  ready: "Ready",
  live: "Live",
  completed: "Completed",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const VISIT_STATUSES = [
  "scheduled",
  "completed",
  "no_show",
  "rescheduled",
  "cancelled",
] as const;

export type VisitStatus = (typeof VISIT_STATUSES)[number];

export const VISIT_OUTCOMES = ["interested", "maybe", "not_suitable"] as const;
export type VisitOutcome = (typeof VISIT_OUTCOMES)[number];

export const TASK_STATUSES = ["todo", "in_progress", "completed", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PROCUREMENT_STATUSES = [
  "requested",
  "approved",
  "rejected",
  "ordered",
  "received",
  "cancelled",
] as const;
export type ProcurementStatus = (typeof PROCUREMENT_STATUSES)[number];

export const VENDOR_ASSIGNMENT_STATUSES = [
  "requested",
  "quoted",
  "confirmed",
  "completed",
  "cancelled",
] as const;
export type VendorAssignmentStatus = (typeof VENDOR_ASSIGNMENT_STATUSES)[number];

export type TransitionResult = { ok: true } | { ok: false; error: string };

const OPEN_ENQUIRY = new Set<EnquiryStatus>(ENQUIRY_STAGES);

export function isOpenEnquiry(status: EnquiryStatus): boolean {
  return OPEN_ENQUIRY.has(status);
}

export function transitionEnquiry(
  from: EnquiryStatus,
  to: EnquiryStatus,
  context: { hasLostReason: boolean; hasConfirmedBooking: boolean },
): TransitionResult {
  if (from === to) return { ok: true };
  if (to === "lost" && !context.hasLostReason) {
    return { ok: false, error: "A lost reason is required before an opportunity can be marked lost." };
  }
  if (to === "confirmed" && !context.hasConfirmedBooking) {
    return {
      ok: false,
      error: "Confirm the booking before moving this opportunity to Confirmed.",
    };
  }
  if ((from === "lost" || from === "cancelled") && (to === "lost" || to === "cancelled")) {
    return { ok: false, error: "Choose an active stage to reopen this opportunity." };
  }
  return { ok: true };
}

const QUOTE_GRAPH: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ["sent"],
  sent: ["viewed", "accepted", "declined", "expired", "superseded"],
  viewed: ["accepted", "declined", "expired", "superseded"],
  accepted: ["superseded"],
  declined: ["superseded"],
  expired: ["superseded"],
  superseded: [],
};

export function transitionQuote(from: QuoteStatus, to: QuoteStatus): TransitionResult {
  if (from === to) return { ok: true };
  if (!QUOTE_GRAPH[from].includes(to)) {
    return { ok: false, error: `A quotation cannot move from ${QUOTE_STATUS_LABELS[from]} to ${QUOTE_STATUS_LABELS[to]}.` };
  }
  return { ok: true };
}

export function quotationEditMode(status: QuoteStatus): "update_draft" | "new_version" {
  return status === "draft" ? "update_draft" : "new_version";
}

const BOOKING_GRAPH: Record<BookingStatus, BookingStatus[]> = {
  tentative: ["awaiting_deposit", "confirmed", "cancelled"],
  awaiting_deposit: ["confirmed", "tentative", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function transitionBooking(from: BookingStatus, to: BookingStatus): TransitionResult {
  if (from === to) return { ok: true };
  if (!BOOKING_GRAPH[from].includes(to)) {
    return { ok: false, error: `A booking cannot move from ${BOOKING_STATUS_LABELS[from]} to ${BOOKING_STATUS_LABELS[to]}.` };
  }
  return { ok: true };
}

const EVENT_GRAPH: Record<EventStatus, EventStatus[]> = {
  planning: ["ready", "live", "cancelled"],
  ready: ["planning", "live", "cancelled"],
  live: ["completed", "cancelled"],
  completed: ["closed"],
  closed: [],
  cancelled: [],
};

export function transitionEvent(from: EventStatus, to: EventStatus): TransitionResult {
  if (from === to) return { ok: true };
  if (!EVENT_GRAPH[from].includes(to)) {
    return { ok: false, error: `An event cannot move from ${EVENT_STATUS_LABELS[from]} to ${EVENT_STATUS_LABELS[to]}.` };
  }
  return { ok: true };
}

const VISIT_GRAPH: Record<VisitStatus, VisitStatus[]> = {
  scheduled: ["completed", "no_show", "rescheduled", "cancelled"],
  rescheduled: ["scheduled", "cancelled"],
  completed: [],
  no_show: [],
  cancelled: [],
};

export function transitionVisit(
  from: VisitStatus,
  to: VisitStatus,
  context?: { hasOutcome?: boolean },
): TransitionResult {
  if (from === to) return { ok: true };
  if (!VISIT_GRAPH[from].includes(to)) {
    return { ok: false, error: "That site visit status change is not allowed." };
  }
  if (to === "completed" && !context?.hasOutcome) {
    return { ok: false, error: "Record whether the client was interested, unsure, or the venue was not suitable." };
  }
  return { ok: true };
}

const TASK_GRAPH: Record<TaskStatus, TaskStatus[]> = {
  todo: ["in_progress", "completed", "cancelled"],
  in_progress: ["todo", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function transitionTask(from: TaskStatus, to: TaskStatus): TransitionResult {
  if (from === to) return { ok: true };
  if (!TASK_GRAPH[from].includes(to)) {
    return { ok: false, error: "That task status change is not allowed." };
  }
  return { ok: true };
}

const PROCUREMENT_GRAPH: Record<ProcurementStatus, ProcurementStatus[]> = {
  requested: ["approved", "rejected", "cancelled"],
  approved: ["ordered", "cancelled"],
  ordered: ["received", "cancelled"],
  received: [],
  rejected: [],
  cancelled: [],
};

export function transitionProcurement(from: ProcurementStatus, to: ProcurementStatus): TransitionResult {
  if (from === to) return { ok: true };
  if (!PROCUREMENT_GRAPH[from].includes(to)) {
    return { ok: false, error: "That procurement status change is not allowed." };
  }
  return { ok: true };
}

const VENDOR_GRAPH: Record<VendorAssignmentStatus, VendorAssignmentStatus[]> = {
  requested: ["quoted", "confirmed", "cancelled"],
  quoted: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function transitionVendorAssignment(
  from: VendorAssignmentStatus,
  to: VendorAssignmentStatus,
): TransitionResult {
  if (from === to) return { ok: true };
  if (!VENDOR_GRAPH[from].includes(to)) {
    return { ok: false, error: "That vendor status change is not allowed." };
  }
  return { ok: true };
}

export function blocksCalendar(status: BookingStatus, holdExpiresAt: Date | null, now: Date): boolean {
  if (status === "confirmed" || status === "awaiting_deposit") return true;
  if (status === "tentative") return !holdExpiresAt || holdExpiresAt > now;
  return false;
}
