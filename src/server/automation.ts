import { addDays, addHours, planPreparationTasks } from "../domain/operations";
import { connectDB } from "./db";
import { recordActivity } from "./audit";
import {
  Booking,
  Enquiry,
  InventoryItem,
  Quotation,
  SiteVisit,
  Task,
} from "./models";
import { notify, notifyRoles } from "./notifications";
import { getAutomation, getCommercial } from "./settings";

async function ensureTask(input: {
  title: string;
  description?: string;
  ownerId?: string | null;
  dueAt?: Date;
  priority?: string;
  relatedType: string;
  relatedId?: string;
  createdBy?: string | null;
  automationKey: string;
}) {
  const existing = await Task.findOne({ automationKey: input.automationKey });
  if (existing) return existing;
  try {
    return await Task.create({ ...input, source: "automation", status: "todo" });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === 11000) {
      return Task.findOne({ automationKey: input.automationKey });
    }
    throw error;
  }
}

export async function onEnquiryCreated(enquiry: { _id: unknown; ownerId?: unknown; reference: string; contact?: { fullName?: string } }, actorId: string) {
  const automation = await getAutomation();
  const ownerId = enquiry.ownerId ? String(enquiry.ownerId) : null;
  if (ownerId) {
    await ensureTask({
      title: `Follow up ${enquiry.reference}`,
      description: `First contact with ${enquiry.contact?.fullName || "the client"}.`,
      ownerId,
      dueAt: addHours(new Date(), automation.newEnquiryFollowUpHours),
      priority: "high",
      relatedType: "enquiry",
      relatedId: String(enquiry._id),
      createdBy: actorId,
      automationKey: `enquiry-followup:${enquiry._id}`,
    });
    await notify({
      userId: ownerId,
      type: "enquiry.assigned",
      title: `New enquiry ${enquiry.reference}`,
      body: enquiry.contact?.fullName || "A new enquiry needs an owner follow-up.",
      href: `/enquiries/${enquiry._id}`,
      dedupeKey: `enquiry-created:${enquiry._id}`,
    });
  }
}

export async function onVisitScheduled(visit: { _id: unknown; scheduledAt: Date; assignedToId?: unknown; enquiryId: unknown }, actorId: string) {
  const automation = await getAutomation();
  const ownerId = visit.assignedToId ? String(visit.assignedToId) : null;
  await ensureTask({
    title: "Site visit reminder",
    ownerId,
    dueAt: addHours(new Date(visit.scheduledAt), -automation.visitReminderHours),
    priority: "high",
    relatedType: "site_visit",
    relatedId: String(visit._id),
    createdBy: actorId,
    automationKey: `visit-reminder:${visit._id}`,
  });
  await ensureTask({
    title: "Post-visit follow-up",
    description: "Record the outcome and send a quotation if the client is interested.",
    ownerId,
    dueAt: addHours(new Date(visit.scheduledAt), automation.postVisitFollowUpHours),
    priority: "high",
    relatedType: "site_visit",
    relatedId: String(visit._id),
    createdBy: actorId,
    automationKey: `visit-followup:${visit._id}`,
  });
  if (ownerId) {
    await notify({
      userId: ownerId,
      type: "visit.upcoming",
      title: "Site visit assigned",
      body: "A site visit has been put on your schedule.",
      href: `/site-visits/${visit._id}`,
      dedupeKey: `visit-assigned:${visit._id}`,
    });
  }
}

export async function onQuoteSent(quote: { _id: unknown; reference: string; ownerId?: unknown }, actorId: string) {
  const automation = await getAutomation();
  const ownerId = quote.ownerId ? String(quote.ownerId) : actorId;
  await ensureTask({
    title: `Follow up quotation ${quote.reference}`,
    ownerId,
    dueAt: addDays(new Date(), automation.quoteFollowUpDays),
    priority: "high",
    relatedType: "quotation",
    relatedId: String(quote._id),
    createdBy: actorId,
    automationKey: `quote-followup:${quote._id}:${quote.reference}`,
  });
  await notify({
    userId: ownerId,
    type: "quote.followup",
    title: `${quote.reference} was sent`,
    body: "A follow-up task has been scheduled.",
    href: `/quotations/${quote._id}`,
    dedupeKey: `quote-sent:${quote._id}`,
  });
}

export async function onDepositPending(enquiry: { _id: unknown; reference: string; ownerId?: unknown }, actorId: string) {
  const automation = await getAutomation();
  if (!enquiry.ownerId) return;
  await ensureTask({
    title: `Collect deposit for ${enquiry.reference}`,
    ownerId: String(enquiry.ownerId),
    dueAt: addDays(new Date(), automation.depositFollowUpDays),
    priority: "urgent",
    relatedType: "enquiry",
    relatedId: String(enquiry._id),
    createdBy: actorId,
    automationKey: `deposit-followup:${enquiry._id}`,
  });
  await notify({
    userId: String(enquiry.ownerId),
    type: "deposit.outstanding",
    title: `Deposit pending · ${enquiry.reference}`,
    body: "The opportunity is waiting on a deposit.",
    href: `/enquiries/${enquiry._id}`,
    dedupeKey: `deposit-pending:${enquiry._id}`,
  });
}

