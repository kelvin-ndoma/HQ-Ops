import mongoose from "mongoose";
import { DEFAULT_AUTOMATION, DEFAULT_COMMERCIAL, DEFAULT_NOTIFICATIONS, DEFAULT_ORGANIZATION, DEMO_APPROVAL_THRESHOLDS, INITIAL_EVENT_TYPES, INITIAL_INVENTORY_CATEGORIES, INITIAL_LOST_REASONS, INITIAL_PAYMENT_METHODS, INITIAL_SOURCES, INITIAL_VENDOR_CATEGORIES } from "../domain/settings";
import { slugify } from "../domain/operations";
import { hashPassword } from "./auth";
import { connectDB, disconnectDB } from "./db";
import {
  EventType,
  InventoryCategory,
  LeadSource,
  LostReason,
  PaymentMethod,
  ServiceItem,
  Space,
  SystemSetting,
  User,
  VendorCategory,
} from "./models";
import type { SessionUser } from "./auth";
import type { Role } from "../domain/permissions";
import { createEnquiry, createVisit, transitionEnquiryStage, updateVisit } from "./services/crm";
import { createBooking, createQuotation, recordPaymentAndMaybeConfirm, setQuotationStatus } from "./services/commercial";
import { addEventCost, assignVendor, createProcurement, createVendor, setProcurementStatus, setVendorAssignment } from "./services/events";
import { createItem, reserveForEvent } from "./services/inventory";
import { EventRecord } from "./models";

