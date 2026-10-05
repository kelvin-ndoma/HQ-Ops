"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { actionError, type ActionResult } from "@/server/errors";
import { requirePermission, requireUser } from "@/server/guard";
import { createEnquiryLink } from "@/server/services/public-enquiry";

export async function createEnquiryLinkAction(input: { sourceId: string; campaign?: string; staffId?: string }): Promise<ActionResult<{ token: string }>> {
  const user = await requireUser();
  try {
    requirePermission(user, "enquiries.write");
    const link = await createEnquiryLink(user, input);
    revalidatePath("/enquiries/share");
    return { ok: true, data: { token: link.token } };
  } catch (error) {
    unstable_rethrow(error);
    return actionError(error);
  }
}
