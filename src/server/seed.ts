import mongoose from "mongoose";
import { DEFAULT_AUTOMATION, DEFAULT_COMMERCIAL, DEFAULT_NOTIFICATIONS, DEFAULT_ORGANIZATION, DEMO_APPROVAL_THRESHOLDS, INITIAL_EVENT_TYPES, INITIAL_INVENTORY_CATEGORIES, INITIAL_LOST_REASONS, INITIAL_PAYMENT_METHODS, INITIAL_SOURCES, INITIAL_VENDOR_CATEGORIES } from "../domain/settings";
import { slugify } from "../domain/operations";
import { hashPassword, type SessionUser } from "./auth";
import { connectDB, disconnectDB } from "./db";
import {
  ApprovalRequest,
  Booking,
  Enquiry,
  EventRecord,
  EventType,
  InventoryCategory,
  InventoryItem,
  LeadSource,
  LostReason,
  PaymentMethod,
  ServiceItem,
  Space,
  SystemSetting,
  User,
  VendorCategory,
} from "./models";
import type { Role } from "../domain/permissions";
import { notify } from "./notifications";
import { createEnquiry, createVisit, transitionEnquiryStage, updateVisit } from "./services/crm";
import { cancelBooking, createBooking, createQuotation, extendHold, recordPaymentAndMaybeConfirm, reviseQuotation, setQuotationStatus } from "./services/commercial";
import { addEventCost, assignVendor, createProcurement, createTask, createVendor, setProcurementStatus, setVendorAssignment, toggleCloseout, updateEvent } from "./services/events";
import { createItem, issueReserved, moveStock, reserveForEvent, returnIssued } from "./services/inventory";
import { submitPublicEnquiry } from "./services/public-enquiry";
import { reviewApproval, submitApproval } from "./services/approvals";
import { inviteUser } from "./services/users";

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

/** Removes development records and keeps bootstrap super admins. */
export async function clearDevelopmentData() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Development seed cannot run in production. Create the first administrator with bootstrap-admin.");
  }
  await connectDB();
  const database = mongoose.connection.db;
  if (!database) throw new Error("Database is not connected.");
  const collections = await database.listCollections().toArray();
  for (const collection of collections) {
    if (collection.name === "users" || collection.name.startsWith("system.")) continue;
    await database.collection(collection.name).deleteMany({});
  }
  const removed = await User.deleteMany({ role: { $ne: "super_admin" } });
  return { removedUsers: removed.deletedCount };
}

