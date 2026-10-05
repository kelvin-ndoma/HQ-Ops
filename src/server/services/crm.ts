import { combineNairobi, enquiryFlags, normalizePhone, slugify } from "../../domain/operations";
import { ENQUIRY_EXITS, ENQUIRY_STAGES, transitionEnquiry, transitionVisit, type EnquiryStatus } from "../../domain/states";
import { onDepositPending, onEnquiryCreated, onVisitScheduled } from "../automation";
import { recordActivity, recordAudit } from "../audit";
import { connectDB } from "../db";
import { AppError } from "../errors";
import { Booking, Client, Enquiry, EventType, LeadSource, LostReason, Payment, Quotation, QuotationVersion, ServiceItem, SiteVisit, Space, User } from "../models";
import { asDate, shillings, sid } from "../parse";
import { nextReference } from "../references";
import { getAssignment, getCommercial } from "../settings";
import type { SessionUser } from "../auth";
import type { ClientInput, EnquiryInput } from "../../domain/schemas";

async function named(model: typeof EventType, id?: string | null) {
  if (!id) return null;
  return model.findById(id).lean();
}

export async function listStaff() {
  await connectDB();
  return User.find({ active: true, archivedAt: null }).select("name email role").sort({ name: 1 }).lean();
}

export async function activeCatalog(model: typeof EventType) {
  await connectDB();
  return model.find({ active: true }).sort({ sort: 1, name: 1 }).lean();
}

export async function listSpaces(includeInactive = false) {
  await connectDB();
  return Space.find(includeInactive ? {} : { active: true }).sort({ name: 1 }).lean();
}

export async function findPossibleClients(phone: string, email?: string) {
  await connectDB();
  const phoneNormalized = normalizePhone(phone);
  const or: Record<string, string>[] = [];
  if (phoneNormalized) or.push({ phoneNormalized });
  if (email) or.push({ email: email.toLowerCase() });
  if (or.length === 0) return [];
  return Client.find({ archivedAt: null, $or: or }).limit(5).lean();
}

export async function openClientForEnquiry(
  input: {
    fullName: string;
    organization?: string;
    phone: string;
    email?: string;
    preferredContact: "phone" | "email" | "whatsapp";
  },
  actorId?: string | null,
) {
  const matches = await findPossibleClients(input.phone, input.email || undefined);
  if (matches.length > 0) {
    const existing = await Client.findById(matches[0]._id);
    if (existing) return { client: existing, linked: true as const };
  }
  const client = await Client.create({
    kind: input.organization ? "organization" : "individual",
    name: input.fullName,
    organizationName: input.organization || "",
    phone: input.phone,
    phoneNormalized: normalizePhone(input.phone),
    email: (input.email || "").toLowerCase(),
    preferredContact: input.preferredContact,
    notes: "",
    createdBy: actorId || undefined,
  });
  await recordAudit({
    actorId: actorId || null,
    action: "client.create",
    entityType: "client",
    entityId: sid(client._id),
    newValue: { name: client.name, phone: client.phoneNormalized },
  });
  return { client, linked: false as const };
}

async function clientFromEnquiry(actor: SessionUser, input: EnquiryInput) {
  if (input.clientId) {
    const existing = await Client.findOne({ _id: input.clientId, archivedAt: null });
    if (!existing) throw new AppError("Client not found.", "not_found");
    return { client: existing, linked: true };
  }
  if (!input.forceNewClient) return openClientForEnquiry(input, actor.id);
  const client = await Client.create({
    kind: input.organization ? "organization" : "individual",
    name: input.fullName,
    organizationName: input.organization || "",
    phone: input.phone,
    phoneNormalized: normalizePhone(input.phone),
    email: (input.email || "").toLowerCase(),
    preferredContact: input.preferredContact,
    notes: "",
    createdBy: actor.id,
  });
  await recordAudit({
    actorId: actor.id,
    action: "client.create",
    entityType: "client",
    entityId: sid(client._id),
    newValue: { name: client.name, phone: client.phoneNormalized },
  });
  return { client, linked: false };
}

