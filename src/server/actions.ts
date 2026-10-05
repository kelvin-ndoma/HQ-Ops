"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { can } from "../domain/permissions";
import {
  bookingSchema,
  cancelBookingSchema,
  clientSchema,
  confirmBookingSchema,
  costSchema,
  enquirySchema,
  enquiryUpdateSchema,
  eventVendorSchema,
  noteSchema,
  paymentSchema,
  procurementSchema,
  procurementTransitionSchema,
  proposalAcceptSchema,
  proposalDeclineSchema,
  proposalTermSchema,
  quoteReviseSchema,
  quoteSchema,
  quoteStatusSchema,
  sendProposalSchema,
  reservationSchema,
  stageSchema,
  stockMoveSchema,
  taskSchema,
  vendorSchema,
  visitOutcomeSchema,
  visitSchema,
} from "../domain/schemas";
import { requirePermission, requireUser } from "./guard";
import { actionError, type ActionResult } from "./errors";
import { createEnquiry, createClient, createVisit, transitionEnquiryStage, updateEnquiry, updateVisit, addNote, saveCatalog } from "./services/crm";
import { EventType, InventoryCategory, LeadSource, LostReason, PaymentMethod, ServiceItem, Space, VendorCategory } from "./models";
import { cancelBooking, confirmBooking, createBooking, createQuotation, extendHold, recordPaymentAndMaybeConfirm, requestHoldExtension, reviseQuotation, setQuotationStatus } from "./services/commercial";
import { addEventCost, assignVendor, createProcurement, createTask, createVendor, setProcurementStatus, setTaskStatus, setVendorAssignment, toggleCloseout, updateEvent } from "./services/events";
import { createItem, issueReserved, moveStock, reserveForEvent, returnIssued } from "./services/inventory";
import { saveSetting, getCommercial, getOrganization, getAutomation, getNotificationSettings, getAssignment } from "./settings";
import type { EventStatus, ProcurementStatus, QuoteStatus, TaskStatus, VendorAssignmentStatus } from "../domain/states";
import { Notification } from "./models";

function fail(error: unknown): ActionResult<never> {
  unstable_rethrow(error);
  if (error instanceof ZodError) return { ok: false, error: error.issues[0]?.message || "Check the form." };
  return actionError(error);
}

function done<T>(data?: T): ActionResult<T> {
  return { ok: true, data };
}

export async function createEnquiryAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  try {
    requirePermission(user, "enquiries.write");
    const id = await createEnquiry(user, enquirySchema.parse(input));
    revalidatePath("/enquiries");
    revalidatePath("/pipeline");
    revalidatePath("/");
    return done({ id });
  } catch (error) {
    return fail(error);
  }
}

