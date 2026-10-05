import type { ClientSession } from "mongoose";
import { priceQuotation, requiredDeposit, summarizePayments } from "../../domain/money";
import { eventRange } from "../../domain/operations";
import type { BookingInput, QuoteInput } from "../../domain/schemas";
import {
  quotationEditMode,
  transitionBooking,
  transitionQuote,
  type QuoteStatus,
} from "../../domain/states";
import type { SessionUser } from "../auth";
import { onBookingConfirmed, onQuoteSent } from "../automation";
import { recordActivity, recordAudit } from "../audit";
import { connectDB, sessionOptions, withTransaction } from "../db";
import { AppError } from "../errors";
import {
  Booking,
  Client,
  Enquiry,
  EventRecord,
  Payment,
  Quotation,
  QuotationVersion,
  Space,
} from "../models";
import { sid } from "../parse";
import { nextReference } from "../references";
import { getAutomation, getCommercial } from "../settings";
import { can } from "../../domain/permissions";

function priced(input: QuoteInput, taxRate: number) {
  return priceQuotation(
    input.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: Math.round(line.unitPriceShillings * 100),
      discountCents: Math.round((line.discountShillings || 0) * 100),
      taxRate: line.taxRate ?? taxRate,
    })),
    Math.round((input.headerDiscountShillings || 0) * 100),
  );
}

async function conflictingBookings(spaceIds: string[], start: Date, end: Date, excludeId?: string, session?: ClientSession | null) {
  const now = new Date();
  const filter = {
    archivedAt: null,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    spaceIds: { $in: spaceIds },
    startAt: { $lt: end },
    endAt: { $gt: start },
    $or: [
      { status: { $in: ["awaiting_deposit", "confirmed"] } },
      { status: "tentative", holdExpiresAt: { $gt: now } },
    ],
  };
  const query = Booking.find(filter).select("reference status startAt endAt spaceIds");
  if (session) query.session(session);
  return query.lean();
}

export async function assertSpaceAvailable(spaceIds: string[], start: Date, end: Date, excludeId?: string, session?: ClientSession | null) {
  const conflicts = await conflictingBookings(spaceIds, start, end, excludeId, session);
  if (conflicts.length > 0) {
    throw new AppError(`That time overlaps ${conflicts.map((item) => item.reference).join(", ")}. Confirmed bookings and active holds cannot double-book a space.`);
  }
}

export async function createQuotation(actor: SessionUser, input: QuoteInput) {
  await connectDB();
  const enquiry = await Enquiry.findOne({ _id: input.enquiryId, archivedAt: null });
  if (!enquiry) throw new AppError("Enquiry not found.", "not_found");
  const commercial = await getCommercial();
  const totals = priced(input, commercial.taxEnabled ? commercial.defaultTaxRate : 0);
  const reference = await nextReference("QUO");
  const quote = await Quotation.create({
    reference,
    clientId: enquiry.clientId,
    enquiryId: enquiry._id,
    spaceIds: input.spaceIds?.length ? input.spaceIds : enquiry.spaceIds,
    status: "draft",
    currentVersion: 1,
    currency: "KES",
    notes: input.notes || "",
    terms: input.terms || commercial.defaultTerms,
    ownerId: enquiry.ownerId || actor.id,
    lastActivityAt: new Date(),
    createdBy: actor.id,
  });
  await QuotationVersion.create({
    quotationId: quote._id,
    version: 1,
    lines: totals.lines.map((line, index) => ({
      ...line,
      serviceItemId: input.lines[index].serviceItemId || undefined,
    })),
    subtotalCents: totals.subtotalCents,
    taxCents: totals.taxCents,
    discountCents: totals.discountCents,
    headerDiscountCents: totals.headerDiscountCents,
    totalCents: totals.totalCents,
    status: "draft",
    createdBy: actor.id,
  });
  await recordAudit({
    actorId: actor.id,
    action: "quotation.create",
    entityType: "quotation",
    entityId: sid(quote._id),
    newValue: { reference, version: 1, totalCents: totals.totalCents },
  });
  await recordActivity({
    entityType: "quotation",
    entityId: sid(quote._id),
    actorId: actor.id,
    kind: "created",
    summary: `${reference} V1 drafted at the current catalogue prices.`,
  });
  await Enquiry.updateOne({ _id: enquiry._id }, { lastActivityAt: new Date() });
  return sid(quote._id);
}

