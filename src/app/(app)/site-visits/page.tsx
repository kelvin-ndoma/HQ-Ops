import Link from "next/link";
import { formatWhen } from "@/domain/operations";
import { DataRows, PageHeader } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { requirePermission, requireUser } from "@/server/guard";
import { Client, Enquiry } from "@/server/models";
import { listVisits } from "@/server/services/crm";

export default async function VisitsPage() {
  const user = await requireUser();
  requirePermission(user, "visits.read");
  const visits = await listVisits();
  const [clients, enquiries] = await Promise.all([
    Client.find({ _id: { $in: visits.map((visit) => visit.clientId) } }).lean(),
    Enquiry.find({ _id: { $in: visits.map((visit) => visit.enquiryId) } }).lean(),
  ]);
  const label = (id: unknown, rows: { _id: unknown; name?: string; reference?: string }[], key: "name" | "reference") => rows.find((row) => String(row._id) === String(id))?.[key] || "—";
  return (
    <div>
      <PageHeader eyebrow="Sales" title="Site visits" description="A visit is not finished until the outcome is recorded. Interested clients should leave with a quotation as the next step." actions={<Button asChild><Link href="/site-visits/new">Schedule visit</Link></Button>} />
      <DataRows
        columns={[{ key: "when", header: "When" }, { key: "client", header: "Client" }, { key: "enquiry", header: "Enquiry" }, { key: "status", header: "Status" }, { key: "outcome", header: "Outcome" }]}
        rows={visits.map((visit) => ({
          id: String(visit._id),
          href: `/site-visits/${visit._id}`,
          cells: {
            when: formatWhen(visit.scheduledAt, "Africa/Nairobi", true),
            client: label(visit.clientId, clients, "name"),
            enquiry: label(visit.enquiryId, enquiries, "reference"),
            status: <StatusPill value={visit.status} />,
            outcome: visit.outcome ? <StatusPill value={visit.outcome} /> : "—",
          },
        }))}
        empty={<p className="text-sm text-muted-foreground">No site visits scheduled.</p>}
      />
    </div>
  );
}
