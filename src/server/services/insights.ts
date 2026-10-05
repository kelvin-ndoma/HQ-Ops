import { eventContribution, formatKsh } from "../../domain/money";
import { enquiryFlags } from "../../domain/operations";
import { isOpenEnquiry, type EnquiryStatus } from "../../domain/states";
import { connectDB } from "../db";
import { getCommercial } from "../settings";
import {
  ActivityEvent,
  AuditLog,
  Booking,
  Client,
  Enquiry,
  EventCost,
  EventRecord,
  EventVendor,
  InventoryItem,
  InventoryReservation,
  LeadSource,
  LostReason,
  Payment,
  Quotation,
  QuotationVersion,
  SiteVisit,
  Space,
  StockMovement,
  Task,
  User,
  Vendor,
} from "../models";
import { sid } from "../parse";
import { sweep } from "../automation";
import type { SessionUser } from "../auth";
import { can } from "../../domain/permissions";
import { escapeRegex, normalizePhone } from "../../domain/operations";

export async function commandCentre(actor: SessionUser) {
  await connectDB();
  await sweep();
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const commercial = await getCommercial();
  const openStages = ["new", "contacted", "qualified", "site_visit", "quote_sent", "negotiation", "deposit_pending"];
  const [enquiries, quotes, bookings, events, tasks, items, visits, versions] = await Promise.all([
    Enquiry.find({ archivedAt: null }).lean(),
    Quotation.find({ archivedAt: null, status: { $in: ["sent", "viewed"] } }).lean(),
    Booking.find({ archivedAt: null, status: { $in: ["tentative", "awaiting_deposit", "confirmed", "completed"] } }).lean(),
    EventRecord.find({ archivedAt: null, status: { $nin: ["cancelled", "closed"] } }).sort({ startAt: 1 }).lean(),
    Task.find({
      archivedAt: null,
      status: { $in: ["todo", "in_progress"] },
      ...(can(actor.role, "tasks.view_team") ? {} : { ownerId: actor.id }),
    }).lean(),
    InventoryItem.find({ active: true, archivedAt: null }).lean(),
    SiteVisit.find({ archivedAt: null, status: "scheduled", scheduledAt: { $gte: now, $lte: weekAhead } }).lean(),
    QuotationVersion.find().lean(),
  ]);
  const versionValue = new Map(versions.map((version) => [`${version.quotationId}:${version.version}`, version.totalCents || 0]));
  const quoteByEnquiry = new Map<string, number>();
  for (const quote of await Quotation.find({ archivedAt: null }).lean()) {
    quoteByEnquiry.set(sid(quote.enquiryId), versionValue.get(`${quote._id}:${quote.currentVersion}`) || quoteByEnquiry.get(sid(quote.enquiryId)) || 0);
  }
  const pipeline = openStages.map((stage) => {
    const rows = enquiries.filter((enquiry) => enquiry.stage === stage);
    const value = rows.reduce((sum, enquiry) => sum + (quoteByEnquiry.get(sid(enquiry._id)) || enquiry.estimatedValueCents || 0), 0);
    return { stage, count: rows.length, valueCents: value };
  });
  const lowStock = items.filter((item) => item.quantityOnHand - item.quantityReserved - item.quantityCheckedOut <= item.reorderLevel);
  const upcomingBookings = bookings.filter((booking) => booking.status === "confirmed" && new Date(booking.startAt) >= now);
  const outstanding = bookings.filter((booking) => (booking.status === "confirmed" || booking.status === "completed") && booking.outstandingCents > 0);
  const todayTasks = tasks
    .filter((task) => task.dueAt && new Date(task.dueAt) <= new Date(now.getTime() + 24 * 60 * 60 * 1000))
    .sort((a, b) => (a.priority === "urgent" ? -1 : 1) - (b.priority === "urgent" ? -1 : 1));
  const clientNames = new Map((await Client.find({
    _id: { $in: [...enquiries, ...bookings, ...quotes, ...events].map((row) => row.clientId) },
  }).select("name").lean()).map((client) => [sid(client._id), client.name]));
  const enquiryNames = new Map(enquiries.map((enquiry) => [sid(enquiry._id), enquiry.contact?.fullName || clientNames.get(sid(enquiry.clientId)) || ""]));
  const attention: { id: string; title: string; detail: string; name: string; href: string; tone: "bad" | "warn" }[] = [];
  for (const enquiry of enquiries) {
    const flags = enquiryFlags({
      status: enquiry.stage as EnquiryStatus,
      ownerId: enquiry.ownerId ? sid(enquiry.ownerId) : null,
      nextAction: enquiry.nextAction,
      nextActionAt: enquiry.nextActionAt,
      lastActivityAt: enquiry.lastActivityAt,
      now,
      staleDays: commercial.staleEnquiryDays,
    });
    if (flags.includes("Overdue follow-up")) {
      attention.push({
        id: sid(enquiry._id),
        title: `Follow-up overdue · ${enquiry.reference}`,
        detail: "",
        name: enquiryNames.get(sid(enquiry._id)) || "",
        href: `/enquiries/${enquiry._id}`,
        tone: "bad",
      });
    } else if (flags.includes("No owner") || flags.includes("No next action")) {
      attention.push({
        id: `gap-${enquiry._id}`,
        title: `${flags[0]} · ${enquiry.reference}`,
        detail: "",
        name: enquiryNames.get(sid(enquiry._id)) || "",
        href: `/enquiries/${enquiry._id}`,
        tone: "warn",
      });
    }
  }
  for (const quote of quotes) {
    if (quote.needsFollowUp || (quote.validUntil && new Date(quote.validUntil) < now)) {
      attention.push({
        id: sid(quote._id),
        title: `Quotation needs a follow-up · ${quote.reference}`,
        detail: quote.status,
        name: (quote.enquiryId && enquiryNames.get(sid(quote.enquiryId))) || clientNames.get(sid(quote.clientId)) || "",
        href: `/quotations/${quote._id}`,
        tone: "warn",
      });
    }
  }
  for (const booking of bookings) {
    if (booking.status === "awaiting_deposit" || (booking.depositReceivedCents < booking.depositRequiredCents && booking.status !== "cancelled")) {
      if (booking.status === "awaiting_deposit" || booking.status === "tentative") {
        attention.push({
          id: `dep-${booking._id}`,
          title: `Deposit outstanding · ${booking.reference}`,
          name: (booking.enquiryId && enquiryNames.get(sid(booking.enquiryId))) || clientNames.get(sid(booking.clientId)) || "",
          detail: formatKsh(Math.max(0, booking.depositRequiredCents - booking.depositReceivedCents)),
          href: `/bookings/${booking._id}`,
          tone: "warn",
        });
      }
    }
    if ((booking.status === "confirmed" || booking.status === "completed") && booking.outstandingCents > 0) {
      attention.push({
        id: `bal-${booking._id}`,
        title: `Outstanding balance · ${booking.reference}`,
        name: (booking.enquiryId && enquiryNames.get(sid(booking.enquiryId))) || clientNames.get(sid(booking.clientId)) || "",
        detail: formatKsh(booking.outstandingCents),
        href: `/bookings/${booking._id}`,
        tone: booking.endAt && new Date(booking.endAt) < now ? "bad" : "warn",
      });
    }
  }
  for (const item of lowStock.slice(0, 5)) {
    attention.push({
      id: sid(item._id),
      title: `Inventory shortage · ${item.name}`,
      detail: `${item.quantityOnHand - item.quantityReserved - item.quantityCheckedOut} available`,
      name: "",
      href: `/inventory/${item._id}`,
      tone: "bad",
    });
  }
  const unconfirmedVendors = await EventVendor.find({ confirmationStatus: { $in: ["requested", "quoted"] } }).limit(8).lean();
  for (const vendor of unconfirmedVendors) {
    attention.push({
      id: sid(vendor._id),
      title: "Vendor not confirmed",
      detail: vendor.service,
      name: "",
      href: `/events/${vendor.eventId}`,
      tone: "warn",
    });
  }
  return {
    kpis: {
      newEnquiries: enquiries.filter((enquiry) => enquiry.stage === "new").length,
      followUpsDue: enquiries.filter((enquiry) => isOpenEnquiry(enquiry.stage) && enquiry.nextActionAt && new Date(enquiry.nextActionAt).toDateString() === now.toDateString()).length,
      overdueFollowUps: attention.filter((item) => item.title.startsWith("Follow-up overdue")).length,
      siteVisits: visits.length,
      quotesWaiting: quotes.length,
      confirmedEvents: upcomingBookings.length,
      upcomingEvents: events.filter((event) => new Date(event.startAt) >= now && new Date(event.startAt) <= new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000)).length,
      pipelineCents: pipeline.reduce((sum, stage) => sum + stage.valueCents, 0),
      confirmedCents: upcomingBookings.reduce((sum, booking) => sum + booking.agreedAmountCents, 0),
      outstandingCents: outstanding.reduce((sum, booking) => sum + booking.outstandingCents, 0),
      lowStock: lowStock.length,
      depositUnconfigured: commercial.deposit.mode === "percent" && commercial.deposit.percent == null,
    },
    attention: attention.slice(0, 12),
    tasks: todayTasks.slice(0, 8),
    events: events.filter((event) => new Date(event.startAt) >= now).slice(0, 6).map((event) => ({
      ...event,
      clientName: clientNames.get(sid(event.clientId)) || "Client",
    })),
    pipeline,
  };
}

