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

function budgetText(min?: number | null, max?: number | null) {
  if (min == null && max == null) return "—";
  if (min != null && max != null) return `${formatKsh(min)} – ${formatKsh(max)}`;
  if (max == null) return `From ${formatKsh(min || 0)}`;
  return `Up to ${formatKsh(max)}`;
}

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
  const name = enquiry.contact?.fullName || "Enquiry";
  const organization = enquiry.contact?.organization && enquiry.contact.organization !== name ? enquiry.contact.organization : "";
  const eventLine = [
    data.eventType?.name,
    formatWhen(enquiry.preferredDate),
    enquiry.startTime ? `${enquiry.startTime}${enquiry.endTime ? `–${enquiry.endTime}` : ""}` : "",
    enquiry.estimatedGuests ? `${enquiry.estimatedGuests} guests` : "",
  ].filter(Boolean).join(" · ");
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div>
        <PageHeader
          eyebrow={enquiry.reference}
          title={name}
          description={organization}
          actions={
            <>
              <Button asChild variant="secondary"><Link href={`/site-visits/new?enquiry=${id}`}>Schedule visit</Link></Button>
              <Button asChild><Link href={`/quotations/new?enquiry=${id}`}>Create quotation</Link></Button>
            </>
          }
        />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusPill value={enquiry.stage} label={ENQUIRY_STATUS_LABELS[enquiry.stage as keyof typeof ENQUIRY_STATUS_LABELS]} />
          {data.flags.map((flag) => <span key={flag} className="rounded bg-warning/10 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-warning">{flag}</span>)}
        </div>
        <p className="font-display text-3xl leading-none">{formatKsh(enquiry.estimatedValueCents || 0)}</p>
        <p className="mt-2 text-sm text-muted-foreground">{eventLine || "Date not set"}</p>
        {enquiry.alternativeDate ? <p className="mt-1 text-xs text-muted-foreground">Alternative date {formatWhen(enquiry.alternativeDate)}</p> : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <section className="rounded-md border border-border bg-card px-4 py-3">
            <h2 className="text-sm font-medium">Contact</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div><dt className="text-xs text-muted-foreground">Phone</dt><dd>{enquiry.contact?.phone || "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Email</dt><dd>{enquiry.contact?.email || "—"}</dd></div>
              {data.client ? <div><dt className="text-xs text-muted-foreground">Client</dt><dd><Link href={`/clients/${data.client._id}`} className="hover:underline">{data.client.name}</Link></dd></div> : null}
            </dl>
          </section>
          <section className="rounded-md border border-border bg-card px-4 py-3">
            <h2 className="text-sm font-medium">Next action</h2>
            <p className="mt-3 text-sm font-medium">{enquiry.nextAction || "No next action"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{formatWhen(enquiry.nextActionAt, "Africa/Nairobi", true)}</p>
            <p className="mt-3 text-xs text-muted-foreground">Owner</p>
            <p className="text-sm">{data.owner?.name || "Unassigned"}</p>
          </section>
        </div>

        <section className="mt-4 rounded-md border border-border bg-card px-4 py-3">
          <h2 className="text-sm font-medium">Event</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">Type</dt><dd>{data.eventType?.name || "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Guests</dt><dd>{enquiry.estimatedGuests || "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Budget</dt><dd>{budgetText(enquiry.budgetMinCents, enquiry.budgetMaxCents)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Source</dt><dd>{data.source?.name || "Unknown"}{enquiry.origin === "public_form" ? " · Public form" : ""}{enquiry.referralDetail ? ` · ${enquiry.referralDetail}` : ""}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Spaces</dt><dd>{data.spaces.map((space) => space.name).join(", ") || "—"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Requested services</dt><dd>{data.requestedServices.map((item) => item.name).join(", ") || "—"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Experience</dt><dd>{enquiry.experience || enquiry.requirements || "—"}</dd></div>
            {enquiry.notes ? <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Notes</dt><dd>{enquiry.notes}</dd></div> : null}
            {enquiry.origin === "public_form" ? <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Attribution</dt><dd>{[enquiry.attribution?.campaign, data.referrer?.name, enquiry.attribution?.submittedAt ? formatWhen(enquiry.attribution.submittedAt, "Africa/Nairobi", true) : ""].filter(Boolean).join(" · ") || "Public form"}</dd></div> : null}
          </dl>
        </section>

        {data.lostReason ? <p className="mt-4 rounded-md border border-border bg-card px-4 py-3 text-sm">Lost: {data.lostReason.name}. {enquiry.lostNotes}</p> : null}

        <section className="mt-4 rounded-md border border-border bg-card px-4 py-3">
          <h2 className="text-sm font-medium">Timeline</h2>
          {activity.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No activity yet.</p> : (
            <ol className="mt-3 space-y-3">
              {activity.map((item) => (
                <li key={String(item._id)} className="border-l-2 border-border pl-3 text-sm">
                  <p>{item.summary}</p>
                  <p className="text-xs text-muted-foreground">{formatWhen(item.createdAt, "Africa/Nairobi", true)}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
      <aside className="grid gap-4">
        <section className="rounded-md border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-medium">Keep it moving</h2>
          <EnquiryControls id={id} stage={enquiry.stage} lostReasons={reasons.map((reason) => ({ id: String(reason._id), name: reason.name }))} />
        </section>
        <section className="rounded-md border border-border bg-card p-4">
          <h2 className="text-sm font-medium">Visits</h2>
          {data.visits.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No visits scheduled.</p> : (
            <ul className="mt-2 space-y-2 text-sm">
              {data.visits.map((visit) => (
                <li key={String(visit._id)}>
                  <a className="hover:underline" href={`/site-visits/${visit._id}`}>{formatWhen(visit.scheduledAt, "Africa/Nairobi", true)}</a>
                  <span className="text-muted-foreground"> · {visit.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
