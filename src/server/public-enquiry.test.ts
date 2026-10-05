import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { PUBLIC_CONSENT_VERSION } from "../domain/public-enquiry";
import { clearRateLimits, consumeRateLimit } from "./rate-limit";

let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri("hqops-public");
  process.env.AUTH_SECRET = "test-secret-must-be-long";
  const { connectDB } = await import("./db");
  await connectDB();
}, 180000);

afterAll(async () => {
  const { disconnectDB } = await import("./db");
  await disconnectDB();
  await replSet.stop();
});

beforeEach(() => {
  clearRateLimits();
});

function payload(overrides: Record<string, unknown> = {}) {
  return {
    fullName: "Amina Yusuf",
    email: "Amina@Example.com",
    phone: "0712 000 111",
    organization: "Northwind",
    preferredDate: "2026-12-18",
    estimatedGuests: 40,
    experience: "A long lunch with room to talk.",
    consent: true,
    companyWebsite: "",
    ...overrides,
  };
}

describe("public event enquiries", () => {
  it("creates an attributed enquiry without a booking, and rejects bad input", async () => {
    const { User, EventType, LeadSource, Space, ServiceItem, SystemSetting, Enquiry, Client, Booking, Quotation, Task, Notification, AuditLog } = await import("./models");
    const { submitPublicEnquiry, createEnquiryLink, publicFormOptions, PUBLIC_ENQUIRY_ATTEMPT_LIMIT, PUBLIC_ENQUIRY_WINDOW_MS } = await import("./services/public-enquiry");
    const owner = await User.create({ name: "Wanjiku Kariuki", email: "public-owner@test.local", role: "sales_coordinator", passwordHash: "x", active: true });
    const staff = await User.create({ name: "David Otieno", email: "public-staff@test.local", role: "operations_lead", passwordHash: "x", active: true });
    const intruder = await User.create({ name: "Other Owner", email: "public-other@test.local", role: "leadership", passwordHash: "x", active: true });
    const sales = { id: String(owner._id), name: owner.name, email: owner.email, role: "sales_coordinator" as const };
    await SystemSetting.create({ key: "assignment", value: { defaultOwnerId: sales.id } });
    const dinner = await EventType.create({ name: "Private Dinner", slug: "private-dinner", active: true });
    const website = await LeadSource.create({ name: "Website", slug: "website", active: true });
    const instagram = await LeadSource.create({ name: "Instagram", slug: "instagram", active: true });
    const terrace = await Space.create({ name: "The Terrace", slug: "the-terrace", capacity: 60, active: true, setupNotes: "Internal setup only" });
    const coffee = await ServiceItem.create({ name: "Coffee and tea service", code: "coffee", category: "Hospitality", unitPriceCents: 80000, unit: "guest", active: true, description: "Catalogue price. Internal." });
    const existing = await Client.create({ kind: "individual", name: "Amina Yusuf", phone: "0712000111", phoneNormalized: "254712000111", email: "amina@example.com", preferredContact: "whatsapp" });

    const options = await publicFormOptions();
    expect(options.services).toEqual([{ id: String(coffee._id), name: "Coffee and tea service" }]);
    expect(JSON.stringify(options)).not.toMatch(/unitPrice|setupNotes|margin|vendor/i);
    expect(options.spaces[0]).toEqual({ id: String(terrace._id), name: "The Terrace" });

    await expect(submitPublicEnquiry(payload({ email: "not-an-email", eventTypeId: String(dinner._id) }), { ip: "10.0.0.1" })).rejects.toThrow(/email/i);

    const honeypot = await submitPublicEnquiry(payload({ eventTypeId: String(dinner._id), companyWebsite: "https://spam.test", phone: "0799000222", email: "spam@example.com" }), { ip: "10.0.0.2" });
    expect(honeypot.suppressed).toBe(true);
    expect(honeypot.reference).toBeNull();
    expect(await Enquiry.countDocuments({ "contact.email": "spam@example.com" })).toBe(0);

    const linked = await submitPublicEnquiry(payload({
      eventTypeId: String(dinner._id),
      spaceId: String(terrace._id),
      serviceIds: [String(coffee._id)],
      budgetBand: "50-150",
      startTime: "12:00",
      endTime: "16:00",
      ownerId: String(intruder._id),
      stage: "confirmed",
      clientId: "507f1f77bcf86cd799439011",
      estimatedValueShillings: 999999,
      priority: "urgent",
    }), { ip: "10.0.0.3" });
    expect(linked.reference?.startsWith("ENQ-")).toBe(true);
    expect(linked.firstName).toBe("Amina");
    const enquiry = await Enquiry.findOne({ reference: linked.reference });
    expect(enquiry?.stage).toBe("new");
    expect(enquiry?.origin).toBe("public_form");
    expect(String(enquiry?.clientId)).toBe(String(existing._id));
    expect(String(enquiry?.ownerId)).toBe(sales.id);
    expect(String(enquiry?.sourceId)).toBe(String(website._id));
    expect(enquiry?.contact?.email).toBe("amina@example.com");
    expect(enquiry?.contact?.phoneNormalized).toBe("254712000111");
    expect(enquiry?.requestedServiceIds?.map(String)).toEqual([String(coffee._id)]);
    expect(enquiry?.experience).toMatch(/long lunch/);
    expect(enquiry?.budgetMinCents).toBe(5_000_000);
    expect(enquiry?.budgetMaxCents).toBe(15_000_000);
    expect(enquiry?.estimatedValueCents).toBe(0);
    expect(enquiry?.attribution?.consentVersion).toBe(PUBLIC_CONSENT_VERSION);
    expect(enquiry?.attribution?.consentAt).toBeTruthy();
    expect(enquiry?.attribution?.submittedAt).toBeTruthy();
    expect(await Client.countDocuments({ phoneNormalized: "254712000111" })).toBe(1);
    expect(await Booking.countDocuments()).toBe(0);
    expect(await Quotation.countDocuments()).toBe(0);
    expect(await Task.countDocuments({ automationKey: `enquiry-followup:${enquiry?._id}`, ownerId: owner._id })).toBe(1);
    expect(await Notification.countDocuments({ userId: owner._id, type: "enquiry.assigned" })).toBe(1);
    expect(await AuditLog.countDocuments({ entityId: String(enquiry?._id), action: "enquiry.create" })).toBe(1);

    const again = await submitPublicEnquiry(payload({ eventTypeId: String(dinner._id) }), { ip: "10.0.0.4" });
    expect(again.reference).toBe(linked.reference);
    expect(await Enquiry.countDocuments({ reference: linked.reference })).toBe(1);

    const fresh = await submitPublicEnquiry(payload({
      fullName: "Brian Mwangi",
      email: "brian@example.com",
      phone: "0700111222",
      eventTypeId: String(dinner._id),
      ref: "not-a-real-token",
    }), { ip: "10.0.0.5" });
    const untrusted = await Enquiry.findOne({ reference: fresh.reference });
    expect(String(untrusted?.sourceId)).toBe(String(website._id));
    expect(untrusted?.attribution?.campaign || "").toBe("");
    expect(untrusted?.attribution?.staffId || null).toBeNull();
    expect(await Client.countDocuments({ email: "brian@example.com" })).toBe(1);

    await expect(createEnquiryLink({ ...sales, role: "event_staff" }, { sourceId: String(instagram._id), campaign: "Spring", staffId: String(staff._id) })).rejects.toThrow(/share/i);
    const link = await createEnquiryLink(sales, { sourceId: String(instagram._id), campaign: "Spring dinners", staffId: String(staff._id) });
    expect(link.token).not.toContain(String(staff._id));
    expect(link.token).not.toContain(String(instagram._id));
    const attributed = await submitPublicEnquiry(payload({
      fullName: "Faith Chebet",
      email: "faith@example.com",
      phone: "0733444555",
      eventTypeId: String(dinner._id),
      ref: link.token,
    }), { ip: "10.0.0.6" });
    const campaignEnquiry = await Enquiry.findOne({ reference: attributed.reference });
    expect(String(campaignEnquiry?.sourceId)).toBe(String(instagram._id));
    expect(campaignEnquiry?.attribution?.campaign).toBe("Spring dinners");
    expect(String(campaignEnquiry?.attribution?.staffId)).toBe(String(staff._id));
    expect(String(campaignEnquiry?.attribution?.linkId)).toBe(link.id);
    expect(await AuditLog.countDocuments({ entityType: "enquiry_link", action: "enquiry_link.create" })).toBe(1);

    for (let attempt = 0; attempt < PUBLIC_ENQUIRY_ATTEMPT_LIMIT; attempt += 1) {
      consumeRateLimit("public-enquiry:10.9.9.9", PUBLIC_ENQUIRY_ATTEMPT_LIMIT, PUBLIC_ENQUIRY_WINDOW_MS);
    }
    await expect(submitPublicEnquiry(payload({ eventTypeId: String(dinner._id), phone: "0711999888", email: "limit@example.com" }), { ip: "10.9.9.9" })).rejects.toThrow(/too many/i);
    expect(await Enquiry.countDocuments({ "contact.email": "limit@example.com" })).toBe(0);
  });
});