export async function globalSearch(q: string) {
  await connectDB();
  const term = q.trim();
  if (term.length < 2) return [];
  const rx = new RegExp(escapeRegex(term), "i");
  const phone = normalizePhone(term);
  const [clients, enquiries, quotes, bookings, events, vendors, items] = await Promise.all([
    Client.find({ archivedAt: null, $or: [{ name: rx }, { organizationName: rx }, { email: rx }, { phone: rx }, { phoneNormalized: phone }] }).limit(6).lean(),
    Enquiry.find({ archivedAt: null, $or: [{ reference: rx }, { "contact.fullName": rx }, { "contact.organization": rx }, { "contact.phone": rx }, { "contact.phoneNormalized": phone }] }).limit(6).lean(),
    Quotation.find({ archivedAt: null, reference: rx }).limit(5).lean(),
    Booking.find({ archivedAt: null, reference: rx }).limit(5).lean(),
    EventRecord.find({ archivedAt: null, reference: rx }).limit(5).lean(),
    Vendor.find({ archivedAt: null, $or: [{ name: rx }, { phone: rx }, { email: rx }] }).limit(5).lean(),
    InventoryItem.find({ archivedAt: null, $or: [{ name: rx }, { sku: rx }] }).limit(5).lean(),
  ]);
  return [
    ...clients.map((item) => ({ type: "Client", label: item.name, hint: item.organizationName || item.phone, href: `/clients/${item._id}` })),
    ...enquiries.map((item) => ({ type: "Enquiry", label: item.reference, hint: item.contact?.fullName, href: `/enquiries/${item._id}` })),
    ...quotes.map((item) => ({ type: "Quotation", label: item.reference, hint: item.status, href: `/quotations/${item._id}` })),
    ...bookings.map((item) => ({ type: "Booking", label: item.reference, hint: item.status, href: `/bookings/${item._id}` })),
    ...events.map((item) => ({ type: "Event", label: item.reference, hint: item.status, href: `/events/${item._id}` })),
    ...vendors.map((item) => ({ type: "Vendor", label: item.name, hint: item.phone, href: `/vendors/${item._id}` })),
    ...items.map((item) => ({ type: "Inventory", label: item.name, hint: item.sku, href: `/inventory/${item._id}` })),
  ];
}

