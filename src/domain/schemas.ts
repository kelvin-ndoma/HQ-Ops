import { z } from "zod";
import { ENQUIRY_EXITS, ENQUIRY_STAGES, PROCUREMENT_STATUSES, QUOTE_STATUSES } from "./states";

const optionalText = z.string().trim().optional().or(z.literal(""));
const optionalEmail = z.union([z.literal(""), z.email()]).optional();

export const enquirySchema = z.object({
  fullName: z.string().trim().min(2, "Enter the client name."),
  organization: optionalText,
  phone: z.string().trim().min(7, "Enter a phone number."),
  email: optionalEmail,
  preferredContact: z.enum(["phone", "email", "whatsapp"]),
  clientId: z.string().optional().or(z.literal("")),
  forceNewClient: z.boolean().optional(),
  eventTypeId: z.string().min(1, "Choose an event type."),
  preferredDate: optionalText,
  alternativeDate: optionalText,
  startTime: optionalText,
  endTime: optionalText,
  estimatedGuests: z.number().int().positive().optional(),
  spaceIds: z.array(z.string()).default([]),
  budgetMinShillings: z.number().nonnegative().optional(),
  budgetMaxShillings: z.number().nonnegative().optional(),
  requirements: optionalText,
  notes: optionalText,
  sourceId: z.string().min(1, "Choose how this enquiry arrived."),
  referralDetail: optionalText,
  ownerId: z.string().optional().or(z.literal("")),
  estimatedValueShillings: z.number().nonnegative().optional(),
  nextAction: optionalText,
  nextActionDate: optionalText,
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
});

export const enquiryUpdateSchema = enquirySchema.partial().extend({
  id: z.string().min(1),
});

export const stageSchema = z.object({
  id: z.string().min(1),
  stage: z.enum([...ENQUIRY_STAGES, ...ENQUIRY_EXITS]),
  lostReasonId: z.string().optional().or(z.literal("")),
  lostNotes: optionalText,
  reason: optionalText,
});

export const clientSchema = z.object({
  kind: z.enum(["individual", "organization"]),
  name: z.string().trim().min(2),
  organizationName: optionalText,
  phone: z.string().trim().min(7),
  email: optionalEmail,
  preferredContact: z.enum(["phone", "email", "whatsapp"]),
  notes: optionalText,
  forceNew: z.boolean().optional(),
});

export const visitSchema = z.object({
  enquiryId: z.string().min(1),
  scheduledDate: z.string().min(8),
  scheduledTime: z.string().min(4),
  assignedToId: z.string().min(1),
  spaceIds: z.array(z.string()).default([]),
  notes: optionalText,
});

export const visitOutcomeSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["completed", "no_show", "rescheduled", "cancelled", "scheduled"]),
  outcome: z.enum(["interested", "maybe", "not_suitable"]).optional(),
  outcomeNotes: optionalText,
  scheduledDate: optionalText,
  scheduledTime: optionalText,
});

export const quoteLineSchema = z.object({
  serviceItemId: z.string().optional().or(z.literal("")),
  description: z.string().trim().min(2),
  quantity: z.number().positive(),
  unitPriceShillings: z.number().nonnegative(),
  discountShillings: z.number().nonnegative().optional(),
  taxRate: z.number().nonnegative().optional(),
});

export const quoteSchema = z.object({
  enquiryId: z.string().min(1),
  spaceIds: z.array(z.string()).default([]),
  notes: optionalText,
  terms: optionalText,
  headerDiscountShillings: z.number().nonnegative().optional(),
  lines: z.array(quoteLineSchema).min(1),
});

export const quoteReviseSchema = quoteSchema.extend({
  quotationId: z.string().min(1),
  reason: z.string().trim().min(3, "Say why this revision exists."),
});

export const bookingSchema = z.object({
  enquiryId: z.string().optional().or(z.literal("")),
  quotationId: z.string().optional().or(z.literal("")),
  clientId: z.string().min(1),
  eventDate: z.string().min(8),
  endDate: optionalText,
  startTime: z.string().min(4),
  endTime: z.string().min(4),
  spaceIds: z.array(z.string()).min(1, "Choose at least one space."),
  guestCount: z.number().int().positive(),
  agreedShillings: z.number().nonnegative(),
  paymentDeadline: optionalText,
  specialConditions: optionalText,
  ownerId: z.string().optional().or(z.literal("")),
  mode: z.enum(["hold", "commit"]),
});