export async function reviseQuotation(actor: SessionUser, quotationId: string, input: QuoteInput, reason: string) {
  await connectDB();
  const quote = await Quotation.findOne({ _id: quotationId, archivedAt: null });
  if (!quote) throw new AppError("Quotation not found.", "not_found");
  const commercial = await getCommercial();
  const totals = priced(input, commercial.taxEnabled ? commercial.defaultTaxRate : 0);
  const current = await QuotationVersion.findOne({ quotationId: quote._id, version: quote.currentVersion });
  if (!current) throw new AppError("Quotation version is missing.");
  if (quotationEditMode(quote.status as QuoteStatus) === "update_draft") {
    const previous = { totalCents: current.totalCents, lines: current.lines };
    current.lines = totals.lines.map((line, index) => ({
      ...line,
      serviceItemId: input.lines[index].serviceItemId || undefined,
    }));
    current.subtotalCents = totals.subtotalCents;
    current.taxCents = totals.taxCents;
    current.discountCents = totals.discountCents;
    current.headerDiscountCents = totals.headerDiscountCents;
    current.totalCents = totals.totalCents;
    current.reason = reason;
    await current.save();
    quote.notes = input.notes || quote.notes;
    quote.terms = input.terms || quote.terms;
    quote.spaceIds = input.spaceIds?.length ? input.spaceIds : quote.spaceIds;
    quote.lastActivityAt = new Date();
    await quote.save();
    await recordAudit({
      actorId: actor.id,
      action: "quotation.revise",
      entityType: "quotation",
      entityId: sid(quote._id),
      previousValue: previous,
      newValue: { version: current.version, totalCents: totals.totalCents },
      reason,
    });
    return sid(quote._id);
  }
  const version = quote.currentVersion + 1;
  await QuotationVersion.create({
    quotationId: quote._id,
    version,
    lines: totals.lines.map((line, index) => ({
      ...line,
      serviceItemId: input.lines[index].serviceItemId || undefined,
    })),
    subtotalCents: totals.subtotalCents,
    taxCents: totals.taxCents,
    discountCents: totals.discountCents,
    headerDiscountCents: totals.headerDiscountCents,
    totalCents: totals.totalCents,
    status: "draft",
    reason,
    createdBy: actor.id,
  });
  const previousStatus = quote.status;
  quote.currentVersion = version;
  quote.status = "draft";
  quote.notes = input.notes || quote.notes;
  quote.spaceIds = input.spaceIds?.length ? input.spaceIds : quote.spaceIds;
  quote.lastActivityAt = new Date();
  quote.needsFollowUp = false;
  await quote.save();
  await recordAudit({
    actorId: actor.id,
    action: "quotation.revise",
    entityType: "quotation",
    entityId: sid(quote._id),
    previousValue: { version: version - 1, status: previousStatus },
    newValue: { version, status: "draft", totalCents: totals.totalCents },
    reason,
  });
  await recordActivity({
    entityType: "quotation",
    entityId: sid(quote._id),
    actorId: actor.id,
    kind: "system",
    summary: `${quote.reference} V${version} opened. Earlier versions stay on the record.`,
  });
  return sid(quote._id);
}