export async function listActivity(limit = 80) {
  await connectDB();
  return ActivityEvent.find().sort({ createdAt: -1 }).limit(limit).lean();
}

export async function listAudit(limit = 100) {
  await connectDB();
  return AuditLog.find().sort({ createdAt: -1 }).limit(limit).lean();
}

export async function listNotifications(userId: string) {
  await connectDB();
  const { Notification } = await import("../models");
  return Notification.find({ userId }).sort({ createdAt: -1 }).limit(50).lean();
}

export async function salesReport(from: Date, to: Date) {
  await connectDB();
  const [enquiries, visits, quotes, bookings, lostReasons] = await Promise.all([
    Enquiry.find({ createdAt: { $gte: from, $lte: to }, archivedAt: null }).lean(),
    SiteVisit.find({ scheduledAt: { $gte: from, $lte: to }, archivedAt: null }).lean(),
    Quotation.find({ createdAt: { $gte: from, $lte: to }, archivedAt: null }).lean(),
    Booking.find({ createdAt: { $gte: from, $lte: to }, archivedAt: null }).lean(),
    LostReason.find().lean(),
  ]);
  const confirmed = bookings.filter((booking) => booking.status === "confirmed" || booking.status === "completed");
  const lost = enquiries.filter((enquiry) => enquiry.stage === "lost");
  const qualified = enquiries.filter((enquiry) => !["new", "lost", "cancelled"].includes(enquiry.stage));
  const reasonName = new Map(lostReasons.map((reason) => [sid(reason._id), reason.name]));
  const lostBreakdown = new Map<string, { count: number; valueCents: number }>();
  for (const enquiry of lost) {
    const key = reasonName.get(sid(enquiry.lostReasonId)) || "Unspecified";
    const current = lostBreakdown.get(key) || { count: 0, valueCents: 0 };
    current.count += 1;
    current.valueCents += enquiry.estimatedValueCents || 0;
    lostBreakdown.set(key, current);
  }
  return {
    enquiries: enquiries.length,
    qualified: qualified.length,
    visits: visits.length,
    quotations: quotes.length,
    bookings: confirmed.length,
    lost: lost.length,
    conversion: enquiries.length ? confirmed.length / enquiries.length : 0,
    averageBooking: confirmed.length ? confirmed.reduce((sum, booking) => sum + booking.agreedAmountCents, 0) / confirmed.length : 0,
    pipelineCents: enquiries.filter((enquiry) => isOpenEnquiry(enquiry.stage as EnquiryStatus)).reduce((sum, enquiry) => sum + (enquiry.estimatedValueCents || 0), 0),
    lostBreakdown: [...lostBreakdown.entries()].map(([reason, value]) => ({ reason, ...value })),
  };
}

