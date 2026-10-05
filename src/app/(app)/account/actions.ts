"use server";

import { ZodError } from "zod";
import { changePasswordSchema } from "@/domain/schemas";
import { changePassword, currentSessionRemembers, setSessionCookie, signToken } from "@/server/auth";
import { recordAudit } from "@/server/audit";
import { AppError } from "@/server/errors";
import { requireUser } from "@/server/guard";

export async function changePasswordAction(_prev: { error: string; ok: boolean }, formData: FormData) {
  const user = await requireUser();
  try {
    const parsed = changePasswordSchema.parse({
      currentPassword: String(formData.get("currentPassword") || ""),
      newPassword: String(formData.get("newPassword") || ""),
      confirmPassword: String(formData.get("confirmPassword") || ""),
    });
    const updated = await changePassword(user.id, parsed.currentPassword, parsed.newPassword);
    const remember = await currentSessionRemembers();
    const token = await signToken({
      id: String(updated._id),
      role: updated.role,
      tokenVersion: updated.tokenVersion,
      name: updated.name,
      email: updated.email,
    }, remember);
    await setSessionCookie(token, remember);
    await recordAudit({
      actorId: user.id,
      action: "user.password",
      entityType: "user",
      entityId: user.id,
      reason: "Password changed by the account holder.",
    });
    return { error: "", ok: true };
  } catch (error) {
    if (error instanceof ZodError) return { error: error.issues[0]?.message || "Check the passwords and try again.", ok: false };
    if (error instanceof AppError) return { error: error.message, ok: false };
    return { error: "The password could not be changed.", ok: false };
  }
}
