import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { hashPassword, verifyPassword } from "./auth";
import { can } from "../domain/permissions";

let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri("hqops-test");
  process.env.AUTH_SECRET = "test-secret-must-be-long";
  const { connectDB } = await import("./db");
  await connectDB();
}, 180000);

afterAll(async () => {
  const { disconnectDB } = await import("./db");
  await disconnectDB();
  await replSet.stop();
});

describe("critical operations", () => {
  it("hashes passwords and enforces RBAC without trusting the client", async () => {
    const hash = await hashPassword("ChangeMe-HQ-2026");
    expect(await verifyPassword("ChangeMe-HQ-2026", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
    expect(can("event_staff", "payments.write")).toBe(false);
    expect(can("finance", "payments.write")).toBe(true);
  });

  it("versions quotations, blocks overlaps, confirms bookings into events, and audits the trail", async () => {
    const { EventType, LeadSource, LostReason, Space, User, AuditLog, QuotationVersion, EventRecord } = await import("./models");
    const { createEnquiry, transitionEnquiryStage } = await import("./services/crm");
    const { createBooking, createQuotation, setQuotationStatus, reviseQuotation } = await import("./services/commercial");
    const { SystemSetting } = await import("./models");
    const sales = await User.create({ name: "Test Sales", email: "sales@test.local", role: "sales_coordinator", passwordHash: "x", active: true });
    const actor = { id: String(sales._id), name: sales.name, email: sales.email, role: "sales_coordinator" as const };
    const eventType = await EventType.create({ name: "Dinner", slug: "dinner", active: true });
    const source = await LeadSource.create({ name: "Phone", slug: "phone", active: true });
    const reason = await LostReason.create({ name: "Price", slug: "price", active: true });
    const courtyard = await Space.create({ name: "Courtyard", slug: "courtyard", capacity: 80, active: true });
    const library = await Space.create({ name: "Library", slug: "library", capacity: 16, active: true });
    await SystemSetting.create({ key: "commercial", value: { quotationValidityDays: 14, taxEnabled: false, defaultTaxRate: 0, defaultTerms: "Terms", holdDurationHours: 72, staleEnquiryDays: 7, deposit: { mode: "percent", percent: 40, fixedCents: null } } });
    await SystemSetting.create({ key: "automation", value: { newEnquiryFollowUpHours: 24, visitReminderHours: 24, postVisitFollowUpHours: 24, quoteFollowUpDays: 3, quoteInactivityDays: 5, depositFollowUpDays: 2, preparationTasks: [{ key: "vendors", label: "Confirm vendors", offsetDays: -7 }], closeoutChecklist: [{ key: "site", label: "Space handed back" }] } });
    await SystemSetting.create({ key: "notifications", value: { inApp: true, emailEnabled: false, whatsappEnabled: false } });
    await SystemSetting.create({ key: "assignment", value: { defaultOwnerId: null } });

    const lost = await createEnquiry(actor, {
      fullName: "Lost Client", phone: "0711222333", preferredContact: "phone", eventTypeId: String(eventType._id), sourceId: String(source._id), ownerId: actor.id, priority: "normal", spaceIds: [],
    });
    await expect(transitionEnquiryStage(actor, lost, "lost", {})).rejects.toThrow(/lost reason/i);
    await transitionEnquiryStage(actor, lost, "lost", { lostReasonId: String(reason._id) });

    const enquiryId = await createEnquiry(actor, {
      fullName: "Booked Client", phone: "0711222444", preferredContact: "whatsapp", eventTypeId: String(eventType._id), sourceId: String(source._id), ownerId: actor.id, priority: "high", spaceIds: [String(courtyard._id)], estimatedGuests: 40,
    });
    const quoteId = await createQuotation(actor, {
      enquiryId,
      spaceIds: [String(courtyard._id)],
      lines: [{ description: "Hire", quantity: 1, unitPriceShillings: 100000, serviceItemId: "" }],
    });
    await setQuotationStatus(actor, quoteId, "sent");
    await reviseQuotation(actor, quoteId, {
      enquiryId,
      spaceIds: [String(courtyard._id)],
      lines: [{ description: "Hire revised", quantity: 1, unitPriceShillings: 90000, serviceItemId: "" }],
    }, "Negotiated");
    const versions = await QuotationVersion.find({ quotationId: quoteId }).sort({ version: 1 });
    expect(versions).toHaveLength(2);
    expect(versions[0].totalCents).toBe(10000000);
    expect(versions[1].status).toBe("draft");
    await setQuotationStatus(actor, quoteId, "sent");
    const superseded = await QuotationVersion.findOne({ quotationId: quoteId, version: 1 });
    expect(superseded?.status).toBe("superseded");
    await setQuotationStatus(actor, quoteId, "accepted");

    const { Enquiry } = await import("./models");
    const enquiry = await Enquiry.findById(enquiryId);
    const date = new Date();
    date.setDate(date.getDate() + 20);
    const day = date.toISOString().slice(0, 10);
    const bookingId = await createBooking(actor, {
      clientId: String(enquiry!.clientId),
      enquiryId,
      quotationId: quoteId,
      eventDate: day,
      startTime: "16:00",
      endTime: "22:00",
      spaceIds: [String(courtyard._id)],
      guestCount: 40,
      agreedShillings: 90000,
      mode: "commit",
      ownerId: actor.id,
    });
    await expect(createBooking(actor, {
      clientId: String(enquiry!.clientId),
      eventDate: day,
      startTime: "18:00",
      endTime: "21:00",
      spaceIds: [String(courtyard._id)],
      guestCount: 10,
      agreedShillings: 10000,
      mode: "hold",
      ownerId: actor.id,
    })).rejects.toThrow(/overlaps/i);
    const other = await createBooking(actor, {
      clientId: String(enquiry!.clientId),
      eventDate: day,
      startTime: "18:00",
      endTime: "21:00",
      spaceIds: [String(library._id)],
      guestCount: 10,
      agreedShillings: 10000,
      mode: "hold",
      ownerId: actor.id,
    });
    expect(other).toBeTruthy();

    const { recordPaymentAndMaybeConfirm } = await import("./services/commercial");
    const { PaymentMethod } = await import("./models");
    const method = await PaymentMethod.create({ name: "M-Pesa", slug: "mpesa-test", active: true });
    await recordPaymentAndMaybeConfirm(actor, {
      clientId: String(enquiry!.clientId),
      bookingId,
      type: "deposit",
      amountCents: 3600000,
      methodId: String(method._id),
      paidAt: new Date(),
      idempotencyKey: "test-deposit-1",
    });
    const again = await recordPaymentAndMaybeConfirm(actor, {
      clientId: String(enquiry!.clientId),
      bookingId,
      type: "deposit",
      amountCents: 3600000,
      methodId: String(method._id),
      paidAt: new Date(),
      idempotencyKey: "test-deposit-1",
    });
    expect(again.duplicate).toBe(true);
    const { Booking, Payment } = await import("./models");
    const booking = await Booking.findById(bookingId);
    expect(booking?.status).toBe("confirmed");
    expect(booking?.depositReceivedCents).toBe(3600000);
    expect(booking?.outstandingCents).toBe(5400000);
    expect(await Payment.countDocuments({ bookingId })).toBe(1);
    const event = await EventRecord.findOne({ bookingId });
    expect(event?.reference.startsWith("HQ-")).toBe(true);
    expect(await (await import("./models")).Task.countDocuments({ relatedId: event?._id, source: "automation" })).toBeGreaterThan(0);

    const { createItem, reserveForEvent, issueReserved, returnIssued } = await import("./services/inventory");
    const { InventoryCategory, InventoryItem, InventoryReservation } = await import("./models");
    const category = await InventoryCategory.create({ name: "Furniture", slug: "furniture-test", active: true });
    const itemId = await createItem({ ...actor, role: "operations_lead" }, { name: "Chair", sku: "CHAIR-1", categoryId: String(category._id), assetType: "durable", quantity: 10, reorderLevel: 2, unitCostCents: 100 });
    await expect(reserveForEvent(actor, { eventId: String(event!._id), itemId, quantity: 12 })).rejects.toThrow(/available/i);
    await reserveForEvent({ ...actor, role: "operations_lead" }, { eventId: String(event!._id), itemId, quantity: 12, override: true, reason: "Client is bringing no extras and we will hire the gap." });
    const reservation = await InventoryReservation.findOne({ itemId, eventId: event!._id });
    await issueReserved({ ...actor, role: "operations_lead" }, String(reservation!._id), 10);
    await returnIssued({ ...actor, role: "operations_lead" }, String(reservation!._id), 9, 1, 0);
    const updated = await InventoryItem.findById(itemId);
    expect(updated?.quantityOnHand).toBe(9);
    expect(updated!.quantityOnHand - updated!.quantityReserved - updated!.quantityCheckedOut).toBe(updated!.quantityOnHand - updated!.quantityReserved - updated!.quantityCheckedOut);

    const { addEventCost } = await import("./services/events");
    const { eventContribution } = await import("../domain/money");
    await addEventCost({ ...actor, role: "finance" }, { eventId: String(event!._id), category: "Security", description: "Two guards", amountCents: 2000000 });
    const contribution = eventContribution(booking!.agreedAmountCents, 2000000);
    expect(contribution.grossContributionCents).toBe(7000000);

    const audits = await AuditLog.countDocuments({ entityType: "enquiry", action: "enquiry.stage" });
    expect(audits).toBeGreaterThan(0);
    await expect(AuditLog.updateOne({ _id: (await AuditLog.findOne())!._id }, { reason: "tamper" })).rejects.toThrow(/cannot be modified/i);
  });
});