export async function onBookingConfirmed(
  event: { _id: unknown; reference: string; startAt: Date; ownerId?: unknown; clientId?: unknown },
  actorId: string,
) {
  const automation = await getAutomation();
  const ownerId = event.ownerId ? String(event.ownerId) : actorId;
  const tasks = planPreparationTasks(new Date(event.startAt), automation.preparationTasks);
  for (const task of tasks) {
    await ensureTask({
      title: task.label,
      ownerId,
      dueAt: task.dueAt,
      priority: task.offsetDays >= 0 ? "high" : "normal",
      relatedType: "event",
      relatedId: String(event._id),
      createdBy: actorId,
      automationKey: `prep:${event._id}:${task.key}`,
    });
  }
  await notify({
    userId: ownerId,
    type: "booking.confirmed",
    title: `${event.reference} is confirmed`,
    body: "The event workspace and preparation tasks are ready.",
    href: `/events/${event._id}`,
    dedupeKey: `booking-confirmed:${event._id}`,
  });
}

export async function onLowStock(item: { _id: unknown; name: string; sku: string }) {
  const day = new Date().toISOString().slice(0, 10);
  await notifyRoles(["operations_lead", "leadership"], {
    type: "inventory.shortage",
    title: `Low stock · ${item.name}`,
    body: `${item.sku} is at or below its reorder level.`,
    href: `/inventory/${item._id}`,
    dedupeKey: `lowstock:${item._id}:${day}`,
  });
}

let lastSweep = 0;

export async function sweep(force = false) {
  if (!force && Date.now() - lastSweep < 5 * 60 * 1000) return;
  lastSweep = Date.now();
  await connectDB();
  const [automation, commercial] = await Promise.all([getAutomation(), getCommercial()]);
  const now = new Date();
  const day = now.toISOString().slice(0, 10);

  const overdue = await Task.find({
    archivedAt: null,
    status: { $in: ["todo", "in_progress"] },
    dueAt: { $lt: now },
    ownerId: { $ne: null },
  }).limit(200);
  for (const task of overdue) {
    await notify({
      userId: String(task.ownerId),
      type: "task.overdue",
      title: `Overdue · ${task.title}`,
      body: "This task is past its due time.",
      href: "/tasks",
      dedupeKey: `task-overdue:${task._id}:${day}`,
    });
  }

  const staleBefore = addDays(now, -automation.quoteInactivityDays);
  const staleQuotes = await Quotation.find({
    archivedAt: null,
    status: { $in: ["sent", "viewed"] },
    lastActivityAt: { $lt: staleBefore },
  }).limit(100);
  for (const quote of staleQuotes) {
    quote.needsFollowUp = true;
    await quote.save();
    if (!quote.ownerId) continue;
    await notify({
      userId: String(quote.ownerId),
      type: "quote.followup",
      title: `${quote.reference} has gone quiet`,
      body: `No activity for ${automation.quoteInactivityDays} days.`,
      href: `/quotations/${quote._id}`,
      dedupeKey: `quote-stale:${quote._id}:${day}`,
    });
  }

  const expiredHolds = await Booking.find({
    status: "tentative",
    holdExpired: { $ne: true },
    holdExpiresAt: { $lt: now },
    archivedAt: null,
  }).limit(100);
  for (const booking of expiredHolds) {
    booking.holdExpired = true;
    await booking.save();
    await recordActivity({
      entityType: "booking",
      entityId: String(booking._id),
      summary: `${booking.reference} hold expired and no longer blocks the calendar.`,
      kind: "system",
    });
    if (booking.ownerId) {
      await notify({
        userId: String(booking.ownerId),
        type: "booking.hold_expired",
        title: `Hold expired · ${booking.reference}`,
        body: "The tentative hold no longer reserves the space.",
        href: `/bookings/${booking._id}`,
        dedupeKey: `hold-expired:${booking._id}`,
      });
    }
  }

  const reminderBefore = addHours(now, automation.visitReminderHours);
  const upcomingVisits = await SiteVisit.find({
    status: "scheduled",
    scheduledAt: { $gte: now, $lte: reminderBefore },
    archivedAt: null,
  }).limit(100);
  for (const visit of upcomingVisits) {
    if (!visit.assignedToId) continue;
    await notify({
      userId: String(visit.assignedToId),
      type: "visit.upcoming",
      title: "Site visit coming up",
      body: "A scheduled visit is inside the reminder window.",
      href: `/site-visits/${visit._id}`,
      dedupeKey: `visit-window:${visit._id}:${day}`,
    });
  }

  const low = await InventoryItem.find({ active: true, archivedAt: null }).limit(300);
  for (const item of low) {
    const available = item.quantityOnHand - item.quantityReserved - item.quantityCheckedOut;
    if (available <= item.reorderLevel) await onLowStock(item);
  }

  const quietEnquiries = await Enquiry.find({
    archivedAt: null,
    stage: { $nin: ["lost", "cancelled", "confirmed"] },
    lastActivityAt: { $lt: addDays(now, -commercial.staleEnquiryDays) },
  }).limit(100);
  for (const enquiry of quietEnquiries) {
    if (!enquiry.ownerId) continue;
    await notify({
      userId: String(enquiry.ownerId),
      type: "enquiry.stale",
      title: `${enquiry.reference} has no recent activity`,
      body: "This open enquiry needs a next action.",
      href: `/enquiries/${enquiry._id}`,
      dedupeKey: `enquiry-stale:${enquiry._id}:${day}`,
    });
  }
}