export const confirmBookingSchema = z.object({
  id: z.string().min(1),
  overrideDeposit: z.boolean().optional(),
  reason: optionalText,
});

export const cancelBookingSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().min(3, "A cancellation reason is required."),
});

export const paymentSchema = z.object({
  clientId: z.string().min(1),
  bookingId: z.string().min(1),
  type: z.enum(["deposit", "balance", "additional_charge", "refund"]),
  amountShillings: z.number().positive(),
  methodId: z.string().min(1),
  paidAt: z.string().min(8),
  reference: optionalText,
  notes: optionalText,
  idempotencyKey: z.string().min(8),
});

export const taskSchema = z.object({
  title: z.string().trim().min(2),
  description: optionalText,
  ownerId: z.string().min(1),
  dueAt: optionalText,
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  relatedType: z.enum([
    "enquiry",
    "client",
    "site_visit",
    "quotation",
    "booking",
    "event",
    "vendor",
    "inventory",
    "general",
  ]),
  relatedId: z.string().optional().or(z.literal("")),
});

export const stockMoveSchema = z.object({
  itemId: z.string().min(1),
  type: z.enum(["stock_in", "stock_out", "adjustment", "damage", "loss"]),
  quantity: z.number().positive(),
  reason: z.string().trim().min(3),
  eventId: z.string().optional().or(z.literal("")),
  override: z.boolean().optional(),
});

export const reservationSchema = z.object({
  eventId: z.string().min(1),
  itemId: z.string().min(1),
  quantity: z.number().int().positive(),
  override: z.boolean().optional(),
  reason: optionalText,
});

export const vendorSchema = z.object({
  name: z.string().trim().min(2),
  contactName: optionalText,
  phone: optionalText,
  email: optionalEmail,
  categoryId: z.string().min(1),
  services: optionalText,
  pricingNotes: optionalText,
  paymentTerms: optionalText,
  notes: optionalText,
  preferred: z.boolean().optional(),
});

export const eventVendorSchema = z.object({
  eventId: z.string().min(1),
  vendorId: z.string().min(1),
  service: z.string().trim().min(2),
  quotedShillings: z.number().nonnegative().optional(),
  agreedShillings: z.number().nonnegative().optional(),
  notes: optionalText,
});

export const procurementSchema = z.object({
  item: z.string().trim().min(2),
  quantity: z.number().positive(),
  reason: z.string().trim().min(3),
  estimatedShillings: z.number().nonnegative().optional(),
  vendorId: z.string().optional().or(z.literal("")),
  eventId: z.string().optional().or(z.literal("")),
  relatedType: z.enum(["event", "inventory", "general"]),
});

export const procurementTransitionSchema = z.object({
  id: z.string().min(1),
  status: z.enum(PROCUREMENT_STATUSES),
  note: optionalText,
  finalShillings: z.number().nonnegative().optional(),
});

export const costSchema = z.object({
  eventId: z.string().min(1),
  category: z.string().trim().min(2),
  description: z.string().trim().min(2),
  amountShillings: z.number().nonnegative(),
  vendorId: z.string().optional().or(z.literal("")),
});

export const userSchema = z.object({
  name: z.string().trim().min(2),
  email: z.email(),
  phone: optionalText,
  role: z.enum(["super_admin", "leadership", "operations_lead", "sales_coordinator", "event_staff", "finance", "administrator"]),
  password: z.string().min(10, "Use at least 10 characters."),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  remember: z.boolean().optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().min(10, "Use at least 10 characters."),
    confirmPassword: z.string().min(10, "Confirm the new password."),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "The new passwords do not match.",
    path: ["confirmPassword"],
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    message: "Choose a password that is different from the current one.",
    path: ["newPassword"],
  });

export const noteSchema = z.object({
  entityType: z.string().min(2),
  entityId: z.string().min(1),
  body: z.string().trim().min(2),
});

export const quoteStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(QUOTE_STATUSES),
  reason: optionalText,
});

export type EnquiryInput = z.infer<typeof enquirySchema>;
export type ClientInput = z.infer<typeof clientSchema>;
export type VisitInput = z.infer<typeof visitSchema>;
export type QuoteInput = z.infer<typeof quoteSchema>;
export type BookingInput = z.infer<typeof bookingSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
