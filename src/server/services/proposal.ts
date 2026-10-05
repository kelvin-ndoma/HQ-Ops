import { createHash, randomBytes } from "node:crypto";
import { toClientProposal, type ClientProposal } from "../../domain/proposal";
import { requiredDeposit } from "../../domain/money";
import { formatWhen } from "../../domain/operations";
import { can } from "../../domain/permissions";
import type { SessionUser } from "../auth";
import { recordActivity, recordAudit } from "../audit";
import { connectDB } from "../db";
import { AppError } from "../errors";
import { deliverProposal } from "../mail";
import { ActivityEvent, ApprovalRequest, Client, Enquiry, EventType, ProposalLink, ProposalTerm, Quotation, QuotationVersion, User } from "../models";
import { notify } from "../notifications";
import { sid } from "../parse";
import { getCommercial, getOrganization } from "../settings";
import { getQuotation, setQuotationStatus } from "./commercial";

export function hashProposalToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function proposalUrl(token: string) {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/proposal/${token}`;
}

function ownerActor(user: { _id: unknown; name: string; email: string; role: string }): SessionUser {
  return { id: String(user._id), name: user.name, email: user.email, role: user.role as SessionUser["role"] };
}

async function loadLink(token: string) {
  await connectDB();
  if (!token || token.length < 20) return null;
  return ProposalLink.findOne({ tokenHash: hashProposalToken(token) });
}

export async function issueProposalLink(actor: SessionUser, quotationId: string) {
  await connectDB();
  const quote = await Quotation.findOne({ _id: quotationId, archivedAt: null });
  if (!quote) throw new AppError("Quotation not found.", "not_found");
  if (!["sent", "viewed"].includes(quote.status)) throw new AppError("Send the quotation before sharing a client link.");
  const token = randomBytes(32).toString("base64url");
  await ProposalLink.create({
    quotationId: quote._id,
    version: quote.currentVersion,
    tokenHash: hashProposalToken(token),
    expiresAt: quote.validUntil,
    createdBy: actor.id,
  });
  return token;
}

export async function sendProposal(actor: SessionUser, quotationId: string, message?: string) {
  if (!can(actor.role, "quotes.send")) throw new AppError("You cannot send quotations.", "forbidden");
  await connectDB();
  const quote = await Quotation.findOne({ _id: quotationId, archivedAt: null });
  if (!quote) throw new AppError("Quotation not found.", "not_found");
  if (quote.status === "draft") await setQuotationStatus(actor, quotationId, "sent");
  const fresh = await Quotation.findById(quotationId);
  if (!fresh || !["sent", "viewed"].includes(fresh.status)) {
    throw new AppError("This version cannot be sent.");
  }
  const client = await Client.findById(fresh.clientId);
  const enquiry = fresh.enquiryId ? await Enquiry.findById(fresh.enquiryId) : null;
  const email = client?.email || enquiry?.contact?.email || "";
  if (!email) throw new AppError("Add an email address for this client before sending the proposal.");
  const token = await issueProposalLink(actor, quotationId);
  const url = proposalUrl(token);
  const version = await QuotationVersion.findOne({ quotationId: fresh._id, version: fresh.currentVersion });
  const note = message?.trim() || "Please find your event proposal from HQ. You can review the details and accept the proposal using the secure link below.";
  const delivery = await deliverProposal({
    to: email,
    subject: `${fresh.reference} · event proposal`,
    text: `${note}\n\n${url}`,
    url,
  });
  await recordActivity({
    entityType: "quotation",
    entityId: quotationId,
    actorId: actor.id,
    kind: "message",
    summary: `Proposal V${fresh.currentVersion} sent to ${email}.`,
  });
  await recordAudit({
    actorId: actor.id,
    action: "proposal.sent",
    entityType: "quotation",
    entityId: quotationId,
    newValue: { version: fresh.currentVersion, email, totalCents: version?.totalCents || 0, delivery },
  });
  return {
    delivery,
    previewUrl: delivery === "development" ? url : undefined,
    email,
    version: fresh.currentVersion,
  };
}

export type PublicProposal =
  | { state: "invalid" }
  | { state: "expired" }
  | { state: "replaced" }
  | { state: "ready"; proposal: ClientProposal; response: "open" | "accepted" | "declined"; acceptedByName: string };

export async function readPublicProposal(token: string): Promise<PublicProposal> {
  const link = await loadLink(token);
  if (!link || link.revokedAt) return { state: "invalid" };
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return { state: "expired" };
  const data = await getQuotation(String(link.quotationId));
  const version = data.versions.find((item) => item.version === link.version);
  if (!version) return { state: "invalid" };
  if (version.status === "superseded" || link.version !== data.quote.currentVersion) return { state: "replaced" };
  if (version.status === "sent" || version.status === "viewed") {
    const owner = await User.findById(data.quote.ownerId);
    const who = data.enquiry?.contact?.fullName || data.client?.name || "The client";
    if (version.status === "sent" && owner) {
      await setQuotationStatus(ownerActor(owner), String(data.quote._id), "viewed", `${who} viewed proposal V${version.version}.`);
    } else if (version.viewedAt) {
      await QuotationVersion.updateOne({ _id: version._id }, { lastViewedAt: new Date() });
    }
  }
  const proposal = await presentVersion(String(data.quote._id), version.version);
  const fresh = await QuotationVersion.findOne({ quotationId: data.quote._id, version: version.version });
  const response = fresh?.status === "accepted" ? "accepted" : fresh?.status === "declined" ? "declined" : "open";
  return { state: "ready", proposal, response, acceptedByName: fresh?.acceptedByName || "" };
}

export async function presentVersion(quotationId: string, versionNumber: number) {
  const data = await getQuotation(quotationId);
  const version = data.versions.find((item) => item.version === versionNumber);
  if (!version) throw new AppError("That proposal version is not on record.", "not_found");
  const [org, commercial, eventType] = await Promise.all([
    getOrganization(),
    getCommercial(),
    data.enquiry?.eventTypeId ? EventType.findById(data.enquiry.eventTypeId).lean() : null,
  ]);
  const organization = data.client?.organizationName || data.enquiry?.contact?.organization || data.client?.name || "Client";
  const contactName = data.enquiry?.contact?.fullName || data.client?.name || "";
  const eventTypeName = eventType?.name || "Private event";
  const eventDate = data.enquiry?.preferredDate ? formatWhen(data.enquiry.preferredDate) : "Date to be confirmed";
  const guests = data.enquiry?.estimatedGuests ? `${data.enquiry.estimatedGuests} guests` : "Guest count to be confirmed";
  const time = [data.enquiry?.startTime, data.enquiry?.endTime].filter(Boolean).join(" – ") || "Time to be confirmed";
  const frozen = (version.termsSnapshot || []).filter((term: { title?: string; content?: string }) => term.title && term.content);
  const liveTerms = frozen.length
    ? frozen
    : version.status === "draft"
      ? (await ProposalTerm.find({ active: true }).sort({ order: 1, title: 1 }).lean()).map((term) => ({ title: term.title, content: term.content }))
      : data.quote.terms
        ? [{ title: "Terms", content: data.quote.terms }]
        : [];
  const depositCents = version.sentAt
    ? version.depositCents || 0
    : requiredDeposit(version.totalCents || 0, commercial.deposit);
  return toClientProposal({
    reference: data.quote.reference,
    version: version.version,
    organization,
    contactName,
    eventTitle: eventTypeName,
    eventDateLabel: eventDate,
    guestsLabel: guests,
    date: eventDate,
    time,
    venue: data.spaces.map((space) => space.name).join(", ") || "Space to be confirmed",
    guestCount: guests,
    eventType: eventTypeName,
    lines: (version.lines || []).map((line: { description: string; quantity: number; unit?: string; unitPriceCents: number; totalCents: number }) => ({
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPriceCents: line.unitPriceCents,
      totalCents: line.totalCents,
    })),
    subtotalCents: version.subtotalCents || 0,
    discountCents: version.discountCents || 0,
    taxCents: version.taxCents || 0,
    totalCents: version.totalCents || 0,
    depositCents,
    inclusions: version.inclusions || [],
    arrangements: version.arrangements || "",
    clientRequirements: version.clientRequirements || "",
    terms: liveTerms,
    validUntil: version.validUntil ? formatWhen(version.validUntil) : data.quote.validUntil ? formatWhen(data.quote.validUntil) : null,
    hq: org,
  });
}

export async function acceptProposal(token: string, name: string) {
  const link = await loadLink(token);
  if (!link || link.revokedAt) throw new AppError("This proposal link is no longer available.", "not_found");
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) throw new AppError("This proposal has expired.");
  const quote = await Quotation.findById(link.quotationId);
  if (!quote || quote.archivedAt) throw new AppError("This proposal link is no longer available.", "not_found");
  if (link.version !== quote.currentVersion) throw new AppError("A newer proposal has been issued. Ask HQ for the current link.");
  const version = await QuotationVersion.findOne({ quotationId: quote._id, version: link.version });
  if (!version) throw new AppError("This proposal link is no longer available.", "not_found");
  if (version.status === "accepted") return;
  if (!["sent", "viewed"].includes(version.status)) throw new AppError("This proposal can no longer be accepted.");
  const owner = await User.findById(quote.ownerId);
  if (!owner) throw new AppError("This proposal has no owner on record.");
  await setQuotationStatus(ownerActor(owner), sid(quote._id), "accepted");
  const saved = await QuotationVersion.findOne({ quotationId: quote._id, version: link.version });
  if (!saved) throw new AppError("This proposal link is no longer available.", "not_found");
  saved.acceptedByName = name.trim();
  saved.acceptedAt = new Date();
  await saved.save();
  await recordActivity({
    entityType: "quotation",
    entityId: sid(quote._id),
    kind: "stage",
    summary: `${name.trim()} accepted V${saved.version}.`,
  });
  await recordAudit({
    actorId: sid(owner._id),
    action: "proposal.accepted",
    entityType: "quotation",
    entityId: sid(quote._id),
    newValue: { version: saved.version, acceptedByName: name.trim(), termsVersion: saved.termsVersion, totalCents: saved.totalCents },
  });
  await notify({
    userId: sid(owner._id),
    type: "proposal.accepted",
    title: `${quote.reference} accepted`,
    body: `${name.trim()} accepted proposal V${version.version}.`,
    href: `/quotations/${quote._id}`,
    dedupeKey: `proposal-accepted:${quote._id}:${saved.version}`,
  });
}

export async function declineProposal(token: string, reason?: string) {
  const link = await loadLink(token);
  if (!link || link.revokedAt) throw new AppError("This proposal link is no longer available.", "not_found");
  const quote = await Quotation.findById(link.quotationId);
  if (!quote || link.version !== quote.currentVersion) throw new AppError("This proposal can no longer be declined.");
  const version = await QuotationVersion.findOne({ quotationId: quote._id, version: link.version });
  if (!version || !["sent", "viewed"].includes(version.status)) throw new AppError("This proposal can no longer be declined.");
  const owner = await User.findById(quote.ownerId);
  if (!owner) throw new AppError("This proposal has no owner on record.");
  const note = reason?.trim() || "";
  await setQuotationStatus(ownerActor(owner), sid(quote._id), "declined", note || undefined);
  await recordActivity({
    entityType: "quotation",
    entityId: sid(quote._id),
    kind: "stage",
    summary: note ? `Proposal V${version.version} was declined · ${note}.` : `Proposal V${version.version} was declined.`,
  });
  await notify({
    userId: sid(owner._id),
    type: "proposal.declined",
    title: `${quote.reference} declined`,
    body: note ? `The client declined V${version.version}. ${note}` : `The client declined V${version.version}.`,
    href: `/quotations/${quote._id}`,
    dedupeKey: `proposal-declined:${quote._id}:${version.version}`,
  });
}

export async function listProposalTerms() {
  await connectDB();
  return ProposalTerm.find().sort({ order: 1, title: 1 }).lean();
}

export async function saveProposalTerm(
  actor: SessionUser,
  input: { id?: string; title: string; content: string; order?: number; active?: boolean },
) {
  if (!can(actor.role, "settings.commercial")) throw new AppError("You cannot edit proposal terms.", "forbidden");
  await connectDB();
  if (input.id) {
    const term = await ProposalTerm.findById(input.id);
    if (!term) throw new AppError("Term not found.", "not_found");
    const previous = { title: term.title, content: term.content, version: term.version };
    if (term.content !== input.content) term.version = (term.version || 1) + 1;
    term.title = input.title;
    term.content = input.content;
    if (input.order != null) term.order = input.order;
    if (input.active != null) term.active = input.active;
    await term.save();
    await recordAudit({
      actorId: actor.id,
      action: "proposal_term.update",
      entityType: "proposal_term",
      entityId: input.id,
      previousValue: previous,
      newValue: { title: term.title, version: term.version, active: term.active },
    });
    return input.id;
  }
  const created = await ProposalTerm.create({
    title: input.title,
    content: input.content,
    order: input.order || 0,
    active: input.active ?? true,
    version: 1,
  });
  await recordAudit({
    actorId: actor.id,
    action: "proposal_term.create",
    entityType: "proposal_term",
    entityId: sid(created._id),
    newValue: { title: created.title },
  });
  return sid(created._id);
}

export async function quotationActivity(quotationId: string) {
  await connectDB();
  return ActivityEvent.find({ entityType: "quotation", entityId: quotationId }).sort({ createdAt: -1 }).limit(16).lean();
}

export async function pendingQuoteApprovals(ids: string[]) {
  await connectDB();
  if (ids.length === 0) return [];
  return ApprovalRequest.find({ entityType: "quotation", entityId: { $in: ids }, status: "pending" }).lean();
}