export async function createEnquiry(actor: SessionUser, input: EnquiryInput) {
  await connectDB();
  const assignment = await getAssignment();
  const ownerId = input.ownerId || assignment.defaultOwnerId || "";
  const { client, linked } = await clientFromEnquiry(actor, input);
  const reference = await nextReference("ENQ");
  const now = new Date();
  const enquiry = await Enquiry.create({
    reference,
    clientId: client._id,
    contact: {
      fullName: input.fullName,
      organization: input.organization || "",
      phone: input.phone,
      phoneNormalized: normalizePhone(input.phone),
      email: (input.email || "").toLowerCase(),
      preferredContact: input.preferredContact,
    },
    eventTypeId: input.eventTypeId,
    preferredDate: asDate(input.preferredDate),
    alternativeDate: asDate(input.alternativeDate),
    startTime: input.startTime || "",
    endTime: input.endTime || "",
    estimatedGuests: input.estimatedGuests,
    spaceIds: input.spaceIds || [],
    budgetMinCents: shillings(input.budgetMinShillings),
    budgetMaxCents: shillings(input.budgetMaxShillings),
    requirements: input.requirements || "",
    notes: input.notes || "",
    sourceId: input.sourceId,
    referralDetail: input.referralDetail || "",
    ownerId: ownerId || undefined,
    stage: "new",
    estimatedValueCents: shillings(input.estimatedValueShillings) || 0,
    nextAction: input.nextAction || "Make first contact",
    nextActionAt: asDate(input.nextActionDate) || new Date(now.getTime() + 24 * 60 * 60 * 1000),
    priority: input.priority || "normal",
    lastActivityAt: now,
    createdBy: actor.id,
  });
  await recordActivity({
    entityType: "enquiry",
    entityId: sid(enquiry._id),
    actorId: actor.id,
    kind: "created",
    summary: linked
      ? `${reference} captured and linked to existing client ${client.name}.`
      : `${reference} captured for ${input.fullName}.`,
  });
  await recordAudit({
    actorId: actor.id,
    action: "enquiry.create",
    entityType: "enquiry",
    entityId: sid(enquiry._id),
    newValue: { reference, stage: "new", ownerId: ownerId || null },
  });
  await onEnquiryCreated(enquiry, actor.id);
  return sid(enquiry._id);
}

export async function listEnquiries(filters: { stage?: string; ownerId?: string; q?: string; attention?: string }) {
  await connectDB();
  const commercial = await getCommercial();
  const query: Record<string, unknown> = { archivedAt: null };
  if (filters.stage) query.stage = filters.stage;
  if (filters.ownerId === "none") query.ownerId = null;
  else if (filters.ownerId) query.ownerId = filters.ownerId;
  if (filters.q) {
    const rx = new RegExp(filters.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ reference: rx }, { "contact.fullName": rx }, { "contact.organization": rx }, { "contact.phone": rx }, { "contact.email": rx }];
  }
  const rows = await Enquiry.find(query).sort({ updatedAt: -1 }).limit(200).lean();
  const now = new Date();
  return rows
    .map((row) => {
      const flags = enquiryFlags({
        status: row.stage as EnquiryStatus,
        ownerId: row.ownerId ? sid(row.ownerId) : null,
        nextAction: row.nextAction,
        nextActionAt: row.nextActionAt,
        lastActivityAt: row.lastActivityAt,
        now,
        staleDays: commercial.staleEnquiryDays,
      });
      return { ...row, flags };
    })
    .filter((row) => (filters.attention === "yes" ? row.flags.length > 0 : true));
}

export async function getEnquiry(id: string) {
  await connectDB();
  const enquiry = await Enquiry.findOne({ _id: id, archivedAt: null }).lean();
  if (!enquiry) throw new AppError("Enquiry not found.", "not_found");
  const commercial = await getCommercial();
  const [client, eventType, source, owner, spaces, lostReason, visits, requestedServices, referrer] = await Promise.all([
    Client.findById(enquiry.clientId).lean(),
    named(EventType, sid(enquiry.eventTypeId)),
    named(LeadSource, sid(enquiry.sourceId)),
    enquiry.ownerId ? User.findById(enquiry.ownerId).select("name").lean() : null,
    Space.find({ _id: { $in: enquiry.spaceIds || [] } }).lean(),
    enquiry.lostReasonId ? LostReason.findById(enquiry.lostReasonId).lean() : null,
    SiteVisit.find({ enquiryId: enquiry._id, archivedAt: null }).sort({ scheduledAt: -1 }).lean(),
    ServiceItem.find({ _id: { $in: enquiry.requestedServiceIds || [] } }).select("name").lean(),
    enquiry.attribution?.staffId ? User.findById(enquiry.attribution.staffId).select("name").lean() : null,
  ]);
  const flags = enquiryFlags({
    status: enquiry.stage as EnquiryStatus,
    ownerId: enquiry.ownerId ? sid(enquiry.ownerId) : null,
    nextAction: enquiry.nextAction,
    nextActionAt: enquiry.nextActionAt,
    lastActivityAt: enquiry.lastActivityAt,
    now: new Date(),
    staleDays: commercial.staleEnquiryDays,
  });
  return { enquiry, client, eventType, source, owner, spaces, lostReason, visits, flags, requestedServices, referrer };
}

