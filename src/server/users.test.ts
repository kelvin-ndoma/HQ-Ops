import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { hashPassword } from "./auth";
import { clearRateLimits } from "./rate-limit";

let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri("hqops-users");
  process.env.AUTH_SECRET = "test-secret-must-be-long";
  process.env.APP_ORIGIN = "http://localhost:3000";
  const { connectDB } = await import("./db");
  await connectDB();
}, 180000);

afterAll(async () => {
  const { disconnectDB } = await import("./db");
  await disconnectDB();
  await replSet.stop();
});

beforeEach(() => clearRateLimits());

describe("users and access", () => {
  it("invites, expires, resends, and accepts without exposing production links", async () => {
    const { User, Invitation, AuditLog, Enquiry, Task, EventType, LeadSource } = await import("./models");
    const { inviteUser, acceptInvitation, resendInvitation, changeUserRole, suspendUser, reactivateUser, deactivateUser, previewInvitation } = await import("./services/users");
    const { authenticate, isSessionCurrent } = await import("./auth");
    const { createEnquiry } = await import("./services/crm");
    const adminUser = await User.create({ name: "Samuel Kimani", email: "samuel-access@test.local", role: "administrator", passwordHash: await hashPassword("ChangeMe-HQ-2026"), status: "active", active: true });
    const otherAdmin = await User.create({ name: "Amina Hassan", email: "amina-access@test.local", role: "administrator", passwordHash: await hashPassword("ChangeMe-HQ-2026"), status: "active", active: true });
    const admin = { id: String(adminUser._id), name: adminUser.name, email: adminUser.email, role: "administrator" as const };
    const leader = { id: String(otherAdmin._id), name: otherAdmin.name, email: otherAdmin.email, role: "leadership" as const };
    await expect(inviteUser(leader, { name: "Njeri Abdi", email: "njeri-access@test.local", role: "event_staff" })).rejects.toThrow(/manage/i);
    await expect(inviteUser(admin, { name: "Kelvin", email: "root-access@test.local", role: "super_admin" })).rejects.toThrow(/super admin/i);

    const env = process.env as Record<string, string | undefined>;
    const previousEnv = env.NODE_ENV;
    env.NODE_ENV = "production";
    const hidden = await inviteUser(admin, { name: "Hidden Invite", email: "hidden-access@test.local", role: "finance" });
    expect(hidden.inviteUrl).toBeUndefined();
    expect((await Invitation.findOne({ email: "hidden-access@test.local" }))?.devPreviewUrl || "").toBe("");
    env.NODE_ENV = previousEnv;

    const created = await inviteUser(admin, { name: "Wanjiku Kariuki", email: "wanjiku-access@test.local", role: "sales_coordinator", jobTitle: "Coordinator" });
    expect(created.inviteUrl).toContain("/accept-invite/");
    const token = created.inviteUrl!.split("/").pop()!;
    expect(await Invitation.findOne({ tokenHash: token })).toBeNull();
    await expect(previewInvitation("not-a-real-token", "10.1.1.1")).rejects.toThrow(/not valid/i);
    const expired = await Invitation.findOne({ email: "wanjiku-access@test.local", revokedAt: null });
    expired!.expiresAt = new Date(Date.now() - 1000);
    await expired!.save();
    await expect(acceptInvitation(token, { name: "Wanjiku Kariuki", password: "ChangeMe-HQ-2026" }, "10.1.1.2")).rejects.toThrow(/not valid/i);

    const resent = await resendInvitation(admin, created.id);
    const nextToken = resent.inviteUrl!.split("/").pop()!;
    await expect(acceptInvitation(token, { name: "Wanjiku Kariuki", password: "ChangeMe-HQ-2026" }, "10.1.1.3")).rejects.toThrow(/not valid/i);
    await acceptInvitation(nextToken, { name: "Wanjiku Kariuki", phone: "0712000000", jobTitle: "Event coordinator", password: "ChangeMe-HQ-2026" }, "10.1.1.4");
    await expect(acceptInvitation(nextToken, { name: "Wanjiku Kariuki", password: "ChangeMe-HQ-2026" }, "10.1.1.5")).rejects.toThrow(/not valid/i);
    const accepted = await User.findOne({ email: "wanjiku-access@test.local" });
    expect(accepted?.status).toBe("active");
    expect(accepted?.passwordHash).not.toContain("ChangeMe");
    expect(await authenticate("wanjiku-access@test.local", "ChangeMe-HQ-2026")).toBeTruthy();

    const before = accepted!.tokenVersion;
    expect(isSessionCurrent(accepted!, before)).toBe(true);
    await changeUserRole(admin, String(accepted!._id), "operations_lead");
    const changed = await User.findById(accepted!._id);
    expect(changed?.role).toBe("operations_lead");
    expect(isSessionCurrent(changed!, before)).toBe(false);

    await suspendUser(admin, String(changed!._id));
    await expect(authenticate("wanjiku-access@test.local", "ChangeMe-HQ-2026")).rejects.toThrow(/active account/i);
    await reactivateUser(admin, String(changed!._id));
    expect((await User.findById(changed!._id))?.status).toBe("active");

    const eventType = await EventType.create({ name: "Dinner", slug: "dinner-users", active: true });
    const source = await LeadSource.create({ name: "Phone", slug: "phone-users", active: true });
    const sales = { id: String(changed!._id), name: "Wanjiku Kariuki", email: "wanjiku-access@test.local", role: "operations_lead" as const };
    const enquiryId = await createEnquiry(sales, {
      fullName: "Achieng Odhiambo", phone: "0799111000", email: "achieng-users@test.local", preferredContact: "phone", eventTypeId: String(eventType._id), sourceId: String(source._id), ownerId: sales.id, priority: "normal", spaceIds: [],
    });
    const kept = await Task.create({ title: "Completed briefing", ownerId: sales.id, status: "completed", relatedType: "general", createdBy: sales.id });
    const openTask = await Task.create({ title: "Call the client", ownerId: sales.id, status: "todo", relatedType: "enquiry", relatedId: enquiryId, createdBy: sales.id });
    await expect(deactivateUser(admin, sales.id)).rejects.toThrow(/reassign/i);
    await deactivateUser(admin, sales.id, admin.id);
    expect(String((await Enquiry.findById(enquiryId))?.ownerId)).toBe(admin.id);
    expect(String((await Task.findById(openTask._id))?.ownerId)).toBe(admin.id);
    expect(String((await Task.findById(kept._id))?.ownerId)).toBe(sales.id);
    expect(await AuditLog.countDocuments({ entityId: enquiryId, action: "enquiry.create" })).toBe(1);
    expect((await User.findById(sales.id))?.status).toBe("deactivated");

    await expect(changeUserRole(admin, String(otherAdmin._id), "finance")).resolves.toBeUndefined();
    await expect(changeUserRole(admin, admin.id, "finance")).rejects.toThrow(/administrator/i);
    expect(await AuditLog.countDocuments({ action: "user.invite" })).toBeGreaterThan(0);
    expect(await AuditLog.countDocuments({ action: "user.reassign" })).toBe(1);
  });
});
