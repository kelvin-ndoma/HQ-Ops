import { eventContribution } from "../../domain/money";
import { can } from "../../domain/permissions";
import { transitionEvent, transitionProcurement, transitionTask, transitionVendorAssignment, type EventStatus, type ProcurementStatus, type TaskStatus, type VendorAssignmentStatus } from "../../domain/states";
import type { SessionUser } from "../auth";
import { recordActivity, recordAudit } from "../audit";
import { connectDB } from "../db";
import { AppError } from "../errors";
import {
  Booking,
  Client,
  Enquiry,
  EventCost,
  EventRecord,
  EventVendor,
  InventoryReservation,
  ProcurementRequest,
  Task,
  User,
  Vendor,
} from "../models";
import { sid } from "../parse";
import { nextReference } from "../references";

export async function listTasks(actor: SessionUser, scope: "mine" | "team") {
  await connectDB();
  const query: Record<string, unknown> = { archivedAt: null, status: { $ne: "cancelled" } };
  if (scope === "team" && can(actor.role, "tasks.view_team")) {
    // leadership view
  } else {
    query.ownerId = actor.id;
  }
  return Task.find(query).sort({ dueAt: 1 }).limit(300).lean();
}

export async function createTask(actor: SessionUser, input: {
  title: string;
  description?: string;
  ownerId: string;
  dueAt?: Date;
  priority: string;
  relatedType: string;
  relatedId?: string;
}) {
  await connectDB();
  const task = await Task.create({
    ...input,
    description: input.description || "",
    relatedId: input.relatedId || undefined,
    createdBy: actor.id,
    source: "manual",
  });
  if (input.ownerId !== actor.id) {
    const { notify } = await import("../notifications");
    await notify({
      userId: input.ownerId,
      type: "task.assigned",
      title: `Task assigned · ${input.title}`,
      body: "A task has been put on your list.",
      href: "/tasks",
      dedupeKey: `task-assigned:${task._id}`,
    });
  }
  return sid(task._id);
}

export async function setTaskStatus(actor: SessionUser, id: string, status: TaskStatus) {
  await connectDB();
  const task = await Task.findOne({ _id: id, archivedAt: null });
  if (!task) throw new AppError("Task not found.", "not_found");
  if (!can(actor.role, "tasks.view_team") && sid(task.ownerId) !== actor.id && sid(task.createdBy) !== actor.id) {
    throw new AppError("You can update tasks assigned to you.", "forbidden");
  }
  const result = transitionTask(task.status, status);
  if (!result.ok) throw new AppError(result.error);
  task.status = status;
  if (status === "completed") {
    task.completedAt = new Date();
    task.completedBy = actor.id;
  }
  await task.save();
  if (task.relatedType === "event" && task.relatedId) await refreshPreparation(sid(task.relatedId));
}

async function refreshPreparation(eventId: string) {
  const tasks = await Task.find({ relatedType: "event", relatedId: eventId, archivedAt: null, source: "automation" });
  const open = tasks.filter((task) => task.status === "todo" || task.status === "in_progress");
  const overdue = open.some((task) => task.dueAt && task.dueAt < new Date());
  const status = tasks.length > 0 && open.length === 0 ? "ready" : overdue ? "at_risk" : "on_track";
  await EventRecord.updateOne({ _id: eventId }, { preparationStatus: status });
}

export async function listEvents(actor: SessionUser) {
  await connectDB();
  const events = await EventRecord.find({ archivedAt: null }).sort({ startAt: 1 }).limit(200).lean();
  if (can(actor.role, "events.write") || can(actor.role, "events.financials") || actor.role === "administrator" || actor.role === "super_admin") return events;
  const [taskIds, enquiries, bookings] = await Promise.all([
    Task.find({ ownerId: actor.id, relatedType: "event", archivedAt: null }).distinct("relatedId"),
    Enquiry.find({ ownerId: actor.id, archivedAt: null }).distinct("_id"),
    Booking.find({ ownerId: actor.id, archivedAt: null }).distinct("_id"),
  ]);
  const allowed = new Set(taskIds.map((id) => String(id)));
  const enquiryIds = new Set(enquiries.map((id) => String(id)));
  const bookingIds = new Set(bookings.map((id) => String(id)));
  return events.filter((event) => sid(event.ownerId) === actor.id || enquiryIds.has(sid(event.enquiryId)) || bookingIds.has(sid(event.bookingId)) || (event.staffIds || []).some((id: unknown) => sid(id) === actor.id) || allowed.has(sid(event._id)));
}