export async function updateEnquiry(actor: SessionUser, id: string, patch: Partial<EnquiryInput>) {
  await connectDB();
  const enquiry = await Enquiry.findOne({ _id: id, archivedAt: null });
  if (!enquiry) throw new AppError("Enquiry not found.", "not_found");
  const previous = {
    ownerId: sid(enquiry.ownerId),
    estimatedValueCents: enquiry.estimatedValueCents,
    nextAction: enquiry.nextAction,
    nextActionAt: enquiry.nextActionAt,
    priority: enquiry.priority,
  };
  if (patch.ownerId !== undefined) enquiry.ownerId = patch.ownerId || undefined;
  if (patch.estimatedValueShillings !== undefined) enquiry.estimatedValueCents = shillings(patch.estimatedValueShillings) || 0;
  if (patch.nextAction !== undefined) enquiry.nextAction = patch.nextAction || "";
  if (patch.nextActionDate !== undefined) enquiry.nextActionAt = asDate(patch.nextActionDate);
  if (patch.priority) enquiry.priority = patch.priority;
  if (patch.requirements !== undefined) enquiry.requirements = patch.requirements || "";
  if (patch.notes !== undefined) enquiry.notes = patch.notes || "";
  if (patch.estimatedGuests !== undefined) enquiry.estimatedGuests = patch.estimatedGuests;
  if (patch.spaceIds) enquiry.spaceIds = patch.spaceIds;
  enquiry.lastActivityAt = new Date();
  await enquiry.save();
  if (previous.ownerId !== sid(enquiry.ownerId)) {
    await recordAudit({
      actorId: actor.id,
      action: "enquiry.owner",
      entityType: "enquiry",
      entityId: id,
      previousValue: { ownerId: previous.ownerId },
      newValue: { ownerId: sid(enquiry.ownerId) },
    });
  }
  if (previous.estimatedValueCents !== enquiry.estimatedValueCents) {
    await recordAudit({
      actorId: actor.id,
      action: "enquiry.value",
      entityType: "enquiry",
      entityId: id,
      previousValue: { estimatedValueCents: previous.estimatedValueCents },
      newValue: { estimatedValueCents: enquiry.estimatedValueCents },
    });
  }
  await recordActivity({
    entityType: "enquiry",
    entityId: id,
    actorId: actor.id,
    kind: "updated",
    summary: `Updated ${enquiry.reference}.`,
  });
}

export async function transitionEnquiryStage(
  actor: SessionUser,
  id: string,
  stage: EnquiryStatus,
  extras: { lostReasonId?: string; lostNotes?: string; reason?: string },
) {
  await connectDB();
  const enquiry = await Enquiry.findOne({ _id: id, archivedAt: null });
  if (!enquiry) throw new AppError("Enquiry not found.", "not_found");
  const confirmed = await Booking.exists({
    enquiryId: enquiry._id,
    status: "confirmed",
    archivedAt: null,
  });
  const result = transitionEnquiry(enquiry.stage, stage, {
    hasLostReason: Boolean(extras.lostReasonId),
    hasConfirmedBooking: Boolean(confirmed),
  });
  if (!result.ok) throw new AppError(result.error);
  if (stage === "lost") {
    const reason = await LostReason.findById(extras.lostReasonId);
    if (!reason || !reason.active) throw new AppError("Choose an active lost reason.");
  }
  const previous = enquiry.stage;
  enquiry.stage = stage;
  if (stage === "lost") {
    enquiry.lostReasonId = extras.lostReasonId;
    enquiry.lostNotes = extras.lostNotes || "";
  }
  enquiry.lastActivityAt = new Date();
  if (stage === "contacted") enquiry.lastContactedAt = new Date();
  await enquiry.save();
  await recordAudit({
    actorId: actor.id,
    action: "enquiry.stage",
    entityType: "enquiry",
    entityId: id,
    previousValue: { stage: previous },
    newValue: { stage, lostReasonId: extras.lostReasonId || null },
    reason: extras.reason || extras.lostNotes || "",
  });
  await recordActivity({
    entityType: "enquiry",
    entityId: id,
    actorId: actor.id,
    kind: "stage",
    summary: `${enquiry.reference} moved from ${previous.replaceAll("_", " ")} to ${stage.replaceAll("_", " ")}.`,
  });
  if (stage === "deposit_pending") await onDepositPending(enquiry, actor.id);
}

