"use server";

import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { actionError, type ActionResult } from "@/server/errors";
import { submitPublicEnquiry, type PublicEnquiryReceipt } from "@/server/services/public-enquiry";

async function clientIp() {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || headerList.get("x-real-ip") || "local").slice(0, 64);
}

export async function submitPublicEnquiryAction(input: unknown): Promise<ActionResult<PublicEnquiryReceipt>> {
  try {
    const data = await submitPublicEnquiry(input, { ip: await clientIp() });
    return { ok: true, data };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ZodError) return { ok: false, error: error.issues[0]?.message || "Check the form." };
    return actionError(error);
  }
}
