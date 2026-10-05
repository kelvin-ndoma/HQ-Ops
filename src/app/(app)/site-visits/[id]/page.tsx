import Link from "next/link";
import { formatWhen } from "@/domain/operations";
import { VisitOutcomeForm } from "@/components/forms/visit-form";
import { PageHeader } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { requirePermission, requireUser } from "@/server/guard";
import { getVisit } from "@/server/services/crm";

export default async function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  requirePermission(user, "visits.read");
  const { id } = await params;
  const data = await getVisit(id);
  const interested = data.visit.outcome === "interested";
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <PageHeader eyebrow="Site visit" title={data.client?.name || "Visit"} description={formatWhen(data.visit.scheduledAt, "Africa/Nairobi", true)} actions={interested ? <Button asChild><Link href={`/quotations/new?enquiry=${data.visit.enquiryId}`}>Send quotation</Link></Button> : null} />
        <div className="mb-3 flex gap-2"><StatusPill value={data.visit.status} />{data.visit.outcome ? <StatusPill value={data.visit.outcome} /> : null}</div>
        <p className="text-sm">Enquiry {data.enquiry?.reference}</p>
        <p className="text-sm text-muted-foreground">With {data.assignee?.name || "unassigned"} · {data.spaces.map((space) => space.name).join(", ") || "Spaces not chosen"}</p>
        <p className="mt-3 text-sm">{data.visit.notes}</p>
        {data.visit.outcomeNotes ? <p className="mt-2 text-sm">{data.visit.outcomeNotes}</p> : null}
      </div>
      <div className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-3 font-medium">After the visit</h2>
        <VisitOutcomeForm id={id} />
      </div>
    </div>
  );
}