export async function addNote(actor: SessionUser, entityType: string, entityId: string, body: string) {
  await connectDB();
  await recordActivity({
    entityType,
    entityId,
    actorId: actor.id,
    kind: "note",
    summary: body,
  });
  if (entityType === "enquiry") {
    await Enquiry.updateOne({ _id: entityId }, { lastActivityAt: new Date(), lastContactedAt: new Date() });
  }
}

export async function createClient(actor: SessionUser, input: ClientInput) {
  await connectDB();
  const matches = await findPossibleClients(input.phone, input.email || undefined);
  if (matches.length > 0 && !input.forceNew) {
    throw new AppError(`A client with this phone or email already exists (${matches[0].name}). Open that profile or confirm this is a different person.`);
  }
  const client = await Client.create({
    kind: input.kind,
    name: input.name,
    organizationName: input.organizationName || "",
    phone: input.phone,
    phoneNormalized: normalizePhone(input.phone),
    email: (input.email || "").toLowerCase(),
    preferredContact: input.preferredContact,
    notes: input.notes || "",
    createdBy: actor.id,
  });
  await recordAudit({
    actorId: actor.id,
    action: "client.create",
    entityType: "client",
    entityId: sid(client._id),
    newValue: { name: client.name },
  });
  await recordActivity({
    entityType: "client",
    entityId: sid(client._id),
    actorId: actor.id,
    kind: "created",
    summary: `Client profile opened for ${client.name}.`,
  });
  return sid(client._id);
}

export async function listClients(q?: string) {
  await connectDB();
  const query: Record<string, unknown> = { archivedAt: null };
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ name: rx }, { organizationName: rx }, { phone: rx }, { email: rx }, { phoneNormalized: normalizePhone(q) }];
  }
  return Client.find(query).sort({ name: 1 }).limit(200).lean();
}

export async function getClientProfile(id: string) {
  await connectDB();
  const client = await Client.findOne({ _id: id, archivedAt: null }).lean();
  if (!client) throw new AppError("Client not found.", "not_found");
  const [enquiries, visits, bookings, payments] = await Promise.all([
    Enquiry.find({ clientId: id, archivedAt: null }).sort({ createdAt: -1 }).lean(),
    SiteVisit.find({ clientId: id, archivedAt: null }).sort({ scheduledAt: -1 }).lean(),
    Booking.find({ clientId: id, archivedAt: null }).sort({ startAt: -1 }).lean(),
    Payment.find({ clientId: id }).sort({ paidAt: -1 }).lean(),
  ]);
  const contracted = bookings
    .filter((booking) => booking.status === "confirmed" || booking.status === "completed")
    .reduce((sum, booking) => sum + (booking.agreedAmountCents || 0), 0);
  const repeat = bookings.filter((booking) => booking.status === "confirmed" || booking.status === "completed").length >= 2;
  const upcoming = bookings.filter((booking) => booking.status === "confirmed" && new Date(booking.startAt) >= new Date());
  const past = bookings.filter((booking) => booking.status === "completed" || (booking.status === "confirmed" && new Date(booking.startAt) < new Date()));
  return { client, enquiries, visits, bookings, payments, contracted, repeat, upcoming, lastEvent: past[0] || null };
}