export async function revenueReport(from: Date, to: Date) {
  await connectDB();
  const bookings = await Booking.find({
    archivedAt: null,
    status: { $in: ["confirmed", "completed"] },
    startAt: { $gte: from, $lte: to },
  }).lean();
  const payments = await Payment.find({ paidAt: { $gte: from, $lte: to } }).lean();
  const sources = await LeadSource.find().lean();
  const spaces = await Space.find().lean();
  const enquiries = await Enquiry.find({ _id: { $in: bookings.map((booking) => booking.enquiryId).filter(Boolean) } }).lean();
  const sourceName = new Map(sources.map((source) => [sid(source._id), source.name]));
  const spaceName = new Map(spaces.map((space) => [sid(space._id), space.name]));
  const enquirySource = new Map(enquiries.map((enquiry) => [sid(enquiry._id), sourceName.get(sid(enquiry.sourceId)) || "Unknown"]));
  const bySource = new Map<string, number>();
  const bySpace = new Map<string, number>();
  const byMonth = new Map<string, number>();
  for (const booking of bookings) {
    const source = enquirySource.get(sid(booking.enquiryId)) || "Direct booking";
    bySource.set(source, (bySource.get(source) || 0) + booking.agreedAmountCents);
    for (const spaceId of booking.spaceIds || []) {
      const name = spaceName.get(sid(spaceId)) || "Space";
      bySpace.set(name, (bySpace.get(name) || 0) + booking.agreedAmountCents);
    }
    const month = new Date(booking.startAt).toISOString().slice(0, 7);
    byMonth.set(month, (byMonth.get(month) || 0) + booking.agreedAmountCents);
  }
  const collected = payments.filter((payment) => payment.type !== "refund").reduce((sum, payment) => sum + payment.amountCents, 0)
    - payments.filter((payment) => payment.type === "refund").reduce((sum, payment) => sum + payment.amountCents, 0);
  return {
    confirmedCents: bookings.reduce((sum, booking) => sum + booking.agreedAmountCents, 0),
    collectedCents: collected,
    outstandingCents: bookings.reduce((sum, booking) => sum + Math.max(0, booking.outstandingCents || 0), 0),
    bySource: [...bySource.entries()].map(([name, cents]) => ({ name, cents })),
    bySpace: [...bySpace.entries()].map(([name, cents]) => ({ name, cents })),
    byMonth: [...byMonth.entries()].sort().map(([month, cents]) => ({ month, cents })),
  };
}

export async function operationsReport(from: Date, to: Date) {
  await connectDB();
  const [movements, items, vendors, costs, events] = await Promise.all([
    StockMovement.find({ createdAt: { $gte: from, $lte: to }, type: { $in: ["damage", "loss", "event_issue"] } }).lean(),
    InventoryItem.find({ archivedAt: null }).lean(),
    EventVendor.find({ updatedAt: { $gte: from, $lte: to } }).lean(),
    EventCost.find({ incurredAt: { $gte: from, $lte: to } }).lean(),
    EventRecord.find({ startAt: { $gte: from, $lte: to }, archivedAt: null }).lean(),
  ]);
  const low = items.filter((item) => item.quantityOnHand - item.quantityReserved - item.quantityCheckedOut <= item.reorderLevel);
  const bookings = await Booking.find({ _id: { $in: events.map((event) => event.bookingId) } }).lean();
  const revenue = bookings.reduce((sum, booking) => sum + (booking.agreedAmountCents || 0), 0);
  const direct = costs.reduce((sum, cost) => sum + cost.amountCents, 0) + vendors.reduce((sum, vendor) => sum + (vendor.agreedCostCents || 0), 0);
  return {
    movements,
    low,
    vendorSpendCents: vendors.reduce((sum, vendor) => sum + (vendor.agreedCostCents || 0), 0),
    directCents: direct,
    contribution: eventContribution(revenue, direct),
    reservations: await InventoryReservation.countDocuments({ updatedAt: { $gte: from, $lte: to } }),
    events: events.length,
    cancelled: events.filter((event) => event.status === "cancelled").length,
    completed: events.filter((event) => event.status === "completed" || event.status === "closed").length,
    averageGuests: events.length ? events.reduce((sum, event) => sum + (event.guestCount || 0), 0) / events.length : 0,
  };
}

export async function usersForAudit() {
  await connectDB();
  return User.find().select("name email role").lean();
}

void User;