export async function getEventWorkspace(actor: SessionUser, id: string) {
  await connectDB();
  const event = await EventRecord.findOne({ _id: id, archivedAt: null }).lean();
  if (!event) throw new AppError("Event not found.", "not_found");
  const visible = await listEvents(actor);
  if (!visible.some((item) => sid(item._id) === id)) throw new AppError("Event not found.", "not_found");
  const [client, tasks, vendors, reservations, costs, owner] = await Promise.all([
    Client.findById(event.clientId).lean(),
    Task.find({ relatedType: "event", relatedId: event._id, archivedAt: null }).sort({ dueAt: 1 }).lean(),
    EventVendor.find({ eventId: event._id }).lean(),
    InventoryReservation.find({ eventId: event._id }).lean(),
    EventCost.find({ eventId: event._id }).sort({ incurredAt: -1 }).lean(),
    event.ownerId ? User.findById(event.ownerId).select("name").lean() : null,
  ]);
  const vendorDocs = await Vendor.find({ _id: { $in: vendors.map((item) => item.vendorId) } }).lean();
  const direct = costs.reduce((sum, cost) => sum + cost.amountCents, 0) + vendors.reduce((sum, vendor) => sum + (vendor.agreedCostCents || 0), 0);
  const { Booking } = await import("../models");
  const booking = await Booking.findById(event.bookingId).lean();
  const contribution = eventContribution(booking?.agreedAmountCents || 0, direct);
  const financials = can(actor.role, "events.financials") || can(actor.role, "costs.read");
  const access = {
    edit: can(actor.role, "events.write"),
    closeout: can(actor.role, "events.closeout"),
    inventory: can(actor.role, "inventory.move"),
    vendors: can(actor.role, "vendors.write"),
    costs: can(actor.role, "costs.write"),
    tasks: can(actor.role, "tasks.write"),
  };
  return { event, client, tasks, vendors, vendorDocs, reservations, costs, owner, booking, contribution, financials, access };
}

export async function updateEvent(actor: SessionUser, id: string, patch: { notes?: string; requirements?: { label: string; value: string }[]; status?: EventStatus; staffIds?: string[] }) {
  if (!can(actor.role, "events.write")) throw new AppError("You cannot change the event workspace.", "forbidden");
  await connectDB();
  const event = await EventRecord.findById(id);
  if (!event) throw new AppError("Event not found.", "not_found");
  if (patch.status) {
    const result = transitionEvent(event.status, patch.status);
    if (!result.ok) throw new AppError(result.error);
    if (patch.status === "closed") {
      const pending = (event.closeout?.items || []).some((item: { done?: boolean }) => !item.done);
      if (pending) throw new AppError("Complete the closeout checklist before closing the event.");
    }
    const previous = event.status;
    event.status = patch.status;
    if (patch.status === "completed" || patch.status === "closed") {
      const { Booking } = await import("../models");
      await Booking.updateOne({ _id: event.bookingId, status: "confirmed" }, { status: "completed" });
    }
    await recordAudit({
      actorId: actor.id,
      action: "event.status",
      entityType: "event",
      entityId: id,
      previousValue: { status: previous },
      newValue: { status: patch.status },
    });
  }
  if (patch.notes !== undefined) event.notes = patch.notes;
  if (patch.requirements) event.requirements = patch.requirements;
  if (patch.staffIds) event.staffIds = patch.staffIds;
  await event.save();
}

export async function toggleCloseout(actor: SessionUser, eventId: string, key: string, done: boolean, notes?: string) {
  if (!can(actor.role, "events.closeout")) throw new AppError("You cannot complete operational closeout.", "forbidden");
  await connectDB();
  const event = await EventRecord.findById(eventId);
  if (!event) throw new AppError("Event not found.", "not_found");
  const item = event.closeout.items.find((entry: { key: string }) => entry.key === key);
  if (!item) throw new AppError("Checklist item not found.", "not_found");
  item.done = done;
  item.doneBy = done ? actor.id : undefined;
  item.doneAt = done ? new Date() : undefined;
  if (notes !== undefined) event.closeout.notes = notes;
  const complete = event.closeout.items.every((entry: { done?: boolean }) => entry.done);
  event.closeout.completedAt = complete ? new Date() : undefined;
  await event.save();
  await recordActivity({
    entityType: "event",
    entityId: eventId,
    actorId: actor.id,
    summary: `${item.label} marked ${done ? "done" : "open"}.`,
  });
}