export async function setQuotationStatus(actor: SessionUser, id: string, status: QuoteStatus, reason?: string) {
  await connectDB();
  const quote = await Quotation.findOne({ _id: id, archivedAt: null });
  if (!quote) throw new AppError("Quotation not found.", "not_found");
  const result = transitionQuote(quote.status as QuoteStatus, status);
  if (!result.ok) throw new AppError(result.error);
  const version = await QuotationVersion.findOne({ quotationId: quote._id, version: quote.currentVersion });
  if (!version) throw new AppError("Quotation version is missing.");
  const previous = quote.status;
  if (status === "sent") {
    const commercial = await getCommercial();
    quote.validUntil = new Date(Date.now() + commercial.quotationValidityDays * 24 * 60 * 60 * 1000);
    const previousVersions = await QuotationVersion.find({
      quotationId: quote._id,
      version: { $ne: version.version },
      status: { $in: ["sent", "viewed", "accepted", "draft"] },
    });
    for (const older of previousVersions) {
      if (older.status === "draft") continue;
      older.status = "superseded";
      await older.save();
    }
  }
  quote.status = status;
  quote.lastActivityAt = new Date();
  version.status = status;
  await quote.save();
  await version.save();
  await recordAudit({
    actorId: actor.id,
    action: "quotation.status",
    entityType: "quotation",
    entityId: id,
    previousValue: { status: previous, version: version.version, totalCents: version.totalCents },
    newValue: { status, version: version.version, totalCents: version.totalCents },
    reason: reason || "",
  });
  await recordActivity({
    entityType: "quotation",
    entityId: id,
    actorId: actor.id,
    kind: "stage",
    summary: `${quote.reference} V${version.version} is ${status}.`,
  });
  if (quote.enquiryId) await Enquiry.updateOne({ _id: quote.enquiryId }, { lastActivityAt: new Date() });
  if (status === "sent") await onQuoteSent(quote, actor.id);
  if (status === "accepted" && quote.enquiryId) {
    const enquiry = await Enquiry.findById(quote.enquiryId);
    if (enquiry && !["confirmed", "lost", "cancelled"].includes(enquiry.stage)) {
      const previousStage = enquiry.stage;
      enquiry.stage = "negotiation";
      enquiry.lastActivityAt = new Date();
      await enquiry.save();
      await recordAudit({
        actorId: actor.id,
        action: "enquiry.stage",
        entityType: "enquiry",
        entityId: sid(enquiry._id),
        previousValue: { stage: previousStage },
        newValue: { stage: "negotiation" },
        reason: "Quotation accepted",
      });
    }
  }
}

export async function listQuotations() {
  await connectDB();
  const quotes = await Quotation.find({ archivedAt: null }).sort({ updatedAt: -1 }).limit(200).lean();
  const versions = await QuotationVersion.find({ quotationId: { $in: quotes.map((quote) => quote._id) } }).lean();
  return quotes.map((quote) => ({
    ...quote,
    version: versions.find((item) => String(item.quotationId) === String(quote._id) && item.version === quote.currentVersion) || null,
  }));
}

export async function getQuotation(id: string) {
  await connectDB();
  const quote = await Quotation.findOne({ _id: id, archivedAt: null }).lean();
  if (!quote) throw new AppError("Quotation not found.", "not_found");
  const [versions, client, enquiry, spaces] = await Promise.all([
    QuotationVersion.find({ quotationId: quote._id }).sort({ version: 1 }).lean(),
    Client.findById(quote.clientId).lean(),
    quote.enquiryId ? Enquiry.findById(quote.enquiryId).lean() : null,
    Space.find({ _id: { $in: quote.spaceIds || [] } }).lean(),
  ]);
  return { quote, versions, client, enquiry, spaces };
}

async function syncBookingMoney(bookingId: string, session?: ClientSession | null) {
  const query = Payment.find({ bookingId });
  if (session) query.session(session);
  const payments = await query.lean();
  const bookingQuery = Booking.findById(bookingId);
  if (session) bookingQuery.session(session);
  const booking = await bookingQuery;
  if (!booking) return null;
  const summary = summarizePayments(
    payments.map((payment) => ({ type: payment.type, amountCents: payment.amountCents })),
    booking.agreedAmountCents,
  );
  booking.depositReceivedCents = summary.depositCents;
  booking.amountReceivedCents = summary.netCents;
  booking.outstandingCents = summary.outstandingCents;
  booking.financialStatus = summary.financialStatus;
  await booking.save(sessionOptions(session));
  return booking;
}

