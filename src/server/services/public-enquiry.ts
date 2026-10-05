import { randomBytes } from "node:crypto";
import { can } from "../../domain/permissions";
import { budgetBand, firstNameOf, PUBLIC_CONSENT_VERSION, publicEnquirySchema } from "../../domain/public-enquiry";
import { formatWhen, normalizePhone } from "../../domain/operations";
import type { SessionUser } from "../auth";
import { verifyCaptcha } from "../captcha";
import { recordActivity, recordAudit } from "../audit";
import { connectDB } from "../db";
import { AppError } from "../errors";
import { Enquiry, EnquiryLink, EventType, LeadSource, ServiceItem, Space, User } from "../models";
import { notifyRoles } from "../notifications";
import { asDate, shillings, sid } from "../parse";
import { assertRateLimit } from "../rate-limit";
import { nextReference } from "../references";
import { getAssignment } from "../settings";
import { onEnquiryCreated } from "../automation";
import { openClientForEnquiry } from "./crm";

export const PUBLIC_ENQUIRY_WINDOW_MS = 15 * 60 * 1000;
export const PUBLIC_ENQUIRY_ATTEMPT_LIMIT = 20;
const DUPLICATE_MS = 15 * 60 * 1000;

export type PublicEnquiryReceipt = {
  firstName: string;
  reference: string | null;
  eventDate: string;
  suppressed: boolean;
};

async function websiteSource() {
  return LeadSource.findOne({ active: true, slug: "website" }) || LeadSource.findOne({ active: true, name: "Website" });
}

export async function resolveAttribution(token?: string | null) {
  const fallback = await websiteSource();
  const clean = (token || "").trim();
  if (!clean) return { source: fallback, campaign: "", staffId: null as string | null, linkId: null as string | null };
  const link = await EnquiryLink.findOne({ token: clean, active: true });
  if (!link) return { source: fallback, campaign: "", staffId: null as string | null, linkId: null as string | null };
  const source = await LeadSource.findOne({ _id: link.sourceId, active: true });
  return {
    source: source || fallback,
    campaign: link.campaign || "",
    staffId: link.staffId ? sid(link.staffId) : null,
    linkId: sid(link._id),
  };
}

export async function publicFormOptions() {
  await connectDB();
  const [eventTypes, spaces, services] = await Promise.all([
    EventType.find({ active: true }).select("name").sort({ sort: 1, name: 1 }).lean(),
    Space.find({ active: true }).select("name").sort({ name: 1 }).lean(),
    ServiceItem.find({ active: true }).select("name").sort({ name: 1 }).lean(),
  ]);
  return {
    eventTypes: eventTypes.map((item) => ({ id: sid(item._id), name: item.name })),
    spaces: spaces.map((item) => ({ id: sid(item._id), name: item.name })),
    services: services.map((item) => ({ id: sid(item._id), name: item.name })),
  };
}

