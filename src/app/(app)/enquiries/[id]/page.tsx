import Link from "next/link";
import { formatKsh } from "@/domain/money";
import { formatWhen } from "@/domain/operations";
import { ENQUIRY_STATUS_LABELS } from "@/domain/states";
import { EnquiryControls } from "@/components/forms/enquiry-controls";
import { PageHeader } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { requirePermission, requireUser } from "@/server/guard";
import { ActivityEvent, LostReason } from "@/server/models";
import { getEnquiry } from "@/server/services/crm";

export default async function EnquiryDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  requirePermission(user, "enquiries.read");
  const { id } = await params;
  const data = await getEnquiry(id);
  const [activity, reasons] = await Promise.all([
    ActivityEvent.find({ entityType: "enquiry", entityId: id }).sort({ createdAt: -1 }).limit(30).lean(),
    LostReason.find({ active: true }).sort({ name: 1 }).lean(),
  ]);
  const enquiry = data.enquiry;
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
      <div>
        <PageHeader
          eyebrow={enquiry.reference}
          title={enquiry.contact?.fullName || "Enquiry"}
          description={enquiry.contact?.organization || data.client?.name}
          actions={
            <>
              <Button asChild variant="secondary"><Link href={`/site-visits/new?enquiry=${id}`}>Schedule visit</Link></Button>
              <Button asChild><Link href={`/quotations/new?enquiry=${id}`}>Send quotation</Link></Button>
            </>
          }
        />
        <div className="mb-4 flex flex-wrap gap-2">
          <StatusPill value={enquiry.stage} label={ENQUIRY_STATUS_LABELS[enquiry.stage as keyof typeof ENQUIRY_STATUS_LABELS]} />
          {data.flags.map((flag) => <span key={flag} className="rounded bg-warning/10 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-warning">{flag}</span>)}
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Phone</dt><dd>{enquiry.contact?.phone}</dd></div>
          <div><dt className="text-muted-foreground">Email</dt><dd>{enquiry.contact?.email || "—"}</dd></div>
          <div><dt className="text-muted-foreground">Event</dt><dd>{data.eventType?.name || "—"} · {formatWhen(enquiry.preferredDate)}</dd></div>
          <div><dt className="text-muted-foreground">Guests</dt><dd>{enquiry.estimatedGuests || "—"}</dd></div>
          <div><dt className="text-muted-foreground">Value</dt><dd>{formatKsh(enquiry.estimatedValueCents || 0)}</dd></div>
          <div><dt className="text-muted-foreground">Owner</dt><dd>{data.owner?.name || "Unassigned"}</dd></div>
          <div><dt className="text-muted-foreground">Next action</dt><dd>{enquiry.nextAction || "—"} · {formatWhen(enquiry.nextActionAt, "Africa/Nairobi", true)}</dd></div>
          <div><dt className="text-muted-foreground">Source</dt><dd>{data.source?.name}{enquiry.referralDetail ? ` · ${enquiry.referralDetail}` : ""}</dd></div>
          <div className="sm:col-span-2"><dt className="text-muted-foreground">Spaces</dt><dd>{data.spaces.map((space) => space.name).join(", ") || "—"}</dd></div>
          <div className="sm:col-span-2"><dt className="text-muted-foreground">Requirements</dt><dd>{enquiry.requirements || "—"}</dd></div>
        </dl>
        {data.lostReason ? <p className="mt-4 text-sm">Lost: {data.lostReason.name}. {enquiry.lostNotes}</p> : null}
        <h2 className="mt-8 font-medium">Timeline</h2>
        <ol className="mt-2 space-y-3">
          {activity.map((item) => (
            <li key={String(item._id)} className="border-l-2 border-border pl-3 text-sm">
              <p>{item.summary}</p>
              <p className="text-xs text-muted-foreground">{formatWhen(item.createdAt, "Africa/Nairobi", true)}</p>
            </li>
          ))}
        </ol>
      </div>
      <aside className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-3 font-medium">Keep it moving</h2>
        <EnquiryControls id={id} stage={enquiry.stage} lostReasons={reasons.map((reason) => ({ id: String(reason._id), name: reason.name }))} />
        <div className="mt-4 text-sm">
          <p className="text-muted-foreground">Visits</p>
          {data.visits.map((visit) => <a key={String(visit._id)} className="mt-1 block" href={`/site-visits/${visit._id}`}>{formatWhen(visit.scheduledAt, "Africa/Nairobi", true)} · {visit.status}</a>)}
        </div>
      </aside>
    </div>
  );
}