export async function createBooking(actor: SessionUser, input: BookingInput) {
  await connectDB();
  const client = await Client.findOne({ _id: input.clientId, archivedAt: null });
  if (!client) throw new AppError("Client not found.", "not_found");
  const { start, end } = eventRange(input.eventDate, input.startTime, input.endTime, input.endDate || undefined);
  let quotationVersion: number | undefined;
  if (input.quotationId) {
    const quote = await Quotation.findById(input.quotationId);
    if (!quote) throw new AppError("Quotation not found.", "not_found");
    const version = await QuotationVersion.findOne({ quotationId: quote._id, version: quote.currentVersion });
    if (!version || version.status !== "accepted") {
      throw new AppError("Create a booking from an accepted quotation version. Drafts and sent quotes are not a commitment.");
    }
    quotationVersion = version.version;
  }
  const commercial = await getCommercial();
  const agreed = Math.round(input.agreedShillings * 100);
  const depositRequired = requiredDeposit(agreed, commercial.deposit);
  const holdHours = commercial.holdDurationHours;
  const status = input.mode === "hold" ? "tentative" : depositRequired > 0 ? "awaiting_deposit" : "confirmed";
  await assertSpaceAvailable(input.spaceIds, start, end);
  const reference = await nextReference("BKG");
  const booking = await Booking.create({
    reference,
    clientId: client._id,
    enquiryId: input.enquiryId || undefined,
    quotationId: input.quotationId || undefined,
    quotationVersion,
    eventDate: start,
    startAt: start,
    endAt: end,
    spaceIds: input.spaceIds,
    guestCount: input.guestCount,
    agreedAmountCents: agreed,
    depositRequiredCents: depositRequired,
    outstandingCents: agreed,
    financialStatus: "unpaid",
    paymentDeadline: input.paymentDeadline ? new Date(input.paymentDeadline) : undefined,
    specialConditions: input.specialConditions || "",
    ownerId: input.ownerId || actor.id,
    status,
    holdExpiresAt: status === "tentative" ? new Date(Date.now() + holdHours * 60 * 60 * 1000) : undefined,
    createdBy: actor.id,
  });
  await recordAudit({
    actorId: actor.id,
    action: "booking.create",
    entityType: "booking",
    entityId: sid(booking._id),
    newValue: { reference, status, agreedAmountCents: agreed, depositRequiredCents: depositRequired },
  });
  await recordActivity({
    entityType: "booking",
    entityId: sid(booking._id),
    actorId: actor.id,
    kind: "created",
    summary: status === "tentative" ? `${reference} placed as a hold. It will not confirm itself.` : `${reference} created.`,
  });
  if (input.enquiryId && status === "awaiting_deposit") {
    const enquiry = await Enquiry.findById(input.enquiryId);
    if (enquiry && enquiry.stage !== "deposit_pending" && enquiry.stage !== "confirmed") {
      const previous = enquiry.stage;
      enquiry.stage = "deposit_pending";
      enquiry.lastActivityAt = new Date();
      await enquiry.save();
      await recordAudit({
        actorId: actor.id,
        action: "enquiry.stage",
        entityType: "enquiry",
        entityId: sid(enquiry._id),
        previousValue: { stage: previous },
        newValue: { stage: "deposit_pending" },
        reason: "Booking awaiting deposit",
      });
      const { onDepositPending } = await import("../automation");
      await onDepositPending(enquiry, actor.id);
    }
  }
  if (status === "confirmed") await confirmBooking(actor, sid(booking._id), {});
  return sid(booking._id);
}

