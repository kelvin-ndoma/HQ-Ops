"use server";

import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { acceptInviteSchema } from "@/domain/schemas";
import { actionError, type ActionResult } from "@/server/errors";
import { acceptInvitation } from "@/server/services/users";

async function clientIp() {
  const headerList = await headers();
  return (headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "local").slice(0, 64);
}

export async function acceptInvitationAction(input: unknown): Promise<ActionResult> {
  try {
    const parsed = acceptInviteSchema.parse(input);
    await acceptInvitation(parsed.token, parsed, await clientIp());
    return { ok: true };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ZodError) return { ok: false, error: error.issues[0]?.message || "Check the form." };
    return actionError(error);
  }
}