export async function seedDevelopment(options: { reset?: boolean } = {}) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Development seed cannot run in production. Create the first administrator with bootstrap-admin.");
  }
  await connectDB();
  if (options.reset) await clearDevelopmentData();
  else if (await User.countDocuments() > 0) {
    console.log("Seed skipped. Users already exist, so demo enquiries were not created. Run npm run seed:reset to rebuild development data. The super admin is kept.");
    return { skipped: true as const };
  }

  const password = process.env.SEED_PASSWORD || "ChangeMe-HQ-2026";
  const administrator = await User.create({
    name: "Samuel Kimani",
    email: "samuel@hq.local",
    phone: "0711000006",
    role: "administrator",
    jobTitle: "Systems administrator",
    passwordHash: await hashPassword(password),
    status: "active",
    active: true,
    joinedAt: new Date(Date.now() - 140 * 86400000),
    lastLoginAt: new Date(Date.now() - 2 * 86400000),
  });
  const people: { name: string; email: string; role: Role; phone: string; jobTitle: string; seen: number }[] = [
    { name: "Amina Hassan", email: "amina@hq.local", role: "leadership", phone: "0711000001", jobTitle: "General manager", seen: 1 },
    { name: "David Otieno", email: "david@hq.local", role: "operations_lead", phone: "0711000002", jobTitle: "Operations lead", seen: 0 },
    { name: "Wanjiku Kariuki", email: "wanjiku@hq.local", role: "sales_coordinator", phone: "0711000003", jobTitle: "Event coordinator", seen: 0 },
    { name: "Brian Mwangi", email: "brian@hq.local", role: "event_staff", phone: "0711000004", jobTitle: "Floor lead", seen: 3 },
    { name: "Faith Chebet", email: "faith@hq.local", role: "finance", phone: "0711000005", jobTitle: "Finance lead", seen: 4 },
  ];
  const users = [administrator];
  for (const person of people) {
    users.push(await User.create({
      name: person.name,
      email: person.email,
      phone: person.phone,
      role: person.role,
      jobTitle: person.jobTitle,
      passwordHash: await hashPassword(password),
      status: "active",
      active: true,
      createdBy: administrator._id,
      joinedAt: new Date(Date.now() - 120 * 86400000),
      lastLoginAt: new Date(Date.now() - person.seen * 86400000),
    }));
  }
  const asUser = (email: string): SessionUser => {
    const user = users.find((item) => item.email === email)!;
    return { id: String(user._id), name: user.name, email: user.email, role: user.role as Role };
  };
  const sales = asUser("wanjiku@hq.local");
  const ops = asUser("david@hq.local");
  const finance = asUser("faith@hq.local");
  const lead = asUser("amina@hq.local");
  const floor = asUser("brian@hq.local");
  const admin = asUser("samuel@hq.local");

  await SystemSetting.create({
    key: "organization",
    value: { ...DEFAULT_ORGANIZATION, name: "HQ", legalName: "HQ Nairobi", address: "James Gichuru Road", city: "Nairobi", phone: "+254 700 000 000", email: "events@hq.local", website: "https://hq.example" },
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
  for (const [name, price, unit] of [
    ["Venue hire — Courtyard", 120000, "event"],
    ["Venue hire — Gallery", 85000, "event"],
    ["Venue hire — Library", 65000, "event"],
    ["Venue hire — Terrace", 95000, "event"],
    ["Additional hour", 15000, "hour"],
    ["Coffee and tea service", 800, "guest"],
    ["Pastries and light bites", 650, "guest"],
    ["AV package", 18000, "event"],
    ["Furniture and setup", 12000, "event"],
    ["Security steward", 4000, "person"],
    ["Post-event cleaning", 8000, "event"],
    ["Catering coordination", 15000, "event"],
  ] as const) {
    await ServiceItem.create({ name, code: slugify(name), unitPriceCents: price * 100, unit, category: "Hospitality", active: true, description: "Development catalogue figure. Not an HQ rate card." });
  }

  const typeId = (name: string) => String(eventTypes.find((item) => item.name === name)!._id);
  const sourceId = (name: string) => String(sources.find((item) => item.name === name)!._id);
  const spaceId = (name: string) => String(spaces.find((item) => item.name === name)!._id);
  const methodId = (name: string) => String(paymentMethods.find((item) => item.name === name)!._id);
  const categoryId = (name: string) => String(vendorCategories.find((item) => item.name === name)!._id);
  const stockCategory = (name: string) => String(inventoryCategories.find((item) => item.name === name)!._id);
  const lostId = (name: string) => String(lostReasons.find((item) => item.name === name)!._id);

  async function enquiry(input: { name: string; phone: string; email?: string; org?: string; type: string; source: string; day: number; guests: number; value: number; spaces?: string[]; stage?: string; lost?: string; owner?: SessionUser; actionDay?: number; priority?: "low" | "normal" | "high" | "urgent"; requirements?: string }) {
    const owner = input.owner || sales;
    const id = await createEnquiry(owner, {
      fullName: input.name,
      organization: input.org || "",
      phone: input.phone,
      email: input.email || `${input.name.split(" ")[0].toLowerCase()}@guest.example`,
      preferredContact: "whatsapp",
      eventTypeId: typeId(input.type),
      preferredDate: iso(input.day),
      startTime: "16:00",
      endTime: "22:00",
      estimatedGuests: input.guests,
      spaceIds: (input.spaces || []).map(spaceId),
      sourceId: sourceId(input.source),
      estimatedValueShillings: input.value,
      nextAction: input.stage === "new" ? "Call and confirm the date is still of interest" : "Confirm the brief",
      nextActionDate: iso(input.actionDay ?? 1),
      priority: input.priority || (input.value >= 400000 ? "high" : "normal"),
      requirements: input.requirements || "Share the run of show before the site visit.",
      ownerId: owner.id,
    });
    if (input.stage && input.stage !== "new") {
      await transitionEnquiryStage(owner, id, input.stage as "contacted", { lostReasonId: input.lost ? lostId(input.lost) : "" });
    }
    return id;
  }

  const pipeline: Parameters<typeof enquiry>[0][] = [
    { name: "Achieng Odhiambo", phone: "0722111001", org: "", type: "Birthday", source: "Instagram", day: 34, guests: 36, value: 160000, spaces: ["The Gallery"], stage: "new", actionDay: -2 },
    { name: "Halima Yusuf", phone: "0722111002", type: "Private Dinner", source: "WhatsApp", day: 19, guests: 18, value: 140000, spaces: ["The Library"], stage: "contacted", actionDay: 0 },
    { name: "Otieno Family", phone: "0722111003", type: "Memorial", source: "Phone", day: 26, guests: 50, value: 220000, spaces: ["The Terrace"], stage: "new", priority: "high" },
    { name: "Sanaa House", phone: "0722111004", org: "Sanaa House", type: "Cocktail", source: "Referral", day: 41, guests: 70, value: 310000, spaces: ["The Terrace"], stage: "qualified" },
    { name: "Dr Leah Cheruiyot", phone: "0722111005", type: "Private Dinner", source: "Returning Client", day: 15, guests: 14, value: 95000, spaces: ["The Library"], stage: "contacted" },
    { name: "Mara Ridge Holdings", phone: "0722111006", org: "Mara Ridge Holdings", type: "Corporate", source: "Email", day: 12, guests: 48, value: 280000, spaces: ["The Terrace"], stage: "negotiation", priority: "high" },
    { name: "Lamu Arts Trust", phone: "0722111007", org: "Lamu Arts Trust", type: "Cocktail", source: "Website", day: 16, guests: 40, value: 190000, spaces: ["The Gallery"], stage: "qualified" },
    { name: "Westlands Run Club", phone: "0722111008", org: "Westlands Run Club", type: "Cocktail", source: "WhatsApp", day: 5, guests: 55, value: 175000, spaces: ["The Courtyard"], stage: "quote_sent" },
    { name: "Karen Flower Society", phone: "0722111009", org: "Karen Flower Society", type: "Workshop", source: "Instagram", day: 27, guests: 30, value: 120000, spaces: ["The Terrace"], stage: "site_visit" },
    { name: "Nyama Fest", phone: "0722111010", org: "Nyama Fest", type: "Gala", source: "Referral", day: 33, guests: 80, value: 420000, spaces: ["The Gallery"], stage: "negotiation" },
    { name: "Pamoja Credit Union", phone: "0722111011", org: "Pamoja Credit Union", type: "Corporate", source: "Email", day: 9, guests: 16, value: 210000, spaces: ["The Library"], stage: "negotiation" },
    { name: "Zuri Wanjala", phone: "0722111012", type: "Wedding", source: "Returning Client", day: 21, guests: 78, value: 480000, spaces: ["The Courtyard", "The Terrace"], stage: "qualified", priority: "high" },
    { name: "The Nia Foundation", phone: "0722111013", org: "The Nia Foundation", type: "Gala", source: "Phone", day: -40, guests: 80, value: 520000, spaces: ["The Courtyard"], stage: "negotiation" },
    { name: "Kilimani Collective", phone: "0722111014", org: "Kilimani Collective", type: "Private Dinner", source: "Instagram", day: -25, guests: 32, value: 185000, spaces: ["The Gallery"], stage: "quote_sent" },
    { name: "Baraka Chambers", phone: "0722111015", org: "Baraka Chambers LLP", type: "Workshop", source: "Referral", day: -15, guests: 12, value: 98000, spaces: ["The Library"], stage: "negotiation" },
    { name: "Njeri Waceke", phone: "0722111016", type: "Birthday", source: "WhatsApp", day: 45, guests: 28, value: 150000, spaces: ["The Gallery"], stage: "site_visit" },
    { name: "Equity Circle NGO", phone: "0722111017", org: "Equity Circle", type: "Workshop", source: "Email", day: 38, guests: 24, value: 110000, spaces: ["The Library"], stage: "lost", lost: "Date unavailable" },
    { name: "Hassan Photo Club", phone: "0722111018", org: "Hassan Photo Club", type: "Cocktail", source: "Instagram", day: 50, guests: 60, value: 240000, spaces: ["The Terrace"], stage: "lost", lost: "Competitor" },
    { name: "Mama Fatuma Kitchen", phone: "0722111019", org: "Mama Fatuma Kitchen", type: "Private Dinner", source: "Walk-in", day: 8, guests: 20, value: 130000, spaces: ["The Gallery"], stage: "cancelled" },
    { name: "Rift Valley Law Society", phone: "0722111020", org: "Rift Valley Law Society", type: "Corporate", source: "Referral", day: 60, guests: 40, value: 260000, spaces: ["The Gallery"], stage: "postponed" },
    { name: "Zuri Wanjala", phone: "0722111012", type: "Cocktail", source: "Returning Client", day: -70, guests: 40, value: 150000, spaces: ["The Terrace"], stage: "quote_sent" },
    { name: "Pamoja Credit Union", phone: "0722111011", org: "Pamoja Credit Union", type: "Workshop", source: "Returning Client", day: -55, guests: 18, value: 90000, spaces: ["The Library"], stage: "contacted", actionDay: -3 },
    { name: "The Nia Foundation", phone: "0722111013", org: "The Nia Foundation", type: "Workshop", source: "Returning Client", day: 70, guests: 30, value: 140000, spaces: ["The Gallery"], stage: "new", priority: "high" },
    { name: "Cynthia Akinyi", phone: "0722111021", org: "Studio Akinyi", type: "Cocktail", source: "Instagram", day: 23, guests: 45, value: 200000, spaces: ["The Terrace"], stage: "quote_sent" },
    { name: "Josephat Kibet", phone: "0722111022", type: "Birthday", source: "Phone", day: 11, guests: 22, value: 85000, spaces: ["The Library"], stage: "qualified", actionDay: 0 },
    { name: "Savanna Teachers Association", phone: "0722111023", org: "Savanna Teachers Association", type: "Gala", source: "Email", day: 55, guests: 90, value: 610000, spaces: ["The Courtyard"], stage: "site_visit", priority: "urgent" },
    { name: "Imani Health Partners", phone: "0722111024", org: "Imani Health Partners", type: "Corporate", source: "Website", day: 29, guests: 35, value: 230000, spaces: ["The Gallery"], stage: "negotiation" },
    { name: "Beadwork Cooperative", phone: "0722111025", org: "Beadwork Cooperative", type: "Workshop", source: "Walk-in", day: 17, guests: 20, value: 75000, spaces: ["The Library"], stage: "new" },
    { name: "Daniel Mwangi", phone: "0722111026", type: "Private Dinner", source: "Referral", day: 36, guests: 16, value: 125000, spaces: ["The Library"], stage: "contacted" },
    { name: "Lotus & Co Advocates", phone: "0722111027", org: "Lotus & Co Advocates", type: "Corporate", source: "Email", day: 48, guests: 26, value: 300000, spaces: ["The Gallery"], stage: "quote_sent", priority: "high" },
    { name: "Asha Noor", phone: "0722111028", type: "Wedding", source: "WhatsApp", day: 80, guests: 100, value: 700000, spaces: ["The Courtyard"], stage: "lost", lost: "Capacity" },
    { name: "Greenbelt Residents", phone: "0722111029", org: "Greenbelt Residents Association", type: "Cocktail", source: "Referral", day: 13, guests: 50, value: 210000, spaces: ["The Terrace"], stage: "qualified" },
    { name: "Kito Kids Choir", phone: "0722111030", org: "Kito Kids Choir", type: "Gala", source: "Phone", day: 44, guests: 70, value: 250000, spaces: ["The Courtyard"], stage: "contacted", actionDay: -1 },
    { name: "Thika Horticultural Society", phone: "0722111031", org: "Thika Horticultural Society", type: "Workshop", source: "Referral", day: 31, guests: 28, value: 145000, spaces: ["The Terrace"], stage: "negotiation" },
    { name: "Lakeview Parents Association", phone: "0722111032", org: "Lakeview Parents Association", type: "Gala", source: "Phone", day: 52, guests: 64, value: 360000, spaces: ["The Courtyard"], stage: "negotiation", priority: "high" },
    { name: "Boma Creative Studio", phone: "0722111033", org: "Boma Creative Studio", type: "Cocktail", source: "Instagram", day: 18, guests: 42, value: 175000, spaces: ["The Gallery"], stage: "quote_sent", actionDay: 0 },
  ];

  const ids = new Map<string, string>();
  for (const row of pipeline) {
    const key = `${row.name}|${row.day}`;
    ids.set(key, await enquiry(row));
  }

  async function quoteFor(key: string, lines: { description: string; quantity: number; unitPriceShillings: number }[], spaces: string[]) {
    const enquiryId = ids.get(key)!;
    return createQuotation(sales, { enquiryId, spaceIds: spaces.map(spaceId), lines: lines.map((line) => ({ ...line, serviceItemId: "", discountShillings: 0 })) });
  }

  async function pay(bookingId: string, type: "deposit" | "balance" | "refund", shillings: number, method: string, reference: string, when = new Date()) {
    const booking = await Booking.findById(bookingId);
    await recordPaymentAndMaybeConfirm(finance, {
      clientId: String(booking!.clientId),
      bookingId,
      type,
      amountCents: Math.round(shillings * 100),
      methodId: methodId(method),
      paidAt: when,
      reference,
      idempotencyKey: `seed-${reference}`,
    });
  }

  async function commit(key: string, quoteId: string, spaces: string[], guests: number, agreed: number, day: number, start: string, end: string, owner = sales) {
    const row = await Enquiry.findById(ids.get(key));
    return createBooking(owner, {
      clientId: String(row!.clientId),
      enquiryId: ids.get(key),
      quotationId: quoteId,
      eventDate: iso(day),
      startTime: start,
      endTime: end,
      spaceIds: spaces.map(spaceId),
      guestCount: guests,
      agreedShillings: agreed,
      mode: "commit",
      ownerId: owner.id,
    });
  }

  const galaQuote = await quoteFor("The Nia Foundation|-40", [{ description: "Venue hire — Courtyard", quantity: 1, unitPriceShillings: 180000 }, { description: "AV package", quantity: 1, unitPriceShillings: 18000 }, { description: "Security steward", quantity: 4, unitPriceShillings: 4000 }], ["The Courtyard"]);
  await setQuotationStatus(sales, galaQuote, "sent");
  await reviseQuotation(sales, galaQuote, { enquiryId: ids.get("The Nia Foundation|-40")!, spaceIds: [spaceId("The Courtyard")], lines: [{ description: "Venue hire — Courtyard", quantity: 1, unitPriceShillings: 170000, serviceItemId: "" }, { description: "AV package", quantity: 1, unitPriceShillings: 18000, serviceItemId: "" }, { description: "Furniture and setup", quantity: 1, unitPriceShillings: 12000, serviceItemId: "" }] }, "Foundation asked for a simpler furniture plan.");
  await setQuotationStatus(sales, galaQuote, "sent");
  await setQuotationStatus(sales, galaQuote, "accepted");
  const galaBooking = await commit("The Nia Foundation|-40", galaQuote, ["The Courtyard"], 80, 200000, -40, "18:00", "23:00", ops);
  await pay(galaBooking, "deposit", 80000, "Bank transfer", "NIA-DEP", new Date(Date.now() - 55 * 86400000));
  await pay(galaBooking, "balance", 120000, "Bank transfer", "NIA-BAL", new Date(Date.now() - 41 * 86400000));

  const dinnerQuote = await quoteFor("Kilimani Collective|-25", [{ description: "Venue hire — Gallery", quantity: 1, unitPriceShillings: 85000 }, { description: "Coffee and tea service", quantity: 32, unitPriceShillings: 800 }], ["The Gallery"]);
  await setQuotationStatus(sales, dinnerQuote, "sent");
  await setQuotationStatus(sales, dinnerQuote, "accepted");
  const dinnerBooking = await commit("Kilimani Collective|-25", dinnerQuote, ["The Gallery"], 32, 110600, -25, "18:30", "22:30", ops);
  await pay(dinnerBooking, "deposit", 44240, "M-Pesa", "KIL-DEP", new Date(Date.now() - 32 * 86400000));

  const boardQuote = await quoteFor("Baraka Chambers|-15", [{ description: "Venue hire — Library", quantity: 1, unitPriceShillings: 65000 }, { description: "Pastries and light bites", quantity: 12, unitPriceShillings: 650 }], ["The Library"]);
  await setQuotationStatus(sales, boardQuote, "sent");
  await setQuotationStatus(sales, boardQuote, "accepted");
  const boardBooking = await commit("Baraka Chambers|-15", boardQuote, ["The Library"], 12, 72800, -15, "08:30", "13:00", ops);
  await pay(boardBooking, "deposit", 29120, "Cheque", "BAR-DEP", new Date(Date.now() - 20 * 86400000));

  const weddingQuote = await quoteFor("Zuri Wanjala|21", [{ description: "Venue hire — Courtyard", quantity: 1, unitPriceShillings: 180000 }, { description: "Additional hour", quantity: 2, unitPriceShillings: 15000 }], ["The Courtyard", "The Terrace"]);
  await setQuotationStatus(sales, weddingQuote, "sent");
  await reviseQuotation(sales, weddingQuote, { enquiryId: ids.get("Zuri Wanjala|21")!, spaceIds: [spaceId("The Courtyard"), spaceId("The Terrace")], lines: [{ description: "Venue hire — Courtyard and Terrace", quantity: 1, unitPriceShillings: 165000, serviceItemId: "" }, { description: "Catering coordination", quantity: 1, unitPriceShillings: 15000, serviceItemId: "" }] }, "Client asked to drop the extra hours.");
  await setQuotationStatus(sales, weddingQuote, "sent");
  await setQuotationStatus(sales, weddingQuote, "accepted");
  const weddingBooking = await commit("Zuri Wanjala|21", weddingQuote, ["The Courtyard", "The Terrace"], 78, 180000, 21, "15:00", "23:00");
  await pay(weddingBooking, "deposit", 72000, "M-Pesa", "ZURI-DEP");

  const pamojaQuote = await quoteFor("Pamoja Credit Union|9", [{ description: "Venue hire — Library", quantity: 1, unitPriceShillings: 65000 }, { description: "Coffee and tea service", quantity: 16, unitPriceShillings: 800 }, { description: "AV package", quantity: 1, unitPriceShillings: 18000 }], ["The Library"]);
  await setQuotationStatus(sales, pamojaQuote, "sent");
  await setQuotationStatus(sales, pamojaQuote, "accepted");
  const pamojaBooking = await commit("Pamoja Credit Union|9", pamojaQuote, ["The Library"], 16, 95800, 9, "08:00", "16:00", ops);
  await pay(pamojaBooking, "deposit", 38320, "Bank transfer", "PAM-DEP");
  await pay(pamojaBooking, "balance", 57480, "Bank transfer", "PAM-BAL");

  const maraQuote = await quoteFor("Mara Ridge Holdings|12", [{ description: "Venue hire — Terrace", quantity: 1, unitPriceShillings: 95000 }, { description: "Security steward", quantity: 2, unitPriceShillings: 4000 }], ["The Terrace"]);
  await setQuotationStatus(sales, maraQuote, "sent");
  await setQuotationStatus(sales, maraQuote, "accepted");
  await commit("Mara Ridge Holdings|12", maraQuote, ["The Terrace"], 48, 103000, 12, "17:00", "21:00");

  const lamuId = ids.get("Lamu Arts Trust|16")!;
  await createBooking(sales, { clientId: String((await Enquiry.findById(lamuId))!.clientId), enquiryId: lamuId, eventDate: iso(16), startTime: "18:00", endTime: "22:00", spaceIds: [spaceId("The Gallery")], guestCount: 40, agreedShillings: 190000, mode: "hold", ownerId: sales.id });

  const westQuote = await quoteFor("Westlands Run Club|5", [{ description: "Venue hire — Courtyard", quantity: 1, unitPriceShillings: 120000 }], ["The Courtyard"]);
  await setQuotationStatus(sales, westQuote, "sent");
  await setQuotationStatus(sales, westQuote, "accepted");
  const westBooking = await commit("Westlands Run Club|5", westQuote, ["The Courtyard"], 55, 120000, 5, "16:00", "20:00");
  const west = await Booking.findById(westBooking);
  west!.holdExpiresAt = new Date(Date.now() - 3 * 86400000);
  west!.holdReleasedAt = new Date(Date.now() - 86400000);
  west!.holdExpired = true;
  await west!.save();

  const flowerId = ids.get("Karen Flower Society|27")!;
  const flowerBooking = await createBooking(sales, { clientId: String((await Enquiry.findById(flowerId))!.clientId), enquiryId: flowerId, eventDate: iso(27), startTime: "10:00", endTime: "15:00", spaceIds: [spaceId("The Terrace")], guestCount: 30, agreedShillings: 120000, mode: "hold", ownerId: sales.id });
  const flower = await Booking.findById(flowerBooking);
  flower!.holdExpiresAt = new Date(Date.now() - 2 * 86400000);
  flower!.holdReleasedAt = new Date(Date.now() - 86400000);
  flower!.holdExpired = true;
  await flower!.save();
  await extendHold(ops, flowerBooking, "The society confirmed they still want the terrace while the deposit is arranged.");

  const nyamaQuote = await quoteFor("Nyama Fest|33", [{ description: "Venue hire — Gallery", quantity: 1, unitPriceShillings: 85000 }], ["The Gallery"]);
  await setQuotationStatus(sales, nyamaQuote, "sent");
  await setQuotationStatus(sales, nyamaQuote, "accepted");
  const nyamaBooking = await commit("Nyama Fest|33", nyamaQuote, ["The Gallery"], 40, 85000, 33, "18:00", "23:00");
  await cancelBooking(sales, nyamaBooking, "The organiser moved the festival to another month.");
  await transitionEnquiryStage(sales, ids.get("Nyama Fest|33")!, "cancelled", {});

  const draftQuote = await quoteFor("Sanaa House|41", [{ description: "Venue hire — Terrace", quantity: 1, unitPriceShillings: 95000 }, { description: "Pastries and light bites", quantity: 70, unitPriceShillings: 650 }], ["The Terrace"]);
  void draftQuote;
  const sentQuote = await quoteFor("Cynthia Akinyi|23", [{ description: "Venue hire — Terrace", quantity: 1, unitPriceShillings: 95000 }, { description: "AV package", quantity: 1, unitPriceShillings: 18000 }], ["The Terrace"]);
  await setQuotationStatus(sales, sentQuote, "sent");
  const declinedQuote = await quoteFor("Hassan Photo Club|50", [{ description: "Venue hire — Terrace", quantity: 1, unitPriceShillings: 95000 }], ["The Terrace"]);
  await setQuotationStatus(sales, declinedQuote, "sent");
  await setQuotationStatus(sales, declinedQuote, "declined");
  const expiredQuote = await quoteFor("Equity Circle NGO|38", [{ description: "Venue hire — Library", quantity: 1, unitPriceShillings: 65000 }], ["The Library"]);
  await setQuotationStatus(sales, expiredQuote, "sent");
  await setQuotationStatus(sales, expiredQuote, "expired");

  const weddingVisit = await createVisit(sales, { enquiryId: ids.get("Zuri Wanjala|21")!, scheduledDate: iso(-6), scheduledTime: "11:00", assignedToId: sales.id, spaceIds: [spaceId("The Courtyard")], notes: "Walked the courtyard for a sunset ceremony." });
  await updateVisit(sales, weddingVisit, { status: "completed", outcome: "interested", outcomeNotes: "They want a clear boundary with the external caterer." });
  await createVisit(sales, { enquiryId: ids.get("Savanna Teachers Association|55")!, scheduledDate: iso(3), scheduledTime: "15:00", assignedToId: floor.id, spaceIds: [spaceId("The Courtyard")], notes: "Committee wants to see the evening light." });
  const moved = await createVisit(sales, { enquiryId: ids.get("Njeri Waceke|45")!, scheduledDate: iso(2), scheduledTime: "10:00", assignedToId: sales.id, spaceIds: [spaceId("The Gallery")], notes: "First visit was moved for a family commitment." });
  await updateVisit(sales, moved, { status: "rescheduled", outcomeNotes: "Moved after a family commitment. A new time is still to be agreed." });
  const missed = await createVisit(sales, { enquiryId: ids.get("Josephat Kibet|11")!, scheduledDate: iso(-1), scheduledTime: "09:30", assignedToId: sales.id, spaceIds: [spaceId("The Library")], notes: "Birthday client did not arrive." });
  await updateVisit(sales, missed, { status: "no_show", outcomeNotes: "No answer on the morning of the visit." });

  async function finish(bookingId: string, costs: { category: string; description: string; shillings: number }[]) {
    const event = await EventRecord.findOne({ bookingId });
    if (!event) return null;
    for (const status of ["ready", "live", "completed"] as const) await updateEvent(ops, String(event._id), { status });
    for (const key of ["inventory", "vendors", "payment", "feedback", "site"]) await toggleCloseout(ops, String(event._id), key, true, "Closed in the development history.");
    await updateEvent(ops, String(event._id), { status: "closed" });
    for (const cost of costs) await addEventCost(finance, { eventId: String(event._id), category: cost.category, description: cost.description, amountCents: cost.shillings * 100 });
    return event;
  }
  await finish(galaBooking, [{ category: "Security", description: "Four stewards for the gala", shillings: 16000 }, { category: "Cleaning", description: "Next-morning courtyard clean", shillings: 8000 }]);
  const dinnerEvent = await finish(dinnerBooking, [{ category: "Catering", description: "Coffee and pastry service", shillings: 18000 }]);
  await finish(boardBooking, [{ category: "Cleaning", description: "Library reset", shillings: 4000 }]);

  const weddingEvent = await EventRecord.findOne({ bookingId: weddingBooking });
  const pamojaEvent = await EventRecord.findOne({ bookingId: pamojaBooking });
  if (weddingEvent) {
    await updateEvent(ops, String(weddingEvent._id), {
      staffIds: [floor.id, ops.id],
      notes: "Sunset ceremony in the courtyard, dinner on the terrace. External caterer stops at the service door.",
      requirements: [{ label: "Catering", value: "External caterer, HQ coordinates timing only." }, { label: "AV", value: "Two microphones and a small speaker for speeches." }],
    });
  }
  if (pamojaEvent) {
    await updateEvent(ops, String(pamojaEvent._id), {
      staffIds: [floor.id],
      notes: "Board session. Keep the library quiet until 16:00.",
      requirements: [{ label: "AV", value: "Projector and one handheld microphone." }],
    });
    await toggleCloseout(ops, String(pamojaEvent._id), "vendors", true);
  }

  const artcaffe = await createVendor(ops, {
    name: "Artcaffé — Village Market counter",
    contactName: "Counter manager",
    phone: "0711888200",
    email: "events.villagemarket@example.com",
    categoryId: categoryId("Artcaffé"),
    services: "Coffee and pastries when HQ asks for that counter.",
    pricingNotes: "Development marker only. Artcaffé is a real HQ relationship. This record is not a contract and states no price.",
    paymentTerms: "Agree each event. Do not copy a rate from this seed.",
    preferred: true,
  });
  const vendors = [
    ["Savanna Spoon Catering", "Catering", "Amina Juma", "0712002201", "Kitchen for seated dinners. Demo vendor."],
    ["Linen & Clay", "Décor", "Peter Okello", "0712002202", "Table linen and simple centrepieces."],
    ["Signal Room AV", "AV", "Grace Wambui", "0712002203", "Projectors, microphones and playback."],
    ["Frame Forty Photography", "Photography", "Leo Maina", "0712002204", "Event photography for private dinners."],
    ["Watchmen Cooperative", "Security", "Samuel Odede", "0712002205", "Licensed stewards for evening events."],
    ["Dawn Reset Cleaning", "Cleaning", "Mercy Atieno", "0712002206", "Post-event clean of hired spaces."],
    ["Seatwise Hire", "Furniture Hire", "Hassan Ali", "0712002207", "Extra chairs and cocktail tables."],
    ["Night Chorus", "Entertainment", "Brian Kiptoo", "0712002208", "Acoustic sets. Confirm the repertoire with the client."],
    ["Stem Studio", "Florist", "Wanjiru Njeri", "0712002209", "Loose floral arrangements."],
    ["Matatu & Coach", "Transport", "Felix Mutiso", "0712002210", "Guest shuttle from Westlands."],
    ["Kiln Maintenance", "Maintenance", "Omar Farah", "0712002211", "In-house repairs for furniture and AV stands."],
    ["Paper Lantern Co", "Décor", "Celia Adhiambo", "0712002212", "Paper lanterns for courtyard evenings."],
    ["Quiet Mic Hire", "AV", "Irene Chepkemoi", "0712002213", "Backup microphones."],
    ["Nairobi Bloom", "Florist", "Talia Shah", "0712002214", "Seasonal stems. Demo prices are not a standing order."],
  ] as const;
  const vendorIds: string[] = [];
  for (const [name, category, contact, phone, notes] of vendors) {
    vendorIds.push(await createVendor(ops, { name, contactName: contact, phone, email: `${slugify(name)}@vendor.example`, categoryId: categoryId(category), services: notes, pricingNotes: "Fictional development vendor. Not an HQ supplier agreement.", paymentTerms: "Invoice after the event", preferred: false }));
  }
  if (weddingEvent) {
    const assignment = await assignVendor(ops, { eventId: String(weddingEvent._id), vendorId: artcaffe, service: "Welcome coffee and pastries", quotedCostCents: 0, agreedCostCents: 0, notes: "Ask Artcaffé for this event. No rate is stored here." });
    await setVendorAssignment(ops, assignment, "quoted");
    const security = await assignVendor(ops, { eventId: String(weddingEvent._id), vendorId: vendorIds[4], service: "Two evening stewards", quotedCostCents: 800000, agreedCostCents: 800000 });
    await setVendorAssignment(ops, security, "confirmed");
    await addEventCost(finance, { eventId: String(weddingEvent._id), category: "Security", description: "Two stewards from Watchmen Cooperative", amountCents: 800000, vendorId: vendorIds[4] });
  }

  const furniture = stockCategory("Furniture");
  const av = stockCategory("AV/Electronics");
  const linen = stockCategory("Linen");
  const decor = stockCategory("Décor");
  const cleaning = stockCategory("Cleaning");
  const service = stockCategory("Service Equipment");
  const chairs = await createItem(ops, { name: "Banquet chair", sku: "FUR-CHAIR", categoryId: furniture, assetType: "durable", quantity: 140, reorderLevel: 24, unitCostCents: 450000, location: "Store A" });
  const tables = await createItem(ops, { name: "Round banquet table", sku: "FUR-TABLE-R", categoryId: furniture, assetType: "durable", quantity: 16, reorderLevel: 4, unitCostCents: 1200000, location: "Store A" });
  await createItem(ops, { name: "Cocktail table", sku: "FUR-COCKTAIL", categoryId: furniture, assetType: "durable", quantity: 10, reorderLevel: 2, unitCostCents: 700000, location: "Store A" });
  const projector = await createItem(ops, { name: "Projector", sku: "AV-PROJ-01", categoryId: av, assetType: "durable", quantity: 2, reorderLevel: 1, unitCostCents: 4500000, location: "AV cage" });
  await createItem(ops, { name: "Projection screen", sku: "AV-SCREEN", categoryId: av, assetType: "durable", quantity: 2, reorderLevel: 1, unitCostCents: 1800000, location: "AV cage" });
  const mic = await createItem(ops, { name: "Handheld microphone", sku: "AV-MIC-01", categoryId: av, assetType: "durable", quantity: 6, reorderLevel: 2, unitCostCents: 800000, location: "AV cage" });
  const speaker = await createItem(ops, { name: "Powered speaker", sku: "AV-SPK-02", categoryId: av, assetType: "durable", quantity: 4, reorderLevel: 1, unitCostCents: 2200000, location: "AV cage" });
  await createItem(ops, { name: "Extension cable 20m", sku: "AV-CABLE", categoryId: av, assetType: "durable", quantity: 12, reorderLevel: 4, unitCostCents: 150000, location: "AV cage" });
  await createItem(ops, { name: "Ivory table linen", sku: "LIN-IVORY", categoryId: linen, assetType: "durable", quantity: 20, reorderLevel: 6, unitCostCents: 250000, location: "Linen room" });
  await createItem(ops, { name: "Service tray", sku: "SRV-TRAY", categoryId: service, assetType: "durable", quantity: 18, reorderLevel: 4, unitCostCents: 80000, location: "Service store" });
  await createItem(ops, { name: "Brass candlestick", sku: "DEC-CANDLE", categoryId: decor, assetType: "durable", quantity: 24, reorderLevel: 6, unitCostCents: 60000, location: "Décor cupboard" });
  const napkins = await createItem(ops, { name: "Paper cocktail napkin", sku: "CLN-NAPKIN", categoryId: cleaning, assetType: "consumable", quantity: 4, reorderLevel: 12, unitCostCents: 200, location: "Cleaning cupboard" });
  await moveStock(ops, { itemId: speaker, type: "damage", quantity: 1, reason: "Torn grille after the Kilimani dinner.", approved: true });
  await InventoryItem.updateOne({ sku: "AV-SPK-02" }, { condition: "repair" });
  if (weddingEvent) {
    await reserveForEvent(ops, { eventId: String(weddingEvent._id), itemId: chairs, quantity: 80 });
    await reserveForEvent(ops, { eventId: String(weddingEvent._id), itemId: tables, quantity: 8 });
    await reserveForEvent(ops, { eventId: String(weddingEvent._id), itemId: mic, quantity: 2 });
  }
  if (pamojaEvent) await reserveForEvent(ops, { eventId: String(pamojaEvent._id), itemId: projector, quantity: 1 });
  if (dinnerEvent) {
    const issued = await reserveForEvent(ops, { eventId: String(dinnerEvent._id), itemId: mic, quantity: 1 });
    const { InventoryReservation } = await import("./models");
    const reservation = await InventoryReservation.findOne({ eventId: dinnerEvent._id, itemId: mic });
    if (reservation) {
      await issueReserved(ops, String(reservation._id), 1);
      await returnIssued(ops, String(reservation._id), 1, 0, 0);
    }
    void issued;
  }

  await createTask(sales, { title: "Call Kito Kids Choir about the courtyard date", ownerId: sales.id, dueAt: new Date(Date.now() - 86400000), priority: "high", relatedType: "enquiry", relatedId: ids.get("Kito Kids Choir|44"), description: "The follow-up slipped yesterday." });
  await createTask(ops, { title: "Confirm Watchmen Cooperative for the Wanjala wedding", ownerId: ops.id, dueAt: new Date(Date.now() + 2 * 86400000), priority: "high", relatedType: "event", relatedId: weddingEvent ? String(weddingEvent._id) : undefined, description: "Stewards are quoted. The confirmation call is still open." });

  const pendingBuy = await createProcurement(ops, { item: "Replacement powered speaker", quantity: 1, reason: "One speaker is under repair and the wedding needs a spare.", estimatedCostCents: 6_000_000, relatedType: "inventory" });
  void pendingBuy;
  const smallBuy = await createProcurement(ops, { item: "Paper cocktail napkins", quantity: 20, reason: "The cleaning cupboard is below the reorder level.", estimatedCostCents: 400000, relatedType: "inventory" });
  await setProcurementStatus(ops, smallBuy, "approved", "Approved for the cleaning cupboard.");

  try {
    await recordPaymentAndMaybeConfirm(finance, {
      clientId: String((await Booking.findById(pamojaBooking))!.clientId),
      bookingId: pamojaBooking,
      type: "refund",
      amountCents: 1_200_000,
      methodId: methodId("Bank transfer"),
      paidAt: new Date(),
      reference: "PAM-REF",
      notes: "One guest table was released.",
      idempotencyKey: "seed-pamoja-refund",
    });
  } catch {
    const refund = await ApprovalRequest.findOne({ actionType: "refund", entityId: pamojaBooking, status: "pending" });
    if (refund) await reviewApproval(lead, String(refund._id), "approved", "The guest count changed after the balance was paid.");
  }
  const rejectedId = await submitApproval(sales, {
    entityType: "booking",
    entityId: westBooking,
    actionType: "confirm_without_deposit",
    reason: "The run club asked to confirm before the deposit arrives.",
    proposedValue: { bookingId: westBooking },
  });
  await reviewApproval(lead, rejectedId, "rejected", "The deposit is still required before this courtyard request is confirmed.");

  await notify({ userId: sales.id, type: "enquiry.followup", title: "Overdue follow-up · Kito Kids Choir", body: "The courtyard enquiry needed a call yesterday.", href: `/enquiries/${ids.get("Kito Kids Choir|44")}`, dedupeKey: "seed-overdue-choir" });
  await notify({ userId: floor.id, type: "visit.upcoming", title: "Site visit · Savanna Teachers Association", body: "Courtyard walk-through in three days.", href: "/site-visits", dedupeKey: "seed-visit-teachers" });
  await notify({ userId: sales.id, type: "booking.deposit", title: "Deposit outstanding · Mara Ridge Holdings", body: "The terrace booking is still awaiting the deposit.", href: "/bookings", dedupeKey: "seed-deposit-mara" });
  await notify({ userId: ops.id, type: "event.approaching", title: "Event approaching · Pamoja Credit Union", body: "The library session is on the upcoming board.", href: pamojaEvent ? `/events/${pamojaEvent._id}` : "/events", dedupeKey: "seed-event-pamoja" });
  await notify({ userId: ops.id, type: "inventory.low", title: "Low stock · Paper cocktail napkin", body: "Four packs remain. The reorder level is twelve.", href: `/inventory/${napkins}`, dedupeKey: "seed-low-napkin" });
  await notify({ userId: lead.id, type: "approval.requested", title: "Approval requested · replacement speaker", body: "Operations asked to buy a spare speaker while one is under repair.", href: "/approvals", dedupeKey: "seed-approval-speaker" });

  await submitPublicEnquiry({
    fullName: "Ruth Aoko",
    email: "ruth.aoko@guest.example",
    phone: "0733001100",
    organization: "Aoko Design Studio",
    eventTypeId: typeId("Cocktail"),
    preferredDate: iso(62),
    estimatedGuests: 40,
    experience: "A launch for a small textile collection, with room for conversation rather than a stage.",
    consent: true,
    companyWebsite: "",
    serviceIds: [],
  }, { ip: "seed-public-1" });
  await submitPublicEnquiry({
    fullName: "Martin Kariuki",
    email: "martin.kariuki@guest.example",
    phone: "0733001101",
    organization: "",
    eventTypeId: typeId("Birthday"),
    preferredDate: iso(28),
    alternativeDate: iso(29),
    estimatedGuests: 25,
    experience: "A family lunch. We would like coffee, light bites and a quiet room.",
    consent: true,
    companyWebsite: "",
  }, { ip: "seed-public-2" });

  await inviteUser(admin, { name: "Njeri Abdi", email: "njeri.abdi@hq.local", role: "event_staff", jobTitle: "Weekend floor staff", phone: "0711000007" });

  return { skipped: false as const, password };
}

export async function verifyDevelopmentSeed() {
  await connectDB();
  const { Client, SiteVisit, QuotationVersion, Task, Vendor, InventoryItem, Payment, ApprovalRequest, Notification } = await import("./models");
  const summary = {
    clients: await Client.countDocuments(),
    enquiries: await Enquiry.countDocuments({ archivedAt: null }),
    siteVisits: await SiteVisit.countDocuments(),
    quotationVersions: await QuotationVersion.countDocuments(),
    bookings: await Booking.countDocuments(),
    events: await EventRecord.countDocuments(),
    tasks: await Task.countDocuments(),
    vendors: await Vendor.countDocuments(),
    inventoryItems: await InventoryItem.countDocuments(),
    payments: await Payment.countDocuments(),
    approvals: await ApprovalRequest.countDocuments(),
    notifications: await Notification.countDocuments(),
  };
  const minimums: [keyof typeof summary, number][] = [
    ["clients", 20],
    ["enquiries", 30],
    ["siteVisits", 4],
    ["quotationVersions", 10],
    ["bookings", 8],
    ["events", 4],
    ["tasks", 10],
    ["vendors", 12],
    ["inventoryItems", 10],
    ["payments", 5],
    ["approvals", 2],
    ["notifications", 6],
  ];
  const short = minimums.filter(([key, minimum]) => summary[key] < minimum);
  if (short.length) {
    throw new Error(`Development seed is incomplete: ${short.map(([key, minimum]) => `${key} ${summary[key]} < ${minimum}`).join(", ")}`);
  }
  const stages = new Set((await Enquiry.distinct("stage", { archivedAt: null })).map(String));
  const required = ["new", "contacted", "qualified", "site_visit", "quote_sent", "negotiation", "deposit_pending", "confirmed", "lost", "postponed"];
  const missing = required.filter((stage) => !stages.has(stage));
  if (missing.length) throw new Error(`Pipeline stages with no opportunities: ${missing.join(", ")}`);
  const sales = await User.findOne({ email: "wanjiku@hq.local", role: "sales_coordinator" });
  if (!sales) throw new Error("The development sales account was not created.");
  const visibleToSales = await Enquiry.countDocuments({ archivedAt: null, ownerId: sales._id });
  if (visibleToSales < 10) throw new Error("The sales account does not own enough opportunities to exercise the pipeline.");
  const orphan = await Enquiry.countDocuments({ archivedAt: null, clientId: null });
  if (orphan > 0) throw new Error("Some enquiries have no client.");
  return summary;
}

const SUMMARY_LABELS: [keyof Awaited<ReturnType<typeof verifyDevelopmentSeed>>, string][] = [
  ["clients", "Clients"],
  ["enquiries", "Enquiries"],
  ["siteVisits", "Site visits"],
  ["quotationVersions", "Quotation versions"],
  ["bookings", "Bookings"],
  ["events", "Events"],
  ["tasks", "Tasks"],
  ["vendors", "Vendors"],
  ["inventoryItems", "Inventory items"],
  ["payments", "Payments"],
  ["approvals", "Approvals"],
  ["notifications", "Notifications"],
];

const entry = process.argv[1] || "";
if (entry.endsWith("seed.ts") || entry.endsWith("seed.js")) {
  const reset = process.argv.includes("--reset") || process.env.SEED_RESET === "true";
  seedDevelopment({ reset })
    .then(async (result) => {
      if (result.skipped) {
        console.error("Seed did not run. Demo records were not created.");
        process.exitCode = 1;
        return;
      }
      const summary = await verifyDevelopmentSeed();
      for (const [key, label] of SUMMARY_LABELS) console.log(`${label}: ${summary[key]}`);
      console.log(`Development sign-in: wanjiku@hq.local / ${result.password}. Same password for amina, david, brian, faith and samuel @hq.local.`);
    })
    .catch(async (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await disconnectDB().catch(() => undefined);
    });
}