export async function confirmBooking(actor: SessionUser, id: string, options: { overrideDeposit?: boolean; reason?: string }) {
  await connectDB();
  return withTransaction(async (session) => {
    const query = Booking.findOne({ _id: id, archivedAt: null });
    if (session) query.session(session);
    const booking = await query;
    if (!booking) throw new AppError("Booking not found.", "not_found");
    const transition = transitionBooking(booking.status, "confirmed");
    if (!transition.ok) throw new AppError(transition.error);
    await assertSpaceAvailable(booking.spaceIds.map(sid), booking.startAt, booking.endAt, sid(booking._id), session);
    const fresh = await syncBookingMoney(sid(booking._id), session);
    if (!fresh) throw new AppError("Booking not found.", "not_found");
    if (fresh.depositReceivedCents < fresh.depositRequiredCents) {
      if (!options.overrideDeposit) {
        throw new AppError("The configured deposit has not been received. Confirming now needs an authorised override and a reason.");
      }
      if (!can(actor.role, "bookings.override_deposit")) {
        throw new AppError("You cannot override the deposit rule.", "forbidden");
      }
      if (!options.reason || options.reason.trim().length < 3) {
        throw new AppError("Give a reason for confirming before the deposit is received.");
      }
    }
    const previous = fresh.status;
    fresh.status = "confirmed";
    fresh.holdExpiresAt = undefined;
    await fresh.save(sessionOptions(session));
    const eventQuery = EventRecord.findOne({ bookingId: fresh._id });
    if (session) eventQuery.session(session);
    let event = await eventQuery;
    if (!event) {
      const automation = await getAutomation();
      const enquiryQuery = fresh.enquiryId ? Enquiry.findById(fresh.enquiryId) : null;
      if (enquiryQuery && session) enquiryQuery.session(session);
      const enquiry = enquiryQuery ? await enquiryQuery : null;
      const reference = await nextReference("HQ", session);
      event = await EventRecord.create(
        [
          {
            reference,
            bookingId: fresh._id,
            clientId: fresh.clientId,
            enquiryId: fresh.enquiryId,
            eventTypeId: enquiry?.eventTypeId,
            startAt: fresh.startAt,
            endAt: fresh.endAt,
            spaceIds: fresh.spaceIds,
            guestCount: fresh.guestCount,
            ownerId: fresh.ownerId,
            status: "planning",
            requirements: enquiry?.requirements ? [{ label: "Client requirements", value: enquiry.requirements }] : [],
            notes: fresh.specialConditions || "",
            closeout: {
              items: automation.closeoutChecklist.map((item) => ({ ...item, done: false })),
              notes: "",
            },
          },
        ],
        sessionOptions(session),
      ).then((docs) => docs[0]);
    }
    if (fresh.enquiryId) {
      const enquiryQuery = Enquiry.findById(fresh.enquiryId);
      if (session) enquiryQuery.session(session);
      const enquiry = await enquiryQuery;
      if (enquiry && enquiry.stage !== "confirmed") {
        const previousStage = enquiry.stage;
        enquiry.stage = "confirmed";
        enquiry.lastActivityAt = new Date();
        await enquiry.save(sessionOptions(session));
        await recordAudit({
          actorId: actor.id,
          action: "enquiry.stage",
          entityType: "enquiry",
          entityId: sid(enquiry._id),
          previousValue: { stage: previousStage },
          newValue: { stage: "confirmed" },
          reason: "Booking confirmed",
        }, session);
      }
    }
    await recordAudit({
      actorId: actor.id,
      action: "booking.confirm",
      entityType: "booking",
      entityId: sid(fresh._id),
      previousValue: { status: previous },
      newValue: { status: "confirmed", eventId: sid(event._id) },
      reason: options.reason || "",
    }, session);
    await recordActivity({
      entityType: "booking",
      entityId: sid(fresh._id),
      actorId: actor.id,
      summary: `${fresh.reference} confirmed. Event ${event.reference} is now the working file.`,
    }, session);
    await onBookingConfirmed(event, actor.id);
    return { bookingId: sid(fresh._id), eventId: sid(event._id) };
  });
}

export async function cancelBooking(actor: SessionUser, id: string, reason: string) {
  await connectDB();
  const booking = await Booking.findOne({ _id: id, archivedAt: null });
  if (!booking) throw new AppError("Booking not found.", "not_found");
  const result = transitionBooking(booking.status, "cancelled");
  if (!result.ok) throw new AppError(result.error);
  const previous = booking.status;
  booking.status = "cancelled";
  booking.cancellationReason = reason;
  await booking.save();
  await EventRecord.updateOne({ bookingId: booking._id }, { status: "cancelled" });
  await recordAudit({
    actorId: actor.id,
    action: "booking.cancel",
    entityType: "booking",
    entityId: id,
    previousValue: { status: previous },
    newValue: { status: "cancelled" },
    reason,
  });
  await recordActivity({
    entityType: "booking",
    entityId: id,
    actorId: actor.id,
    summary: `${booking.reference} cancelled. ${reason}`,
  });
}