export async function createVendor(actor: SessionUser, input: {
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  categoryId: string;
  services?: string;
  pricingNotes?: string;
  paymentTerms?: string;
  notes?: string;
  preferred?: boolean;
}) {
  await connectDB();
  const vendor = await Vendor.create({
    ...input,
    contactName: input.contactName || "",
    phone: input.phone || "",
    email: (input.email || "").toLowerCase(),
    services: (input.services || "").split(",").map((part) => part.trim()).filter(Boolean),
    pricingNotes: input.pricingNotes || "",
    paymentTerms: input.paymentTerms || "",
    notes: input.notes || "",
    preferred: Boolean(input.preferred),
  });
  await recordAudit({ actorId: actor.id, action: "vendor.create", entityType: "vendor", entityId: sid(vendor._id), newValue: { name: vendor.name } });
  return sid(vendor._id);
}

export async function listVendors() {
  await connectDB();
  return Vendor.find({ archivedAt: null }).sort({ preferred: -1, name: 1 }).lean();
}

export async function getVendor(id: string) {
  await connectDB();
  const vendor = await Vendor.findOne({ _id: id, archivedAt: null }).lean();
  if (!vendor) throw new AppError("Vendor not found.", "not_found");
  const assignments = await EventVendor.find({ vendorId: id }).lean();
  return { vendor, assignments };
}

export async function assignVendor(actor: SessionUser, input: {
  eventId: string;
  vendorId: string;
  service: string;
  quotedCostCents?: number;
  agreedCostCents?: number;
  notes?: string;
}) {
  if (!can(actor.role, "vendors.write")) throw new AppError("You cannot change vendor agreements.", "forbidden");
  await connectDB();
  const row = await EventVendor.create({
    ...input,
    quotedCostCents: input.quotedCostCents || 0,
    agreedCostCents: input.agreedCostCents || 0,
    notes: input.notes || "",
    confirmationStatus: "requested",
  });
  await recordActivity({
    entityType: "event",
    entityId: input.eventId,
    actorId: actor.id,
    summary: `Vendor requested for ${input.service}.`,
  });
  return sid(row._id);
}

export async function setVendorAssignment(actor: SessionUser, id: string, status: VendorAssignmentStatus, costs?: { quotedCostCents?: number; agreedCostCents?: number }) {
  if (!can(actor.role, "vendors.write")) throw new AppError("You cannot change vendor agreements.", "forbidden");
  await connectDB();
  const row = await EventVendor.findById(id);
  if (!row) throw new AppError("Vendor assignment not found.", "not_found");
  const result = transitionVendorAssignment(row.confirmationStatus, status);
  if (!result.ok) throw new AppError(result.error);
  const previous = { status: row.confirmationStatus, agreedCostCents: row.agreedCostCents };
  row.confirmationStatus = status;
  if (costs?.quotedCostCents !== undefined) row.quotedCostCents = costs.quotedCostCents;
  if (costs?.agreedCostCents !== undefined && costs.agreedCostCents !== row.agreedCostCents) {
    row.agreedCostCents = costs.agreedCostCents;
    await recordAudit({
      actorId: actor.id,
      action: "vendor.cost",
      entityType: "event_vendor",
      entityId: id,
      previousValue: previous,
      newValue: { agreedCostCents: costs.agreedCostCents, status },
    });
  }
  await row.save();
}

