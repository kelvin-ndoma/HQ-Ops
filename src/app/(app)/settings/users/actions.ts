"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import type { Role } from "@/domain/permissions";
import { inviteUserSchema } from "@/domain/schemas";
import { actionError, type ActionResult } from "@/server/errors";
import { requirePermission, requireUser } from "@/server/guard";
import { changeUserRole, deactivateUser, deleteInvitedUser, inviteUser, reactivateUser, resendInvitation, responsibilitySummary, suspendUser } from "@/server/services/users";

function fail(error: unknown): ActionResult<never> {
  unstable_rethrow(error);
  if (error instanceof ZodError) return { ok: false, error: error.issues[0]?.message || "Check the form." };
  return actionError(error);
}

export async function inviteUserAction(input: unknown): Promise<ActionResult<{ inviteUrl?: string }>> {
  const user = await requireUser();
  try {
    requirePermission(user, "users.manage");
    const parsed = inviteUserSchema.parse(input);
    const result = await inviteUser(user, parsed);
    revalidatePath("/settings/users");
    return { ok: true, data: { inviteUrl: result.inviteUrl } };
  } catch (error) {
    return fail(error);
  }
}

export async function resendInvitationAction(userId: string): Promise<ActionResult<{ inviteUrl?: string }>> {
  const user = await requireUser();
  try {
    requirePermission(user, "users.manage");
    const result = await resendInvitation(user, userId);
    revalidatePath(`/settings/users/${userId}`);
    return { ok: true, data: { inviteUrl: result.inviteUrl } };
  } catch (error) {
    return fail(error);
  }
}

export async function changeRoleAction(userId: string, role: Role): Promise<ActionResult> {
  const user = await requireUser();
  try {
    requirePermission(user, "users.manage");
    await changeUserRole(user, userId, role);
    revalidatePath("/settings/users");
    revalidatePath(`/settings/users/${userId}`);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function suspendUserAction(userId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    requirePermission(user, "users.manage");
    await suspendUser(user, userId);
    revalidatePath(`/settings/users/${userId}`);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function reactivateUserAction(userId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    requirePermission(user, "users.manage");
    await reactivateUser(user, userId);
    revalidatePath(`/settings/users/${userId}`);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function workloadAction(userId: string): Promise<ActionResult<{ enquiries: number; tasks: number; bookings: number; events: number; approvals: number }>> {
  const user = await requireUser();
  try {
    requirePermission(user, "users.manage");
    return { ok: true, data: await responsibilitySummary(userId) };
  } catch (error) {
    return fail(error);
  }
}

export async function deactivateUserAction(userId: string, reassignToId?: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    requirePermission(user, "users.manage");
    await deactivateUser(user, userId, reassignToId || undefined);
    revalidatePath("/settings/users");
    revalidatePath(`/settings/users/${userId}`);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteInvitedUserAction(userId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    requirePermission(user, "users.manage");
    await deleteInvitedUser(user, userId);
    revalidatePath("/settings/users");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