export async function createVisit(
  actor: SessionUser,
  input: { enquiryId: string; scheduledDate: string; scheduledTime: string; assignedToId: string; spaceIds: string[]; notes?: string },
) {
  await connectDB();
  const enquiry = await Enquiry.findOne({ _id: input.enquiryId, archivedAt: null });
  if (!enquiry) throw new AppError("Enquiry not found.", "not_found");
  const scheduledAt = combineNairobi(input.scheduledDate, input.scheduledTime);
  const visit = await SiteVisit.create({
    enquiryId: enquiry._id,
    clientId: enquiry.clientId,
    scheduledAt,
    assignedToId: input.assignedToId,
    spaceIds: input.spaceIds,
    notes: input.notes || "",
    status: "scheduled",
    createdBy: actor.id,
  });
  enquiry.lastActivityAt = new Date();
  if (enquiry.stage === "new" || enquiry.stage === "contacted" || enquiry.stage === "qualified") {
    const previous = enquiry.stage;
    enquiry.stage = "site_visit";
    await recordAudit({
      actorId: actor.id,
      action: "enquiry.stage",
      entityType: "enquiry",
      entityId: sid(enquiry._id),
      previousValue: { stage: previous },
      newValue: { stage: "site_visit" },
      reason: "Site visit scheduled",
    });
  }
  await enquiry.save();
  await recordActivity({
    entityType: "site_visit",
    entityId: sid(visit._id),
    actorId: actor.id,
    kind: "created",
    summary: `Site visit scheduled for ${enquiry.reference}.`,
  });
  await recordActivity({
    entityType: "enquiry",
    entityId: sid(enquiry._id),
    actorId: actor.id,
    kind: "system",
    summary: "Site visit scheduled.",
  });
  await onVisitScheduled(visit, actor.id);
  return sid(visit._id);
}

export async function listVisits() {
  await connectDB();
  return SiteVisit.find({ archivedAt: null }).sort({ scheduledAt: 1 }).limit(200).lean();
}

export async function getVisit(id: string) {
  await connectDB();
  const visit = await SiteVisit.findOne({ _id: id, archivedAt: null }).lean();
  if (!visit) throw new AppError("Site visit not found.", "not_found");
  const [enquiry, client, assignee, spaces] = await Promise.all([
    Enquiry.findById(visit.enquiryId).lean(),
    Client.findById(visit.clientId).lean(),
    User.findById(visit.assignedToId).select("name").lean(),
    Space.find({ _id: { $in: visit.spaceIds || [] } }).lean(),
  ]);
  return { visit, enquiry, client, assignee, spaces };
}

export async function updateVisit(
  actor: SessionUser,
  id: string,
  input: { status: "completed" | "no_show" | "rescheduled" | "cancelled" | "scheduled"; outcome?: "interested" | "maybe" | "not_suitable"; outcomeNotes?: string; scheduledDate?: string; scheduledTime?: string },
) {
  await connectDB();
  const visit = await SiteVisit.findOne({ _id: id, archivedAt: null });
  if (!visit) throw new AppError("Site visit not found.", "not_found");
  const nextStatus = input.status === "rescheduled" && input.scheduledDate && input.scheduledTime ? "scheduled" : input.status;
  const result = transitionVisit(visit.status, input.status === "rescheduled" ? "rescheduled" : nextStatus, {
    hasOutcome: Boolean(input.outcome),
  });
  if (input.status !== "rescheduled" && !result.ok) throw new AppError(result.error);
  if (nextStatus === "completed" && !input.outcome) throw new AppError("Record whether the client was interested, unsure, or the venue was not suitable.");
  const previous = visit.status;
  visit.status = nextStatus;
  if (input.outcome) visit.outcome = input.outcome;
  if (input.outcomeNotes !== undefined) visit.outcomeNotes = input.outcomeNotes || "";
  if (input.scheduledDate && input.scheduledTime) {
    visit.scheduledAt = combineNairobi(input.scheduledDate, input.scheduledTime);
    visit.status = "scheduled";
  }
  await visit.save();
  await recordActivity({
    entityType: "site_visit",
    entityId: id,
    actorId: actor.id,
    kind: "stage",
    summary: input.outcome
      ? `Visit ${previous} → ${visit.status}. Outcome: ${input.outcome.replaceAll("_", " ")}.`
      : `Visit ${previous} → ${visit.status}.`,
  });
  await Enquiry.updateOne({ _id: visit.enquiryId }, { lastActivityAt: new Date() });
}