export async function createProcurement(actor: SessionUser, input: {
  item: string;
  quantity: number;
  reason: string;
  estimatedCostCents?: number;
  vendorId?: string;
  eventId?: string;
  relatedType: string;
}) {
  await connectDB();
  const reference = await nextReference("PR");
  const request = await ProcurementRequest.create({
    reference,
    item: input.item,
    quantity: input.quantity,
    reason: input.reason,
    estimatedCostCents: input.estimatedCostCents || 0,
    vendorId: input.vendorId || undefined,
    eventId: input.eventId || undefined,
    relatedType: input.relatedType,
    requesterId: actor.id,
    status: "requested",
    history: [{ action: "requested", actorId: actor.id, at: new Date(), note: input.reason }],
  });
  await recordAudit({
    actorId: actor.id,
    action: "procurement.create",
    entityType: "procurement",
    entityId: sid(request._id),
    newValue: { reference, estimatedCostCents: request.estimatedCostCents },
  });
  const { getCommercial } = await import("../settings");
  const { aboveThreshold } = await import("../../domain/approvals");
  const commercial = await getCommercial();
  if (aboveThreshold(request.estimatedCostCents || 0, commercial.approvals.procurementCents)) {
    const { submitApproval } = await import("./approvals");
    await submitApproval(actor, {
      entityType: "procurement",
      entityId: sid(request._id),
      actionType: "procurement_threshold",
      reason: input.reason,
      proposedValue: { estimatedCostCents: request.estimatedCostCents, item: request.item },
    });
  }
  return sid(request._id);
}

export async function setProcurementStatus(actor: SessionUser, id: string, status: ProcurementStatus, note?: string, finalCostCents?: number, fromApproval = false) {
  await connectDB();
  const request = await ProcurementRequest.findOne({ _id: id, archivedAt: null });
  if (!request) throw new AppError("Request not found.", "not_found");
  const result = transitionProcurement(request.status, status);
  if (!result.ok) throw new AppError(result.error);
  if ((status === "approved" || status === "rejected") && !fromApproval && !can(actor.role, "procurement.approve") && !can(actor.role, "approvals.review_operations") && !can(actor.role, "approvals.review")) {
    throw new AppError("You cannot approve procurement requests.", "forbidden");
  }
  if (status === "approved" && !fromApproval) {
    const { getCommercial } = await import("../settings");
    const { aboveThreshold } = await import("../../domain/approvals");
    const commercial = await getCommercial();
    if (aboveThreshold(request.estimatedCostCents || 0, commercial.approvals.procurementCents)) {
      const { ApprovalRequest } = await import("../models");
      const approved = await ApprovalRequest.findOne({ entityType: "procurement", entityId: id, actionType: "procurement_threshold", status: "approved" });
      if (!approved) {
        const { submitApproval } = await import("./approvals");
        await submitApproval(actor, {
          entityType: "procurement",
          entityId: id,
          actionType: "procurement_threshold",
          reason: note || request.reason,
          originalValue: { status: request.status, estimatedCostCents: request.estimatedCostCents },
          proposedValue: { status: "approved" },
        });
        throw new AppError("This request is above the configured threshold. It stays requested until the approval is granted.");
      }
    }
  }
  const previous = request.status;
  request.status = status;
  if (status === "approved" || status === "rejected") request.approverId = actor.id;
  if (finalCostCents !== undefined) request.finalCostCents = finalCostCents;
  request.history.push({ action: status, actorId: actor.id, at: new Date(), note: note || "" });
  await request.save();
  await recordAudit({
    actorId: actor.id,
    action: "procurement.status",
    entityType: "procurement",
    entityId: id,
    previousValue: { status: previous },
    newValue: { status, finalCostCents },
    reason: note || "",
  });
}

export async function listProcurement() {
  await connectDB();
  return ProcurementRequest.find({ archivedAt: null }).sort({ createdAt: -1 }).limit(200).lean();
}

export async function addEventCost(actor: SessionUser, input: { eventId: string; category: string; description: string; amountCents: number; vendorId?: string }) {
  if (!can(actor.role, "costs.write")) throw new AppError("You cannot record event costs.", "forbidden");
  await connectDB();
  const cost = await EventCost.create({
    ...input,
    vendorId: input.vendorId || undefined,
    recordedBy: actor.id,
  });
  await recordAudit({
    actorId: actor.id,
    action: "event_cost.create",
    entityType: "event_cost",
    entityId: sid(cost._id),
    newValue: { eventId: input.eventId, amountCents: input.amountCents, category: input.category },
  });
  return sid(cost._id);
}

export async function listEventCosts() {
  await connectDB();
  return EventCost.find().sort({ incurredAt: -1 }).limit(300).lean();
}
