import { hashPassword } from "../auth";
import { recordAudit } from "../audit";
import { connectDB } from "../db";
import { AppError } from "../errors";
import { User } from "../models";
import { sid } from "../parse";
import type { Role } from "../../domain/permissions";
import type { SessionUser } from "../auth";

export async function listUsers() {
  await connectDB();
  return User.find({ archivedAt: null }).select("name email phone role active lastLoginAt").sort({ name: 1 }).lean();
}

export async function createManagedUser(actor: SessionUser, input: { name: string; email: string; phone?: string; role: Role; password: string }) {
  await connectDB();
  const existing = await User.findOne({ email: input.email.toLowerCase() });
  if (existing) throw new AppError("A user with that email already exists.", "conflict");
  const user = await User.create({
    name: input.name,
    email: input.email.toLowerCase(),
    phone: input.phone || "",
    role: input.role,
    passwordHash: await hashPassword(input.password),
  });
  await recordAudit({
    actorId: actor.id,
    action: "user.create",
    entityType: "user",
    entityId: sid(user._id),
    newValue: { email: user.email, role: user.role },
  });
  return sid(user._id);
}

export async function updateManagedUser(actor: SessionUser, id: string, patch: { role?: Role; active?: boolean }) {
  await connectDB();
  const user = await User.findById(id);
  if (!user) throw new AppError("User not found.", "not_found");
  const previous = { role: user.role, active: user.active };
  if (patch.role) user.role = patch.role;
  if (patch.active !== undefined) user.active = patch.active;
  user.tokenVersion += 1;
  await user.save();
  await recordAudit({
    actorId: actor.id,
    action: "user.update",
    entityType: "user",
    entityId: id,
    previousValue: previous,
    newValue: { role: user.role, active: user.active },
  });
}
