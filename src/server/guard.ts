import { can, type Permission } from "../domain/permissions";
import type { SessionUser } from "./auth";
import { AppError } from "./errors";
import { getCurrentUser } from "./auth";
import { redirect } from "next/navigation";

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function requirePermission(user: SessionUser, permission: Permission) {
  if (!can(user.role, permission)) {
    throw new AppError("You do not have permission to do that.", "forbidden");
  }
}
