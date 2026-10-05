import { z } from "zod";

export const PUBLIC_CONSENT_VERSION = "enquiry-response-v1";

export const PUBLIC_CONSENT_TEXT =
  "HQ may use these details to respond to this event enquiry.";

export const PUBLIC_BUDGET_BANDS = [
  { id: "under-50", label: "Under KSh 50,000", minShillings: 0, maxShillings: 50_000 },
  { id: "50-150", label: "KSh 50,000 – 150,000", minShillings: 50_000, maxShillings: 150_000 },
  { id: "150-400", label: "KSh 150,000 – 400,000", minShillings: 150_000, maxShillings: 400_000 },
  { id: "over-400", label: "Over KSh 400,000", minShillings: 400_000, maxShillings: null },
] as const;

export type PublicBudgetBand = (typeof PUBLIC_BUDGET_BANDS)[number]["id"];

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Choose a valid option.");

function clean(value: string, max: number) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

const bounded = (max: number) => z.string().transform((value) => clean(value, max));

export const publicEnquirySchema = z.object({
  fullName: bounded(120).refine((value) => value.length >= 2, "Enter your full name."),
  email: bounded(160).refine((value) => z.email().safeParse(value.toLowerCase()).success, "Enter a valid email address."),
  phone: bounded(30).refine((value) => value.replace(/\D/g, "").length >= 7, "Enter a phone or WhatsApp number."),
  organization: bounded(160).default(""),
  eventTypeId: objectId,
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a preferred date."),
  alternativeDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default(""),
  startTime: z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]).default(""),
  endTime: z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]).default(""),
  estimatedGuests: z.coerce.number().int().min(1, "Enter the number of guests.").max(5000),
  spaceId: z.union([z.literal(""), objectId]).default(""),
  budgetBand: z.enum(["", "under-50", "50-150", "150-400", "over-400"]).default(""),
  serviceIds: z.array(objectId).max(24).default([]),
  experience: bounded(2000).default(""),
  consent: z.boolean().refine((value) => value, PUBLIC_CONSENT_TEXT),
  companyWebsite: bounded(200).default(""),
  ref: bounded(80).default(""),
  captchaToken: bounded(2000).default(""),
});

export type PublicEnquiryInput = z.infer<typeof publicEnquirySchema>;

export function budgetBand(id?: string | null) {
  return PUBLIC_BUDGET_BANDS.find((band) => band.id === id) || null;
}

export function firstNameOf(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || fullName.trim();
}
