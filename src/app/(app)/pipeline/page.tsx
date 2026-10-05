import { formatKsh } from "@/domain/money";
import { PageHeader } from "@/components/page";
import { PipelineBoard, type PipelineCard } from "@/components/pipeline/board";
import { requirePermission, requireUser } from "@/server/guard";
import { Client, Enquiry, EventType, LostReason, Quotation, QuotationVersion, User } from "@/server/models";
import type { EnquiryStatus } from "@/domain/states";

export default async function PipelinePage() {
  const user = await requireUser();
  requirePermission(user, "enquiries.read");
  const enquiries = await Enquiry.find({ archivedAt: null }).sort({ updatedAt: -1 }).limit(300).lean();
  const [clients, types, owners, quotes, versions, reasons] = await Promise.all([
    Client.find({ _id: { $in: enquiries.map((enquiry) => enquiry.clientId) } }).lean(),
    EventType.find().lean(),
    User.find().select("name").lean(),
    Quotation.find({ enquiryId: { $in: enquiries.map((enquiry) => enquiry._id) }, archivedAt: null }).lean(),
    QuotationVersion.find().lean(),
    LostReason.find({ active: true }).lean(),
  ]);
  const name = (id: unknown, rows: { _id: unknown; name: string }[]) => rows.find((row) => String(row._id) === String(id))?.name || "";
  const cards: PipelineCard[] = enquiries.map((enquiry) => {
    const quote = quotes.find((item) => String(item.enquiryId) === String(enquiry._id));
    const version = quote ? versions.find((item) => String(item.quotationId) === String(quote._id) && item.version === quote.currentVersion) : null;
    return {
      id: String(enquiry._id),
      reference: enquiry.reference,
      name: enquiry.contact?.fullName || name(enquiry.clientId, clients),
      company: enquiry.contact?.organization || "",
      eventType: name(enquiry.eventTypeId, types),
      date: enquiry.preferredDate ? new Date(enquiry.preferredDate).toISOString() : null,
      guests: enquiry.estimatedGuests || null,
      valueCents: version?.totalCents || enquiry.estimatedValueCents || 0,
      owner: name(enquiry.ownerId, owners),
      nextAction: enquiry.nextAction || "",
      nextActionAt: enquiry.nextActionAt ? new Date(enquiry.nextActionAt).toISOString() : null,
      stage: enquiry.stage as EnquiryStatus,
    };
  });
  return (
    <div>
      <PageHeader eyebrow="Sales" title="Pipeline" description={`Open value sits on the cards. Drag on a large screen, or use the stage menu on a phone. Lost opportunities need a reason.`} />
      <p className="mb-3 text-sm text-muted-foreground">Quoted where a quotation exists, otherwise the estimated value. {formatKsh(cards.filter((card) => !["lost", "cancelled", "confirmed"].includes(card.stage)).reduce((sum, card) => sum + card.valueCents, 0))} in play.</p>
      <PipelineBoard initial={cards} lostReasons={reasons.map((reason) => ({ id: String(reason._id), name: reason.name }))} />
    </div>
  );
}