export async function saveCatalog(
  actor: SessionUser,
  model: typeof EventType,
  entityType: string,
  input: { id?: string; name: string; description?: string; active?: boolean; extra?: Record<string, unknown> },
) {
  await connectDB();
  if (input.id) {
    const existing = await model.findById(input.id);
    if (!existing) throw new AppError("Record not found.", "not_found");
    const previous = { name: existing.name, active: existing.active };
    existing.name = input.name;
    if (input.description !== undefined) existing.description = input.description;
    if (input.active !== undefined) existing.active = input.active;
    if (input.extra) Object.assign(existing, input.extra);
    await existing.save();
    await recordAudit({
      actorId: actor.id,
      action: `${entityType}.update`,
      entityType,
      entityId: input.id,
      previousValue: previous,
      newValue: { name: existing.name, active: existing.active },
    });
    return input.id;
  }
  const created = await model.create({
    name: input.name,
    slug: `${slugify(input.name)}-${Date.now().toString(36)}`,
    description: input.description || "",
    active: input.active ?? true,
    ...input.extra,
  });
  await recordAudit({
    actorId: actor.id,
    action: `${entityType}.create`,
    entityType,
    entityId: sid(created._id),
    newValue: { name: created.name },
  });
  return sid(created._id);
}

export async function listPipeline() {
  await connectDB();
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [active, closed, types, sources, owners, visitsThisWeek, quotesWaiting] = await Promise.all([
    Enquiry.find({ archivedAt: null, stage: { $in: [...ENQUIRY_STAGES] } }).sort({ nextActionAt: 1, updatedAt: -1 }).limit(200).lean(),
    Enquiry.find({ archivedAt: null, stage: { $in: [...ENQUIRY_EXITS] } }).sort({ updatedAt: -1 }).limit(40).lean(),
    EventType.find().select("name").lean(),
    LeadSource.find().select("name").lean(),
    User.find({ archivedAt: null }).select("name").sort({ name: 1 }).lean(),
    SiteVisit.countDocuments({ archivedAt: null, status: { $in: ["scheduled", "rescheduled"] }, scheduledAt: { $gte: now, $lte: weekAhead } }),
    Quotation.countDocuments({ archivedAt: null, status: { $in: ["sent", "viewed"] } }),
  ]);
  const enquiries = [...active, ...closed];
  const quotes = await Quotation.find({ enquiryId: { $in: enquiries.map((enquiry) => enquiry._id) }, archivedAt: null }).select("enquiryId currentVersion").lean();
  const versions = quotes.length
    ? await QuotationVersion.find({ $or: quotes.map((quote) => ({ quotationId: quote._id, version: quote.currentVersion })) }).select("quotationId version totalCents").lean()
    : [];
  const quoted = new Map(versions.map((version) => [`${version.quotationId}:${version.version}`, version.totalCents || 0]));
  const quoteValue = new Map<string, number>();
  for (const quote of quotes) quoteValue.set(sid(quote.enquiryId), quoted.get(`${quote._id}:${quote.currentVersion}`) || 0);
  const typeName = new Map(types.map((type) => [sid(type._id), type.name]));
  const sourceName = new Map(sources.map((source) => [sid(source._id), source.name]));
  const ownerName = new Map(owners.map((owner) => [sid(owner._id), owner.name]));
  const cards = enquiries.map((enquiry) => {
    const company = enquiry.contact?.organization || "";
    const person = enquiry.contact?.fullName || "Unnamed enquiry";
    const date = enquiry.preferredDate ? new Date(enquiry.preferredDate) : null;
    return {
      id: sid(enquiry._id),
      reference: enquiry.reference,
      title: company || person,
      eventType: typeName.get(sid(enquiry.eventTypeId)) || "Event",
      source: sourceName.get(sid(enquiry.sourceId)) || "",
      date: date ? date.toISOString() : null,
      month: date ? new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit" }).format(date) : "",
      guests: enquiry.estimatedGuests || null,
      valueCents: quoteValue.get(sid(enquiry._id)) || enquiry.estimatedValueCents || 0,
      owner: enquiry.ownerId ? ownerName.get(sid(enquiry.ownerId)) || "" : "",
      ownerId: enquiry.ownerId ? sid(enquiry.ownerId) : "",
      nextAction: enquiry.nextAction || "",
      nextActionAt: enquiry.nextActionAt ? new Date(enquiry.nextActionAt).toISOString() : null,
      stage: enquiry.stage as EnquiryStatus,
      priority: enquiry.priority || "normal",
    };
  });
  return {
    cards,
    owners: owners.map((owner) => ({ id: sid(owner._id), name: owner.name })),
    eventTypes: [...new Set(cards.map((card) => card.eventType))].filter(Boolean).sort(),
    sources: [...new Set(cards.map((card) => card.source))].filter(Boolean).sort(),
    visitsThisWeek,
    quotesWaiting,
  };
}
