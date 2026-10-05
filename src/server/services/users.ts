import { createHash, randomBytes } from "node:crypto";
import { can, type Role } from "../../domain/permissions";
import { hashPassword } from "../auth";
import { recordAudit } from "../audit";
import { connectDB } from "../db";
import { AppError } from "../errors";
import { ActivityEvent, ApprovalRequest, Booking, Enquiry, EventRecord, Invitation, Task, User } from "../models";
import { deliverInvitation, invitationLinksAreVisible } from "../mail";
import { assertRateLimit } from "../rate-limit";
import { sid } from "../parse";
import type { SessionUser } from "../auth";

const INVITE_MS = 7 * 24 * 60 * 60 * 1000;
const OPEN_STAGES = ["new", "contacted", "qualified", "site_visit", "quote_sent", "negotiation", "deposit_pending", "confirmed"];
const OPEN_BOOKINGS = ["tentative", "awaiting_deposit", "confirmed"];
const LIVE_EVENTS = ["planning", "ready", "live"];
const GENERIC_INVITE = "This invitation link is not valid.";

const MANAGER_ROLES: Role[] = ["administrator", "super_admin"];

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function inviteUrl(token: string) {
  const base = (process.env.APP_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/accept-invite/${token}`;
}

function presentUrl(url: string) {
  return invitationLinksAreVisible() ? url : undefined;
}

async function assertCanAssign(actor: SessionUser, role: Role, target?: { role: string } | null) {
  if (!can(actor.role, "users.manage")) throw new AppError("You cannot manage users.", "forbidden");
  if (role === "super_admin" && actor.role !== "super_admin") throw new AppError("You cannot grant Super Admin.", "forbidden");
  if (target?.role === "super_admin" && actor.role !== "super_admin") throw new AppError("You cannot change a Super Admin.", "forbidden");
}

async function assertKeepsAdministrator(userId: string, nextRole?: Role) {
  const user = await User.findById(userId);
  if (!user || !MANAGER_ROLES.includes(user.role as Role) || user.status !== "active") return;
  const keeps = nextRole ? MANAGER_ROLES.includes(nextRole) : false;
  if (keeps) return;
  const others = await User.countDocuments({
    _id: { $ne: user._id },
    role: { $in: MANAGER_ROLES },
    status: "active",
    archivedAt: null,
  });
  if (others === 0) throw new AppError("HQ needs at least one active administrator.");
}

export async function listUsers(filters: { q?: string; role?: string; status?: string } = {}) {
  await connectDB();
  const query: Record<string, unknown> = { archivedAt: null };
  if (filters.role) query.role = filters.role;
  if (filters.status) query.status = filters.status;
  if (filters.q) {
    const rx = new RegExp(filters.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ name: rx }, { email: rx }];
  }
  const users = await User.find(query).select("name email phone role jobTitle status active invitedAt joinedAt lastLoginAt createdBy").sort({ name: 1 }).lean();
  const creators = await User.find({ _id: { $in: users.map((user) => user.createdBy).filter(Boolean) } }).select("name").lean();
  const names = new Map(creators.map((person) => [sid(person._id), person.name]));
  return users.map((user) => ({
    id: sid(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    role: user.role as Role,
    jobTitle: user.jobTitle || "",
    status: (user.status || (user.active ? "active" : "deactivated")) as "invited" | "active" | "suspended" | "deactivated",
    invitedAt: user.invitedAt || null,
    joinedAt: user.joinedAt || null,
    lastLoginAt: user.lastLoginAt || null,
    createdBy: user.createdBy ? names.get(sid(user.createdBy)) || "" : "",
  }));
}

export async function responsibilitySummary(userId: string) {
  await connectDB();
  const now = new Date();
  const [enquiries, tasks, bookings, events, approvals] = await Promise.all([
    Enquiry.countDocuments({ ownerId: userId, archivedAt: null, stage: { $in: OPEN_STAGES } }),
    Task.countDocuments({ ownerId: userId, archivedAt: null, status: { $in: ["todo", "in_progress"] } }),
    Booking.countDocuments({ ownerId: userId, archivedAt: null, status: { $in: OPEN_BOOKINGS }, endAt: { $gt: now } }),
    EventRecord.countDocuments({ staffIds: userId, archivedAt: null, status: { $in: LIVE_EVENTS } }),
    ApprovalRequest.countDocuments({ requestedBy: userId, status: "pending" }),
  ]);
  return { enquiries, tasks, bookings, events, approvals };
}

async function issueInvitation(actor: SessionUser, user: { _id: unknown; email: string; name: string }) {
  await Invitation.updateMany({ userId: user._id, usedAt: null, revokedAt: null }, { revokedAt: new Date() });
  const token = randomBytes(32).toString("base64url");
  const url = inviteUrl(token);
  await Invitation.create({
    userId: user._id,
    email: user.email,
    tokenHash: tokenHash(token),
    devPreviewUrl: invitationLinksAreVisible() ? url : "",
    expiresAt: new Date(Date.now() + INVITE_MS),
    createdBy: actor.id,
  });
  await deliverInvitation({ to: user.email, name: user.name, url });
  return presentUrl(url);
}

export async function inviteUser(actor: SessionUser, input: { name: string; email: string; role: Role; phone?: string; jobTitle?: string }) {
  await connectDB();
  await assertCanAssign(actor, input.role);
  const email = input.email.toLowerCase().trim();
  const existing = await User.findOne({ email });
  if (existing) throw new AppError("A user with that email already exists.", "conflict");
  const user = await User.create({
    name: input.name.trim(),
    email,
    phone: input.phone || "",
    jobTitle: input.jobTitle || "",
    role: input.role,
    status: "invited",
    active: false,
    passwordHash: "",
    invitedAt: new Date(),
    createdBy: actor.id,
  });
  const inviteUrlValue = await issueInvitation(actor, user);
  await recordAudit({
    actorId: actor.id,
    action: "user.invite",
    entityType: "user",
    entityId: sid(user._id),
    newValue: { email, role: input.role },
  });
  return { id: sid(user._id), inviteUrl: inviteUrlValue };
}

export async function resendInvitation(actor: SessionUser, userId: string) {
  await connectDB();
  if (!can(actor.role, "users.manage")) throw new AppError("You cannot manage users.", "forbidden");
  const user = await User.findById(userId);
  if (!user || user.status !== "invited") throw new AppError("Only an invited person can receive another invitation.");
  const inviteUrlValue = await issueInvitation(actor, user);
  user.invitedAt = new Date();
  await user.save();
  await recordAudit({
    actorId: actor.id,
    action: "user.invite_resend",
    entityType: "user",
    entityId: userId,
    newValue: { email: user.email },
  });
  return { inviteUrl: inviteUrlValue };
}

export async function previewInvitation(token: string, ip: string) {
  assertRateLimit(`invite-preview:${ip}`, 20, 15 * 60 * 1000, GENERIC_INVITE);
  await connectDB();
  const invitation = await Invitation.findOne({ tokenHash: tokenHash(token) });
  if (!invitation || invitation.usedAt || invitation.revokedAt || invitation.expiresAt.getTime() <= Date.now()) {
    throw new AppError(GENERIC_INVITE);
  }
  const user = await User.findById(invitation.userId).select("name email phone jobTitle status");
  if (!user || user.status !== "invited") throw new AppError(GENERIC_INVITE);
  return { name: user.name, email: user.email, phone: user.phone || "", jobTitle: user.jobTitle || "" };
}

export async function acceptInvitation(token: string, input: { name: string; phone?: string; jobTitle?: string; password: string }, ip: string) {
  assertRateLimit(`invite-accept:${ip}`, 8, 15 * 60 * 1000, "Too many attempts. Wait a few minutes and try again.");
  await connectDB();
  const invitation = await Invitation.findOne({ tokenHash: tokenHash(token) });
  if (!invitation || invitation.usedAt || invitation.revokedAt || invitation.expiresAt.getTime() <= Date.now()) {
    throw new AppError(GENERIC_INVITE);
  }
  const user = await User.findById(invitation.userId);
  if (!user || user.status !== "invited") throw new AppError(GENERIC_INVITE);
  user.name = input.name.trim();
  user.phone = input.phone || user.phone;
  user.jobTitle = input.jobTitle || "";
  user.passwordHash = await hashPassword(input.password);
  user.status = "active";
  user.active = true;
  user.joinedAt = new Date();
  user.tokenVersion += 1;
  await user.save();
  invitation.usedAt = new Date();
  invitation.devPreviewUrl = "";
  await invitation.save();
  await recordAudit({
    actorId: sid(user._id),
    action: "user.invite_accept",
    entityType: "user",
    entityId: sid(user._id),
    newValue: { email: user.email },
  });
}

export async function changeUserRole(actor: SessionUser, userId: string, role: Role) {
  await connectDB();
  const user = await User.findById(userId);
  if (!user) throw new AppError("User not found.", "not_found");
  await assertCanAssign(actor, role, user);
  await assertKeepsAdministrator(userId, role);
  const previous = user.role;
  if (previous === role) return;
  user.role = role;
  user.tokenVersion += 1;
  await user.save();
  await recordAudit({
    actorId: actor.id,
    action: "user.role",
    entityType: "user",
    entityId: userId,
    previousValue: { role: previous },
    newValue: { role },
  });
}

async function setAccess(actor: SessionUser, userId: string, status: "active" | "suspended" | "deactivated", action: string) {
  const user = await User.findById(userId);
  if (!user) throw new AppError("User not found.", "not_found");
  if (user.role === "super_admin" && actor.role !== "super_admin") throw new AppError("You cannot change a Super Admin.", "forbidden");
  if (status !== "active") await assertKeepsAdministrator(userId);
  const previous = user.status;
  user.status = status;
  user.active = status === "active";
  user.tokenVersion += 1;
  await user.save();
  await recordAudit({
    actorId: actor.id,
    action,
    entityType: "user",
    entityId: userId,
    previousValue: { status: previous },
    newValue: { status },
  });
}

export async function suspendUser(actor: SessionUser, userId: string) {
  await connectDB();
  if (!can(actor.role, "users.manage")) throw new AppError("You cannot manage users.", "forbidden");
  await setAccess(actor, userId, "suspended", "user.suspend");
}

export async function reactivateUser(actor: SessionUser, userId: string) {
  await connectDB();
  if (!can(actor.role, "users.manage")) throw new AppError("You cannot manage users.", "forbidden");
  const user = await User.findById(userId);
  if (!user || user.status === "invited" || !user.passwordHash) throw new AppError("An invited person needs to accept their invitation first.");
  await setAccess(actor, userId, "active", "user.reactivate");
}

export async function reassignResponsibilities(actor: SessionUser, fromId: string, toId: string) {
  await connectDB();
  if (!can(actor.role, "users.manage")) throw new AppError("You cannot manage users.", "forbidden");
  if (fromId === toId) throw new AppError("Choose a different person.");
  const target = await User.findOne({ _id: toId, status: "active", archivedAt: null });
  if (!target) throw new AppError("Choose an active person to receive the work.");
  const now = new Date();
  const [enquiries, tasks, bookings, events] = await Promise.all([
    Enquiry.updateMany({ ownerId: fromId, archivedAt: null, stage: { $in: OPEN_STAGES } }, { ownerId: toId }),
    Task.updateMany({ ownerId: fromId, archivedAt: null, status: { $in: ["todo", "in_progress"] } }, { ownerId: toId }),
    Booking.updateMany({ ownerId: fromId, archivedAt: null, status: { $in: OPEN_BOOKINGS }, endAt: { $gt: now } }, { ownerId: toId }),
    EventRecord.updateMany({ staffIds: fromId, archivedAt: null, status: { $in: LIVE_EVENTS } }, { $addToSet: { staffIds: toId } }),
  ]);
  await EventRecord.updateMany({ staffIds: fromId, archivedAt: null, status: { $in: LIVE_EVENTS } }, { $pull: { staffIds: fromId } });
  const counts = {
    enquiries: enquiries.modifiedCount,
    tasks: tasks.modifiedCount,
    bookings: bookings.modifiedCount,
    events: events.modifiedCount,
  };
  await recordAudit({
    actorId: actor.id,
    action: "user.reassign",
    entityType: "user",
    entityId: fromId,
    newValue: { toId, ...counts },
  });
  return counts;
}

export async function deactivateUser(actor: SessionUser, userId: string, reassignToId?: string) {
  await connectDB();
  if (!can(actor.role, "users.manage")) throw new AppError("You cannot manage users.", "forbidden");
  const open = await responsibilitySummary(userId);
  const workload = open.enquiries + open.tasks + open.bookings + open.events;
  if (workload > 0) {
    if (!reassignToId) throw new AppError("Reassign their open work before deactivation.");
    await reassignResponsibilities(actor, userId, reassignToId);
  }
  await setAccess(actor, userId, "deactivated", "user.deactivate");
}

export async function deleteInvitedUser(actor: SessionUser, userId: string) {
  await connectDB();
  if (!can(actor.role, "users.manage")) throw new AppError("You cannot manage users.", "forbidden");
  const user = await User.findById(userId);
  if (!user || user.status !== "invited") throw new AppError("Only an unused invitation can be removed.");
  const [enquiries, tasks, bookings, events] = await Promise.all([
    Enquiry.countDocuments({ $or: [{ ownerId: userId }, { createdBy: userId }] }),
    Task.countDocuments({ $or: [{ ownerId: userId }, { createdBy: userId }] }),
    Booking.countDocuments({ $or: [{ ownerId: userId }, { createdBy: userId }] }),
    EventRecord.countDocuments({ staffIds: userId }),
  ]);
  if (enquiries + tasks + bookings + events > 0) throw new AppError("This person has business history. Deactivate them instead.");
  await recordAudit({
    actorId: actor.id,
    action: "user.delete",
    entityType: "user",
    entityId: userId,
    previousValue: { email: user.email, status: user.status },
  });
  await Invitation.deleteMany({ userId });
  await user.deleteOne();
}

export async function getManagedUser(id: string) {
  await connectDB();
  const user = await User.findOne({ _id: id, archivedAt: null }).select("name email phone role jobTitle status active invitedAt joinedAt lastLoginAt createdBy").lean();
  if (!user) throw new AppError("User not found.", "not_found");
  const creator = user.createdBy ? await User.findById(user.createdBy).select("name").lean() : null;
  const invitations = await Invitation.find({ userId: id }).select("email expiresAt usedAt revokedAt createdAt createdBy devPreviewUrl").sort({ createdAt: -1 }).lean();
  const showLinks = invitationLinksAreVisible();
  const [enquiries, tasks, events, activityOwners] = await Promise.all([
    Enquiry.find({ ownerId: id, archivedAt: null }).select("reference stage contact.fullName").sort({ updatedAt: -1 }).limit(12).lean(),
    Task.find({ ownerId: id, archivedAt: null }).select("title status dueAt").sort({ dueAt: 1 }).limit(12).lean(),
    EventRecord.find({ $or: [{ ownerId: id }, { staffIds: id }], archivedAt: null, status: { $in: LIVE_EVENTS } }).select("reference status startAt").sort({ startAt: 1 }).limit(8).lean(),
    responsibilitySummary(id),
  ]);
  const activity = await ActivityEvent.find({ actorId: id }).sort({ createdAt: -1 }).limit(8).select("summary createdAt").lean();
  return {
    user: {
      id,
      name: user.name,
      email: user.email,
      phone: user.phone || "",
      role: user.role as Role,
      jobTitle: user.jobTitle || "",
      status: (user.status || "active") as "invited" | "active" | "suspended" | "deactivated",
      invitedAt: user.invitedAt || null,
      joinedAt: user.joinedAt || null,
      lastLoginAt: user.lastLoginAt || null,
      createdBy: creator?.name || "",
    },
    invitations: invitations.map((invitation) => ({
      id: sid(invitation._id),
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      usedAt: invitation.usedAt,
      revokedAt: invitation.revokedAt,
      devPreviewUrl: showLinks ? invitation.devPreviewUrl || "" : "",
    })),
    enquiries,
    tasks,
    events,
    open: activityOwners,
    activity,
  };
}

export async function listActiveAssignees() {
  await connectDB();
  return User.find({ status: "active", archivedAt: null }).select("name role").sort({ name: 1 }).lean();
}
