import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { spaceReserved } from "../domain/states";

let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri("hqops-seed");
  process.env.AUTH_SECRET = "test-secret-must-be-long";
  const { connectDB } = await import("./db");
  await connectDB();
}, 180000);

afterAll(async () => {
  const { disconnectDB } = await import("./db");
  await disconnectDB();
  await replSet.stop();
});

describe("development seed", () => {
  it("connects clients, enquiries, bookings and stock without calendar clashes", async () => {
    const { seedDevelopment } = await import("./seed");
    const seeded = await seedDevelopment();
    expect(seeded.skipped).toBe(false);
    const { Booking, Client, Enquiry, InventoryItem, QuotationVersion, User, Vendor } = await import("./models");
    expect(await User.countDocuments({ email: /@hq\.local$/ })).toBeGreaterThanOrEqual(6);
    expect(await Client.countDocuments()).toBeGreaterThanOrEqual(20);
    expect(await Enquiry.countDocuments()).toBeGreaterThanOrEqual(30);
    expect(await Vendor.countDocuments()).toBeGreaterThanOrEqual(12);
    const clients = new Set((await Client.find().select("_id")).map((client) => String(client._id)));
    for (const enquiry of await Enquiry.find().select("clientId")) {
      expect(clients.has(String(enquiry.clientId))).toBe(true);
    }
    const bookings = await Booking.find({ archivedAt: null }).lean();
    const now = new Date();
    for (let index = 0; index < bookings.length; index += 1) {
      for (let other = index + 1; other < bookings.length; other += 1) {
        const left = bookings[index];
        const right = bookings[other];
        const sharesSpace = (left.spaceIds || []).some((spaceId: { toString(): string }) => (right.spaceIds || []).map(String).includes(String(spaceId)));
        const sharesTime = new Date(left.startAt) < new Date(right.endAt) && new Date(right.startAt) < new Date(left.endAt);
        if (sharesSpace && sharesTime) {
          expect(spaceReserved(left, now) && spaceReserved(right, now)).toBe(false);
        }
      }
    }
    for (const item of await InventoryItem.find()) {
      expect(item.quantityOnHand - item.quantityReserved - item.quantityCheckedOut).toBeGreaterThanOrEqual(0);
      expect(item.quantityOnHand).toBeGreaterThanOrEqual(0);
    }
    expect(await QuotationVersion.countDocuments()).toBeGreaterThan(await (await import("./models")).Quotation.countDocuments());
    const { verifyDevelopmentSeed } = await import("./seed");
    const summary = await verifyDevelopmentSeed();
    expect(summary.enquiries).toBeGreaterThanOrEqual(30);
    const { listPipeline } = await import("./services/crm");
    const board = await listPipeline();
    expect(board.cards.length).toBeGreaterThanOrEqual(30);
  }, 180000);

  it("rebuilds demo data and keeps a bootstrap super admin", async () => {
    const { User, Enquiry } = await import("./models");
    const { hashPassword } = await import("./auth");
    await User.create({ name: "Kept Admin", email: "kept-admin@test.local", role: "super_admin", passwordHash: await hashPassword("ChangeMe-HQ-2026"), status: "active", active: true });
    const { seedDevelopment } = await import("./seed");
    const rebuilt = await seedDevelopment({ reset: true });
    expect(rebuilt.skipped).toBe(false);
    expect(await User.countDocuments({ email: "kept-admin@test.local", role: "super_admin" })).toBe(1);
    expect(await Enquiry.countDocuments()).toBeGreaterThanOrEqual(30);
    const skipped = await seedDevelopment();
    expect(skipped.skipped).toBe(true);
    expect(await Enquiry.countDocuments()).toBeGreaterThanOrEqual(30);
  }, 180000);
});