export async function listBookings() {
  await connectDB();
  return Booking.find({ archivedAt: null }).sort({ startAt: 1 }).limit(300).lean();
}

export async function getBooking(id: string) {
  await connectDB();
  const booking = await Booking.findOne({ _id: id, archivedAt: null }).lean();
  if (!booking) throw new AppError("Booking not found.", "not_found");
  const [client, spaces, payments, event, quote] = await Promise.all([
    Client.findById(booking.clientId).lean(),
    Space.find({ _id: { $in: booking.spaceIds } }).lean(),
    Payment.find({ bookingId: booking._id }).sort({ paidAt: 1 }).lean(),
    EventRecord.findOne({ bookingId: booking._id }).lean(),
    booking.quotationId ? Quotation.findById(booking.quotationId).lean() : null,
  ]);
  return { booking, client, spaces, payments, event, quote };
}

export async function calendarItems(start: Date, end: Date) {
  await connectDB();
  const [bookings, visits] = await Promise.all([
    Booking.find({
      archivedAt: null,
      status: { $ne: "cancelled" },
      startAt: { $lt: end },
      endAt: { $gt: start },
    }).lean(),
    (await import("../models")).SiteVisit.find({
      archivedAt: null,
      status: { $in: ["scheduled", "rescheduled"] },
      scheduledAt: { $gte: start, $lt: end },
    }).lean(),
  ]);
  return { bookings, visits };
}

export async function recordPaymentAndMaybeConfirm(
  actor: SessionUser,
  input: {
    clientId: string;
    bookingId: string;
    type: "deposit" | "balance" | "additional_charge" | "refund";
    amountCents: number;
    methodId: string;
    paidAt: Date;
    reference?: string;
    notes?: string;
    idempotencyKey: string;
  },
) {
  await connectDB();
  const existing = await Payment.findOne({ idempotencyKey: input.idempotencyKey });
  if (existing) return { paymentId: sid(existing._id), duplicate: true };
  const booking = await Booking.findOne({ _id: input.bookingId, archivedAt: null });
  if (!booking) throw new AppError("Booking not found.", "not_found");
  if (sid(booking.clientId) !== input.clientId) throw new AppError("That payment does not belong to this client.");
  if (input.type === "refund") {
    const summary = summarizePayments(
      (await Payment.find({ bookingId: booking._id }).lean()).map((payment) => ({
        type: payment.type,
        amountCents: payment.amountCents,
      })),
      booking.agreedAmountCents,
    );
    if (input.amountCents > summary.netCents) throw new AppError("Refund cannot exceed the net amount collected.");
  }
  const event = await EventRecord.findOne({ bookingId: booking._id }).select("_id");
  const previous = {
    financialStatus: booking.financialStatus,
    outstandingCents: booking.outstandingCents,
  };
  let paymentId = "";
  try {
    const payment = await Payment.create({
      ...input,
      eventId: event?._id,
      recordedBy: actor.id,
      reference: input.reference || "",
      notes: input.notes || "",
    });
    paymentId = sid(payment._id);
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === 11000) {
      const duplicate = await Payment.findOne({ idempotencyKey: input.idempotencyKey });
      return { paymentId: sid(duplicate?._id), duplicate: true };
    }
    throw error;
  }
  const updated = await syncBookingMoney(sid(booking._id));
  await recordAudit({
    actorId: actor.id,
    action: "payment.record",
    entityType: "payment",
    entityId: paymentId,
    previousValue: previous,
    newValue: {
      type: input.type,
      amountCents: input.amountCents,
      financialStatus: updated?.financialStatus,
      outstandingCents: updated?.outstandingCents,
    },
  });
  await recordActivity({
    entityType: "booking",
    entityId: sid(booking._id),
    actorId: actor.id,
    summary: `Recorded ${input.type.replaceAll("_", " ")} on ${booking.reference}.`,
  });
  if (
    updated &&
    (updated.status === "tentative" || updated.status === "awaiting_deposit") &&
    updated.depositReceivedCents >= updated.depositRequiredCents &&
    updated.depositRequiredCents > 0
  ) {
    await confirmBooking(actor, sid(updated._id), {});
  }
  return { paymentId, duplicate: false };
}