export async function submitPublicEnquiry(raw: unknown, context: { ip: string }): Promise<PublicEnquiryReceipt> {
  await connectDB();
  assertRateLimit(
    `public-enquiry:${context.ip}`,
    PUBLIC_ENQUIRY_ATTEMPT_LIMIT,
    PUBLIC_ENQUIRY_WINDOW_MS,
    "Too many enquiries from this connection. Please wait a little and try again.",
  );
  const input = publicEnquirySchema.parse(raw);
  const firstName = firstNameOf(input.fullName);
  const eventDate = formatWhen(asDate(input.preferredDate));
  if (input.companyWebsite) {
    return { firstName, reference: null, eventDate, suppressed: true };
  }
  await verifyCaptcha(input.captchaToken || undefined, context.ip);

  const eventType = await EventType.findOne({ _id: input.eventTypeId, active: true });
  if (!eventType) throw new AppError("Choose an event type.");
  const spaceIds: string[] = [];
  if (input.spaceId) {
    const space = await Space.findOne({ _id: input.spaceId, active: true }).select("_id");
    if (!space) throw new AppError("Choose a space, or leave the preference blank.");
    spaceIds.push(sid(space._id));
  }
  const serviceIds = input.serviceIds || [];
  if (serviceIds.length) {
    const found = await ServiceItem.find({ _id: { $in: serviceIds }, active: true }).select("_id");
    if (found.length !== serviceIds.length) throw new AppError("One of the selected requirements is no longer available.");
  }

  const attribution = await resolveAttribution(input.ref);
  const email = input.email.toLowerCase();
  const phoneNormalized = normalizePhone(input.phone);
  const preferred = asDate(input.preferredDate);
  const duplicate = await Enquiry.findOne({
    origin: "public_form",
    archivedAt: null,
    "contact.phoneNormalized": phoneNormalized,
    "contact.email": email,
    eventTypeId: eventType._id,
    preferredDate: preferred,
    createdAt: { $gte: new Date(Date.now() - DUPLICATE_MS) },
  });
  if (duplicate) {
    return { firstName, reference: duplicate.reference, eventDate, suppressed: false };
  }

  const assignment = await getAssignment();
  let ownerId = assignment.defaultOwnerId || "";
  if (ownerId) {
    const owner = await User.findOne({ _id: ownerId, active: true, archivedAt: null }).select("_id");
    if (!owner) ownerId = "";
  }
  const { client, linked } = await openClientForEnquiry(
    {
      fullName: input.fullName,
      organization: input.organization || "",
      phone: input.phone,
      email,
      preferredContact: "whatsapp",
    },
    null,
  );
  const band = budgetBand(input.budgetBand);
  const now = new Date();
  const reference = await nextReference("ENQ");
  const experience = input.experience || "";
  const enquiry = await Enquiry.create({
    reference,
    clientId: client._id,
    contact: {
      fullName: input.fullName,
      organization: input.organization || "",
      phone: input.phone,
      phoneNormalized,
      email,
      preferredContact: "whatsapp",
    },
    eventTypeId: eventType._id,
    preferredDate: preferred,
    alternativeDate: asDate(input.alternativeDate),
    startTime: input.startTime || "",
    endTime: input.endTime || "",
    estimatedGuests: input.estimatedGuests,
    spaceIds,
    budgetMinCents: band ? shillings(band.minShillings) : undefined,
    budgetMaxCents: band?.maxShillings == null ? undefined : shillings(band.maxShillings),
    requirements: experience,
    experience,
    requestedServiceIds: serviceIds,
    notes: "",
    sourceId: attribution.source?._id,
    origin: "public_form",
    attribution: {
      campaign: attribution.campaign,
      linkId: attribution.linkId || undefined,
      staffId: attribution.staffId || undefined,
      submittedAt: now,
      consentAt: now,
      consentVersion: PUBLIC_CONSENT_VERSION,
    },
    ownerId: ownerId || undefined,
    stage: "new",
    estimatedValueCents: 0,
    nextAction: "Make first contact",
    nextActionAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    priority: "normal",
    lastActivityAt: now,
  });
  await recordActivity({
    entityType: "enquiry",
    entityId: sid(enquiry._id),
    kind: "created",
    summary: linked
      ? `${reference} arrived from the public form and was linked to ${client.name}.`
      : `${reference} arrived from the public form for ${input.fullName}.`,
  });
  await recordAudit({
    action: "enquiry.create",
    entityType: "enquiry",
    entityId: sid(enquiry._id),
    newValue: {
      reference,
      stage: "new",
      origin: "public_form",
      sourceId: attribution.source ? sid(attribution.source._id) : null,
      campaign: attribution.campaign,
      linkId: attribution.linkId,
      ownerId: ownerId || null,
    },
    reason: "Public event enquiry",
  });
  await onEnquiryCreated(enquiry, null);
  if (!ownerId) {
    await notifyRoles(["sales_coordinator", "leadership"], {
      type: "enquiry.assigned",
      title: `New enquiry ${reference}`,
      body: `${input.fullName} sent a public enquiry. It still needs an owner.`,
      href: `/enquiries/${enquiry._id}`,
      dedupeKey: `enquiry-created:${enquiry._id}`,
    });
  }
  return { firstName, reference, eventDate, suppressed: false };
}

export async function createEnquiryLink(
  actor: SessionUser,
  input: { sourceId: string; campaign?: string; staffId?: string },
) {
  await connectDB();
  if (!can(actor.role, "enquiries.write")) throw new AppError("You cannot share the enquiry form.", "forbidden");
  const source = await LeadSource.findOne({ _id: input.sourceId, active: true });
  if (!source) throw new AppError("Choose a source.");
  let staffId = "";
  if (input.staffId) {
    const staff = await User.findOne({ _id: input.staffId, active: true, archivedAt: null }).select("_id");
    if (!staff) throw new AppError("Choose an active staff member, or leave the referral blank.");
    staffId = sid(staff._id);
  }
  const campaign = (input.campaign || "").replace(/[\u0000-\u001F]/g, "").trim().slice(0, 80);
  const token = randomBytes(18).toString("base64url");
  const link = await EnquiryLink.create({
    token,
    sourceId: source._id,
    campaign,
    staffId: staffId || undefined,
    createdBy: actor.id,
  });
  await recordAudit({
    actorId: actor.id,
    action: "enquiry_link.create",
    entityType: "enquiry_link",
    entityId: sid(link._id),
    newValue: { sourceId: sid(source._id), source: source.name, campaign, staffId: staffId || null },
  });
  return { id: sid(link._id), token, campaign, source: source.name };
}

export async function listEnquiryLinks() {
  await connectDB();
  const links = await EnquiryLink.find({ active: true }).sort({ createdAt: -1 }).limit(30).lean();
  const [sources, staff] = await Promise.all([
    LeadSource.find({ _id: { $in: links.map((link) => link.sourceId) } }).select("name").lean(),
    User.find({ _id: { $in: links.map((link) => link.staffId).filter(Boolean) } }).select("name").lean(),
  ]);
  const sourceName = new Map(sources.map((source) => [sid(source._id), source.name]));
  const staffName = new Map(staff.map((person) => [sid(person._id), person.name]));
  return links.map((link) => ({
    id: sid(link._id),
    token: link.token,
    source: sourceName.get(sid(link.sourceId)) || "Source",
    campaign: link.campaign || "",
    staff: link.staffId ? staffName.get(sid(link.staffId)) || "" : "",
    createdAt: link.createdAt,
  }));
}