function iso(daysFromNow: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

async function catalog(model: typeof EventType, names: string[]) {
  const docs = [];
  for (const [index, name] of names.entries()) {
    docs.push(await model.create({ name, slug: slugify(name), sort: index, active: true }));
  }
  return docs;
}

async function main() {
  await connectDB();
  const existing = await User.countDocuments();
  if (existing > 0 && process.env.SEED_RESET !== "true") {
    console.log("HQ already has users. Run with SEED_RESET=true to rebuild the development data.");
    await disconnectDB();
    return;
  }
  if (process.env.SEED_RESET === "true") await mongoose.connection.dropDatabase();

  const password = process.env.SEED_PASSWORD || "ChangeMe-HQ-2026";
  const people: { name: string; email: string; role: Role; phone: string }[] = [
    { name: "Amina Hassan", email: "amina@hq.local", role: "leadership", phone: "0711000001" },
    { name: "David Otieno", email: "david@hq.local", role: "operations_lead", phone: "0711000002" },
    { name: "Wanjiku Kariuki", email: "wanjiku@hq.local", role: "sales_coordinator", phone: "0711000003" },
    { name: "Brian Mwangi", email: "brian@hq.local", role: "event_staff", phone: "0711000004" },
    { name: "Faith Chebet", email: "faith@hq.local", role: "finance", phone: "0711000005" },
    { name: "Samuel Kimani", email: "samuel@hq.local", role: "administrator", phone: "0711000006" },
  ];
  const users: { _id: unknown; name: string; email: string; role: string }[] = [];
  for (const person of people) {
    users.push(await User.create({ ...person, passwordHash: await hashPassword(password), active: true }));
  }
  const asUser = (email: string): SessionUser => {
    const user = users.find((item) => item.email === email)!;
    return { id: String(user._id), name: user.name, email: user.email, role: user.role as Role };
  };
  const sales = asUser("wanjiku@hq.local");
  const ops = asUser("david@hq.local");
  const finance = asUser("faith@hq.local");

  await SystemSetting.create({
    key: "organization",
    value: {
      ...DEFAULT_ORGANIZATION,
      name: "HQ",
      legalName: "HQ Nairobi",
      address: "James Gichuru Road",
      city: "Nairobi",
      phone: "+254 700 000 000",
      email: "events@hq.local",
      website: "https://hq.example",
    },
  });
  await SystemSetting.create({
    key: "commercial",
    value: { ...DEFAULT_COMMERCIAL, deposit: { mode: "percent", percent: 40, fixedCents: null }, approvals: DEMO_APPROVAL_THRESHOLDS },
  });
  await SystemSetting.create({ key: "automation", value: DEFAULT_AUTOMATION });
  await SystemSetting.create({ key: "notifications", value: DEFAULT_NOTIFICATIONS });
  await SystemSetting.create({ key: "assignment", value: { defaultOwnerId: sales.id } });

  const eventTypes = await catalog(EventType, INITIAL_EVENT_TYPES);
  const sources = await catalog(LeadSource, INITIAL_SOURCES);
  const lostReasons = await catalog(LostReason, INITIAL_LOST_REASONS);
  const inventoryCategories = await catalog(InventoryCategory, INITIAL_INVENTORY_CATEGORIES);
  const vendorCategories = await catalog(VendorCategory, INITIAL_VENDOR_CATEGORIES);
  const paymentMethods = await catalog(PaymentMethod, INITIAL_PAYMENT_METHODS);
  const spaces: { _id: unknown; name: string }[] = [];
  for (const space of [
    ["The Courtyard", 80, "Open-air evening space"],
    ["The Gallery", 40, "Indoor room for dinners and launches"],
    ["The Library", 16, "Boardroom-style room"],
    ["The Terrace", 60, "Covered terrace"],
  ] as const) {
    spaces.push(await Space.create({ name: space[0], slug: slugify(space[0]), capacity: space[1], description: space[2], active: true, setupNotes: "Confirm layout the day before.", capabilities: ["banquet", "cocktail"] }));
  }
  const services = [
    ["Venue hire — Courtyard", 120000],
    ["Venue hire — Gallery", 85000],
    ["Additional hour", 15000],
    ["Coffee and tea service", 800],
    ["Welcome pastries", 600],
    ["Chair", 0],
  ];
  for (const [name, price] of services) {
    await ServiceItem.create({ name, code: slugify(String(name)), unitPriceCents: Number(price) * 100, unit: String(name).includes("service") || String(name).includes("pastries") || String(name) === "Chair" ? "guest" : "event", category: "Hospitality", active: true, description: "Catalogue price. Change it on the quotation for the actual event." });
  }

  const typeId = (name: string) => String(eventTypes.find((item) => item.name === name)!._id);
  const sourceId = (name: string) => String(sources.find((item) => item.name === name)!._id);
  const spaceId = (name: string) => String(spaces.find((item) => item.name === name)!._id);

  async function enquiry(input: { name: string; phone: string; org?: string; type: string; source: string; date: string; guests: number; value: number; spaces: string[]; stage?: string; lost?: string }) {
    const id = await createEnquiry(sales, {
      fullName: input.name,
      organization: input.org || "",
      phone: input.phone,
      email: "",
      preferredContact: "whatsapp",
      eventTypeId: typeId(input.type),
      preferredDate: input.date,
      startTime: "16:00",
      endTime: "22:00",
      estimatedGuests: input.guests,
      spaceIds: input.spaces.map(spaceId),
      sourceId: sourceId(input.source),
      estimatedValueShillings: input.value,
      nextAction: "Confirm the brief",
      nextActionDate: iso(1),
      priority: "normal",
      requirements: "Share the run of show and any external caterer rules before the site visit.",
      ownerId: sales.id,
    });
    if (input.stage && input.stage !== "new") {
      await transitionEnquiryStage(sales, id, input.stage as "contacted", {
        lostReasonId: input.lost ? String(lostReasons.find((reason) => reason.name === input.lost)!._id) : "",
      });
    }
    return id;
  }

  await enquiry({ name: "Achieng Odhiambo", phone: "0722001001", type: "Birthday", source: "Instagram", date: iso(30), guests: 40, value: 180000, spaces: ["The Gallery"], stage: "new" });
  await enquiry({ name: "Halima Yusuf", phone: "0722001002", type: "Private Dinner", source: "WhatsApp", date: iso(21), guests: 24, value: 140000, spaces: ["The Library"], stage: "contacted" });
  const qualified = await enquiry({ name: "Kamau & Associates", phone: "0722001003", org: "Kamau & Associates", type: "Cocktail", source: "Referral", date: iso(12), guests: 70, value: 260000, spaces: ["The Terrace"], stage: "qualified" });
  await enquiry({ name: "Elena Mwende", phone: "0722001004", org: "Kilimani Collective", type: "Workshop", source: "Website", date: iso(40), guests: 30, value: 90000, spaces: ["The Gallery"], stage: "lost", lost: "Price" });

  const weddingId = await enquiry({ name: "Zuri Wanjala", phone: "0722001005", type: "Wedding", source: "Returning Client", date: iso(18), guests: 90, value: 450000, spaces: ["The Courtyard", "The Terrace"], stage: "qualified" });
  const visitId = await createVisit(sales, { enquiryId: weddingId, scheduledDate: iso(-2), scheduledTime: "11:00", assignedToId: sales.id, spaceIds: [spaceId("The Courtyard")], notes: "Walked the courtyard for a sunset ceremony and dinner." });
  await updateVisit(sales, visitId, { status: "completed", outcome: "interested", outcomeNotes: "They want the courtyard and a clear catering boundary." });
  const quoteId = await createQuotation(sales, {
    enquiryId: weddingId,
    spaceIds: [spaceId("The Courtyard"), spaceId("The Terrace")],
    lines: [
      { description: "Venue hire — Courtyard", quantity: 1, unitPriceShillings: 180000, discountShillings: 0, serviceItemId: "" },
      { description: "Additional hour", quantity: 2, unitPriceShillings: 15000, discountShillings: 0, serviceItemId: "" },
    ],
  });
  await setQuotationStatus(sales, quoteId, "sent");
  const { reviseQuotation } = await import("./services/commercial");
  await reviseQuotation(sales, quoteId, {
    enquiryId: weddingId,
    spaceIds: [spaceId("The Courtyard"), spaceId("The Terrace")],
    lines: [
      { description: "Venue hire — Courtyard and Terrace", quantity: 1, unitPriceShillings: 165000, discountShillings: 0, serviceItemId: "" },
    ],
    headerDiscountShillings: 0,
  }, "Client asked to remove the extra hours.");
  await setQuotationStatus(sales, quoteId, "sent");
  await setQuotationStatus(sales, quoteId, "accepted");
  const bookingId = await createBooking(sales, {
    clientId: String((await (await import("./models")).Enquiry.findById(weddingId))!.clientId),
    enquiryId: weddingId,
    quotationId: quoteId,
    eventDate: iso(18),
    startTime: "15:00",
    endTime: "23:00",
    spaceIds: [spaceId("The Courtyard"), spaceId("The Terrace")],
    guestCount: 90,
    agreedShillings: 165000,
    mode: "commit",
    ownerId: sales.id,
    paymentDeadline: iso(10),
  });
  const mpesa = paymentMethods.find((method) => method.name === "M-Pesa")!;
  const clientId = String((await (await import("./models")).Booking.findById(bookingId))!.clientId);
  await recordPaymentAndMaybeConfirm(finance, {
    clientId,
    bookingId,
    type: "deposit",
    amountCents: 6600000,
    methodId: String(mpesa._id),
    paidAt: new Date(),
    reference: "SFT123456",
    idempotencyKey: "seed-wedding-deposit",
  });

  const corporateId = await enquiry({ name: "Pamoja Credit Union", phone: "0722001006", org: "Pamoja Credit Union", type: "Corporate", source: "Email", date: iso(6), guests: 28, value: 210000, spaces: ["The Library", "The Gallery"], stage: "negotiation" });
  const corporateQuote = await createQuotation(sales, {
    enquiryId: corporateId,
    spaceIds: [spaceId("The Library")],
    lines: [{ description: "Venue hire — Library board session", quantity: 1, unitPriceShillings: 210000, serviceItemId: "" }],
  });
  await setQuotationStatus(sales, corporateQuote, "sent");
  await setQuotationStatus(sales, corporateQuote, "accepted");
  const corporateBooking = await createBooking(sales, {
    clientId: String((await (await import("./models")).Enquiry.findById(corporateId))!.clientId),
    enquiryId: corporateId,
    quotationId: corporateQuote,
    eventDate: iso(6),
    startTime: "08:00",
    endTime: "16:00",
    spaceIds: [spaceId("The Library"), spaceId("The Gallery")],
    guestCount: 28,
    agreedShillings: 210000,
    mode: "commit",
    ownerId: ops.id,
  });
  const corporateClient = String((await (await import("./models")).Booking.findById(corporateBooking))!.clientId);
  await recordPaymentAndMaybeConfirm(finance, {
    clientId: corporateClient,
    bookingId: corporateBooking,
    type: "deposit",
    amountCents: 8400000,
    methodId: String(paymentMethods.find((method) => method.name === "Bank transfer")!._id),
    paidAt: new Date(),
    reference: "FTQ9981",
    idempotencyKey: "seed-corporate-deposit",
  });
  await recordPaymentAndMaybeConfirm(finance, {
    clientId: corporateClient,
    bookingId: corporateBooking,
    type: "balance",
    amountCents: 12600000,
    methodId: String(paymentMethods.find((method) => method.name === "Bank transfer")!._id),
    paidAt: new Date(),
    reference: "FTQ9982",
    idempotencyKey: "seed-corporate-balance",
  });

  await createBooking(sales, {
    clientId: String((await (await import("./models")).Enquiry.findById(qualified))!.clientId),
    enquiryId: qualified,
    eventDate: iso(10),
    startTime: "18:00",
    endTime: "22:00",
    spaceIds: [spaceId("The Terrace")],
    guestCount: 70,
    agreedShillings: 240000,
    mode: "hold",
    ownerId: sales.id,
  });

  const chairs = await createItem(ops, { name: "Banquet chair", sku: "FUR-CHAIR", categoryId: String(inventoryCategories.find((item) => item.name === "Furniture")!._id), assetType: "durable", quantity: 120, reorderLevel: 20, unitCostCents: 450000, location: "Store A" });
  const mic = await createItem(ops, { name: "Handheld microphone", sku: "AV-MIC-01", categoryId: String(inventoryCategories.find((item) => item.name === "AV/Electronics")!._id), assetType: "durable", quantity: 4, reorderLevel: 1, unitCostCents: 800000, location: "AV cage" });
  const weddingEvent = await EventRecord.findOne({ enquiryId: weddingId });
  if (weddingEvent) {
    await reserveForEvent(ops, { eventId: String(weddingEvent._id), itemId: chairs, quantity: 90 });
    await reserveForEvent(ops, { eventId: String(weddingEvent._id), itemId: mic, quantity: 2 });
    const artcaffe = vendorCategories.find((item) => item.name === "Artcaffé")!;
    const vendorId = await createVendor(ops, {
      name: "Artcaffé — Village Market counter",
      contactName: "Njoki Mwangi",
      phone: "0711888200",
      email: "events.villagemarket@example.com",
      categoryId: String(artcaffe._id),
      services: "Coffee service, pastries",
      pricingNotes: "Confirm the package for each event. Do not assume a standard HQ rate.",
      paymentTerms: "Invoice after the event",
      preferred: true,
    });
    const assignment = await assignVendor(ops, { eventId: String(weddingEvent._id), vendorId, service: "Welcome coffee and pastries", quotedCostCents: 4500000, agreedCostCents: 4200000 });
    await setVendorAssignment(ops, assignment, "quoted");
    await addEventCost(finance, { eventId: String(weddingEvent._id), category: "Staffing", description: "Event lead and two floor staff", amountCents: 1800000 });
  }

  const pastId = await enquiry({ name: "The Nia Foundation", phone: "0722001007", org: "The Nia Foundation", type: "Gala", source: "Phone", date: iso(-12), guests: 110, value: 500000, spaces: ["The Courtyard"], stage: "negotiation" });
  const pastQuote = await createQuotation(sales, { enquiryId: pastId, spaceIds: [spaceId("The Courtyard")], lines: [{ description: "Gala venue hire", quantity: 1, unitPriceShillings: 480000, serviceItemId: "" }] });
  await setQuotationStatus(sales, pastQuote, "sent");
  await setQuotationStatus(sales, pastQuote, "accepted");
  const pastBooking = await createBooking(ops, {
    clientId: String((await (await import("./models")).Enquiry.findById(pastId))!.clientId),
    enquiryId: pastId,
    quotationId: pastQuote,
    eventDate: iso(-12),
    startTime: "18:00",
    endTime: "23:00",
    spaceIds: [spaceId("The Courtyard")],
    guestCount: 110,
    agreedShillings: 480000,
    mode: "commit",
    ownerId: ops.id,
  });
  await recordPaymentAndMaybeConfirm(finance, {
    clientId: String((await (await import("./models")).Booking.findById(pastBooking))!.clientId),
    bookingId: pastBooking,
    type: "deposit",
    amountCents: 19200000,
    methodId: String(mpesa._id),
    paidAt: new Date(Date.now() - 20 * 86400000),
    reference: "OLD100",
    idempotencyKey: "seed-gala-deposit",
  });
  const pastEvent = await EventRecord.findOne({ enquiryId: pastId });
  if (pastEvent) {
    await addEventCost(finance, { eventId: String(pastEvent._id), category: "Décor", description: "Lighting hire", amountCents: 7500000 });
    await addEventCost(finance, { eventId: String(pastEvent._id), category: "Security", description: "Four ushers", amountCents: 3200000 });
  }

  const request = await createProcurement(ops, { item: "Spare handheld microphone", quantity: 1, reason: "Only four working microphones and two are reserved.", estimatedCostCents: 1800000, relatedType: "inventory" });
  await setProcurementStatus(ops, request, "approved", "Approved against the AV cage.");

  console.log(`Seeded HQ Operations. Sign in as wanjiku@hq.local / ${password}`);
  await disconnectDB();
}

main().catch(async (error) => {
  console.error(error);
  await disconnectDB().catch(() => undefined);
  process.exit(1);
});