export async function updateEnquiryAction(input: unknown) {
  const user = await requireUser();
  try {
    requirePermission(user, "enquiries.write");
    const parsed = enquiryUpdateSchema.parse(input);
    const { id, ...patch } = parsed;
    await updateEnquiry(user, id, patch);
    revalidatePath(`/enquiries/${id}`);
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function transitionEnquiryAction(input: unknown) {
  const user = await requireUser();
  try {
    requirePermission(user, "enquiries.transition");
    const parsed = stageSchema.parse(input);
    await transitionEnquiryStage(user, parsed.id, parsed.stage, parsed);
    revalidatePath("/pipeline");
    revalidatePath(`/enquiries/${parsed.id}`);
    revalidatePath("/");
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function createClientAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  try {
    requirePermission(user, "clients.write");
    const id = await createClient(user, clientSchema.parse(input));
    revalidatePath("/clients");
    return done({ id });
  } catch (error) {
    return fail(error);
  }
}

export async function createVisitAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  try {
    requirePermission(user, "visits.write");
    const parsed = visitSchema.parse(input);
    const id = await createVisit(user, parsed);
    revalidatePath("/site-visits");
    revalidatePath(`/enquiries/${parsed.enquiryId}`);
    return done({ id });
  } catch (error) {
    return fail(error);
  }
}

export async function updateVisitAction(input: unknown) {
  const user = await requireUser();
  try {
    requirePermission(user, "visits.write");
    const parsed = visitOutcomeSchema.parse(input);
    await updateVisit(user, parsed.id, parsed);
    revalidatePath(`/site-visits/${parsed.id}`);
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function addNoteAction(input: unknown) {
  const user = await requireUser();
  try {
    const parsed = noteSchema.parse(input);
    await addNote(user, parsed.entityType, parsed.entityId, parsed.body);
    revalidatePath("/");
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function createQuoteAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  try {
    requirePermission(user, "quotes.write");
    const id = await createQuotation(user, quoteSchema.parse(input));
    revalidatePath("/quotations");
    return done({ id });
  } catch (error) {
    return fail(error);
  }
}

export async function reviseQuoteAction(input: unknown) {
  const user = await requireUser();
  try {
    requirePermission(user, "quotes.write");
    const parsed = quoteReviseSchema.parse(input);
    await reviseQuotation(user, parsed.quotationId, parsed, parsed.reason);
    revalidatePath(`/quotations/${parsed.quotationId}`);
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function quoteStatusAction(input: unknown) {
  const user = await requireUser();
  try {
    const parsed = quoteStatusSchema.parse(input);
    if (parsed.status === "sent") requirePermission(user, "quotes.send");
    else requirePermission(user, "quotes.write");
    await setQuotationStatus(user, parsed.id, parsed.status as QuoteStatus, parsed.reason || undefined);
    revalidatePath(`/quotations/${parsed.id}`);
    revalidatePath("/");
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function sendProposalAction(input: unknown) {
  const user = await requireUser();
  try {
    requirePermission(user, "quotes.send");
    const parsed = sendProposalSchema.parse(input);
    const { sendProposal } = await import("./services/proposal");
    const result = await sendProposal(user, parsed.id, parsed.message);
    revalidatePath(`/quotations/${parsed.id}`);
    return done(result);
  } catch (error) {
    return fail(error);
  }
}

export async function acceptProposalAction(input: unknown) {
  try {
    const parsed = proposalAcceptSchema.parse(input);
    const { acceptProposal } = await import("./services/proposal");
    await acceptProposal(parsed.token, parsed.name);
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function declineProposalAction(input: unknown) {
  try {
    const parsed = proposalDeclineSchema.parse(input);
    const { declineProposal } = await import("./services/proposal");
    await declineProposal(parsed.token, parsed.reason || undefined);
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function saveProposalTermAction(input: unknown) {
  const user = await requireUser();
  try {
    requirePermission(user, "settings.commercial");
    const parsed = proposalTermSchema.parse(input);
    const { saveProposalTerm } = await import("./services/proposal");
    await saveProposalTerm(user, parsed);
    revalidatePath("/settings");
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function createBookingAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  try {
    requirePermission(user, "bookings.write");
    const id = await createBooking(user, bookingSchema.parse(input));
    revalidatePath("/bookings");
    revalidatePath("/calendar");
    revalidatePath("/");
    return done({ id });
  } catch (error) {
    return fail(error);
  }
}

export async function confirmBookingAction(input: unknown) {
  const user = await requireUser();
  try {
    requirePermission(user, "bookings.confirm");
    const parsed = confirmBookingSchema.parse(input);
    const result = await confirmBooking(user, parsed.id, { overrideDeposit: parsed.overrideDeposit, reason: parsed.reason });
    revalidatePath(`/bookings/${parsed.id}`);
    revalidatePath("/events");
    revalidatePath("/");
    return done(result);
  } catch (error) {
    return fail(error);
  }
}

export async function extendHoldAction(id: string, reason: string) {
  const user = await requireUser();
  try {
    requirePermission(user, "bookings.extend_hold");
    await extendHold(user, id, reason);
    revalidatePath(`/bookings/${id}`);
    revalidatePath("/calendar");
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function requestHoldExtensionAction(id: string, reason: string, proposedExpiry: string) {
  const user = await requireUser();
  try {
    requirePermission(user, "bookings.request_hold");
    await requestHoldExtension(user, id, reason, proposedExpiry);
    revalidatePath(`/bookings/${id}`);
    revalidatePath("/approvals");
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function reviewApprovalAction(id: string, decision: "approved" | "rejected", notes: string) {
  const user = await requireUser();
  try {
    const { reviewApproval } = await import("./services/approvals");
    await reviewApproval(user, id, decision, notes);
    revalidatePath("/approvals");
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function cancelBookingAction(input: unknown) {
  const user = await requireUser();
  try {
    requirePermission(user, "bookings.cancel");
    const parsed = cancelBookingSchema.parse(input);
    await cancelBooking(user, parsed.id, parsed.reason);
    revalidatePath(`/bookings/${parsed.id}`);
    revalidatePath("/calendar");
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function recordPaymentAction(input: unknown) {
  const user = await requireUser();
  try {
    requirePermission(user, "payments.write");
    const parsed = paymentSchema.parse(input);
    await recordPaymentAndMaybeConfirm(user, {
      clientId: parsed.clientId,
      bookingId: parsed.bookingId,
      type: parsed.type,
      amountCents: Math.round(parsed.amountShillings * 100),
      methodId: parsed.methodId,
      paidAt: new Date(parsed.paidAt),
      reference: parsed.reference,
      notes: parsed.notes,
      idempotencyKey: parsed.idempotencyKey,
    });
    revalidatePath("/payments");
    revalidatePath(`/bookings/${parsed.bookingId}`);
    revalidatePath("/");
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function createTaskAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  try {
    requirePermission(user, "tasks.write");
    const parsed = taskSchema.parse(input);
    const id = await createTask(user, { ...parsed, dueAt: parsed.dueAt ? new Date(parsed.dueAt) : undefined, description: parsed.description, relatedId: parsed.relatedId });
    revalidatePath("/tasks");
    return done({ id });
  } catch (error) {
    return fail(error);
  }
}

export async function setTaskStatusAction(id: string, status: TaskStatus) {
  const user = await requireUser();
  try {
    requirePermission(user, "tasks.write");
    await setTaskStatus(user, id, status);
    revalidatePath("/tasks");
    revalidatePath("/");
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function createVendorAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  try {
    requirePermission(user, "vendors.write");
    const id = await createVendor(user, vendorSchema.parse(input));
    revalidatePath("/vendors");
    return done({ id });
  } catch (error) {
    return fail(error);
  }
}

export async function assignVendorAction(input: unknown) {
  const user = await requireUser();
  try {
    requirePermission(user, "vendors.write");
    const parsed = eventVendorSchema.parse(input);
    await assignVendor(user, {
      ...parsed,
      quotedCostCents: parsed.quotedShillings != null ? Math.round(parsed.quotedShillings * 100) : 0,
      agreedCostCents: parsed.agreedShillings != null ? Math.round(parsed.agreedShillings * 100) : 0,
    });
    revalidatePath(`/events/${parsed.eventId}`);
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function vendorStatusAction(id: string, status: VendorAssignmentStatus, agreedShillings?: number) {
  const user = await requireUser();
  try {
    requirePermission(user, "vendors.write");
    await setVendorAssignment(user, id, status, agreedShillings != null ? { agreedCostCents: Math.round(agreedShillings * 100) } : undefined);
    revalidatePath("/events");
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function createProcurementAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  try {
    requirePermission(user, "procurement.write");
    const parsed = procurementSchema.parse(input);
    const id = await createProcurement(user, {
      ...parsed,
      estimatedCostCents: parsed.estimatedShillings != null ? Math.round(parsed.estimatedShillings * 100) : 0,
      vendorId: parsed.vendorId || undefined,
      eventId: parsed.eventId || undefined,
    });
    revalidatePath("/procurement");
    return done({ id });
  } catch (error) {
    return fail(error);
  }
}

export async function procurementStatusAction(input: unknown) {
  const user = await requireUser();
  try {
    const parsed = procurementTransitionSchema.parse(input);
    if (parsed.status === "approved" || parsed.status === "rejected") requirePermission(user, "procurement.approve");
    else requirePermission(user, "procurement.write");
    await setProcurementStatus(user, parsed.id, parsed.status as ProcurementStatus, parsed.note, parsed.finalShillings != null ? Math.round(parsed.finalShillings * 100) : undefined);
    revalidatePath("/procurement");
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function addCostAction(input: unknown) {
  const user = await requireUser();
  try {
    requirePermission(user, "costs.write");
    const parsed = costSchema.parse(input);
    await addEventCost(user, {
      eventId: parsed.eventId,
      category: parsed.category,
      description: parsed.description,
      amountCents: Math.round(parsed.amountShillings * 100),
      vendorId: parsed.vendorId || undefined,
    });
    revalidatePath("/event-costs");
    revalidatePath(`/events/${parsed.eventId}`);
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function stockMoveAction(input: unknown) {
  const user = await requireUser();
  try {
    requirePermission(user, "inventory.move");
    const parsed = stockMoveSchema.parse(input);
    if (parsed.override) requirePermission(user, "inventory.override");
    await moveStock(user, { ...parsed, eventId: parsed.eventId || undefined });
    revalidatePath("/inventory");
    revalidatePath(`/inventory/${parsed.itemId}`);
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function reserveAction(input: unknown) {
  const user = await requireUser();
  try {
    requirePermission(user, "inventory.move");
    const parsed = reservationSchema.parse(input);
    if (parsed.override) requirePermission(user, "inventory.override");
    await reserveForEvent(user, parsed);
    revalidatePath(`/events/${parsed.eventId}`);
    revalidatePath("/inventory");
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function issueAction(reservationId: string, quantity: number) {
  const user = await requireUser();
  try {
    requirePermission(user, "inventory.move");
    await issueReserved(user, reservationId, quantity);
    revalidatePath("/inventory");
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function returnAction(reservationId: string, quantity: number, damaged: number, lost: number) {
  const user = await requireUser();
  try {
    requirePermission(user, "inventory.move");
    await returnIssued(user, reservationId, quantity, damaged, lost);
    revalidatePath("/inventory");
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function createItemAction(input: {
  name: string;
  sku: string;
  categoryId: string;
  assetType: "durable" | "consumable";
  quantity: number;
  reorderLevel: number;
  unitCostShillings: number;
  location?: string;
}) {
  const user = await requireUser();
  try {
    requirePermission(user, "inventory.write");
    const id = await createItem(user, { ...input, unitCostCents: Math.round(input.unitCostShillings * 100) });
    revalidatePath("/inventory");
    return done({ id });
  } catch (error) {
    return fail(error);
  }
}

export async function eventStatusAction(id: string, status: EventStatus) {
  const user = await requireUser();
  try {
    requirePermission(user, "events.write");
    await updateEvent(user, id, { status });
    revalidatePath(`/events/${id}`);
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function closeoutAction(eventId: string, key: string, doneValue: boolean) {
  const user = await requireUser();
  try {
    requirePermission(user, "events.closeout");
    await toggleCloseout(user, eventId, key, doneValue);
    revalidatePath(`/events/${eventId}`);
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function saveRequirementsAction(eventId: string, requirements: { label: string; value: string }[], notes: string) {
  const user = await requireUser();
  try {
    requirePermission(user, "events.write");
    await updateEvent(user, eventId, { requirements, notes });
    revalidatePath(`/events/${eventId}`);
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function saveCommercialAction(input: {
  quotationValidityDays: number;
  taxEnabled: boolean;
  defaultTaxRate: number;
  defaultTerms: string;
  holdDurationHours: number;
  staleEnquiryDays: number;
  depositMode: "percent" | "fixed" | "none";
  depositPercent: number | null;
  depositFixedShillings: number | null;
  maxDiscountPercent: number | null;
  inventoryWriteOffShillings: number | null;
  procurementShillings: number | null;
  minimumUnitPriceShillings: number | null;
  refundShillings: number | null;
}) {
  const user = await requireUser();
  try {
    requirePermission(user, "settings.commercial");
    const previous = await getCommercial();
    const cents = (shillings: number | null) => (shillings == null ? null : Math.round(shillings * 100));
    await saveSetting(user.id, "commercial", {
      quotationValidityDays: input.quotationValidityDays,
      taxEnabled: input.taxEnabled,
      defaultTaxRate: input.defaultTaxRate,
      defaultTerms: input.defaultTerms,
      holdDurationHours: input.holdDurationHours,
      staleEnquiryDays: input.staleEnquiryDays,
      deposit: {
        mode: input.depositMode,
        percent: input.depositPercent,
        fixedCents: input.depositFixedShillings == null ? null : Math.round(input.depositFixedShillings * 100),
      },
      approvals: {
        maxDiscountPercent: input.maxDiscountPercent,
        inventoryWriteOffCents: cents(input.inventoryWriteOffShillings),
        procurementCents: cents(input.procurementShillings),
        minimumUnitPriceCents: cents(input.minimumUnitPriceShillings),
        refundCents: cents(input.refundShillings),
      },
    }, previous);
    revalidatePath("/settings");
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function saveOrganizationAction(input: { name: string; legalName: string; address: string; city: string; phone: string; email: string; website: string }) {
  const user = await requireUser();
  try {
    requirePermission(user, "settings.system");
    const previous = await getOrganization();
    await saveSetting(user.id, "organization", { ...previous, ...input, currency: "KES", timezone: "Africa/Nairobi" }, previous);
    revalidatePath("/settings");
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function saveAutomationAction(input: {
  newEnquiryFollowUpHours: number;
  visitReminderHours: number;
  postVisitFollowUpHours: number;
  quoteFollowUpDays: number;
  quoteInactivityDays: number;
  depositFollowUpDays: number;
}) {
  const user = await requireUser();
  try {
    requirePermission(user, "settings.operations");
    const previous = await getAutomation();
    await saveSetting(user.id, "automation", { ...previous, ...input }, previous);
    revalidatePath("/settings");
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function saveNotificationPrefsAction(input: { inApp: boolean; emailEnabled: boolean; whatsappEnabled: boolean }) {
  const user = await requireUser();
  try {
    requirePermission(user, "settings.system");
    const previous = await getNotificationSettings();
    await saveSetting(user.id, "notifications", input, previous);
    revalidatePath("/settings");
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function saveAssignmentAction(defaultOwnerId: string) {
  const user = await requireUser();
  try {
    requirePermission(user, "settings.operations");
    const previous = await getAssignment();
    await saveSetting(user.id, "assignment", { defaultOwnerId: defaultOwnerId || null }, previous);
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function saveCatalogAction(kind: "event-type" | "source" | "lost-reason" | "inventory-category" | "vendor-category" | "payment-method" | "space" | "service", input: { id?: string; name: string; description?: string; active?: boolean; capacity?: number; unitPriceShillings?: number; unit?: string; category?: string; taxBehavior?: string }) {
  const user = await requireUser();
  try {
    const operational = new Set(["event-type", "inventory-category", "vendor-category", "space"]);
    const commercial = new Set(["source", "lost-reason", "payment-method", "service"]);
    if (operational.has(kind)) requirePermission(user, "settings.operations");
    else if (commercial.has(kind)) requirePermission(user, "settings.commercial");
    else requirePermission(user, "settings.system");
    const map = {
      "event-type": EventType,
      source: LeadSource,
      "lost-reason": LostReason,
      "inventory-category": InventoryCategory,
      "vendor-category": VendorCategory,
      "payment-method": PaymentMethod,
    } as const;
    if (kind === "space") {
      await saveCatalog(user, Space, "space", {
        ...input,
        extra: input.capacity ? { capacity: input.capacity } : undefined,
      });
    } else if (kind === "service") {
      if (input.id) {
        const item = await ServiceItem.findById(input.id);
        if (!item) return { ok: false, error: "Service not found." };
        const previous = { unitPriceCents: item.unitPriceCents, name: item.name };
        item.name = input.name;
        if (input.description !== undefined) item.description = input.description;
        if (input.category) item.category = input.category;
        if (input.unit) item.unit = input.unit;
        if (input.taxBehavior === "exempt" || input.taxBehavior === "default") item.taxBehavior = input.taxBehavior;
        if (input.unitPriceShillings != null) item.unitPriceCents = Math.round(input.unitPriceShillings * 100);
        if (input.active !== undefined) item.active = input.active;
        await item.save();
        const { recordAudit } = await import("./audit");
        await recordAudit({ actorId: user.id, action: "service.update", entityType: "service", entityId: input.id, previousValue: previous, newValue: { name: item.name, unitPriceCents: item.unitPriceCents } });
      } else {
        await ServiceItem.create({
          name: input.name,
          code: input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) + "-" + Date.now().toString(36),
          unitPriceCents: Math.round((input.unitPriceShillings || 0) * 100),
          unit: input.unit || "item",
          category: input.category || "Other",
          description: input.description || "",
          taxBehavior: input.taxBehavior === "exempt" ? "exempt" : "default",
        });
      }
    } else {
      await saveCatalog(user, map[kind], kind, input);
    }
    revalidatePath("/settings");
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function markNotificationReadAction(id: string) {
  const user = await requireUser();
  try {
    await Notification.updateOne({ _id: id, userId: user.id }, { readAt: new Date() });
    revalidatePath("/notifications");
    return done();
  } catch (error) {
    return fail(error);
  }
}

export async function markAllNotificationsReadAction() {
  const user = await requireUser();
  try {
    await Notification.updateMany({ userId: user.id, readAt: null }, { readAt: new Date() });
    revalidatePath("/notifications");
    return done();
  } catch (error) {
    return fail(error);
  }
}

void can;
