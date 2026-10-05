import Link from "next/link";
import { formatKsh } from "@/domain/money";
import { formatWhen } from "@/domain/operations";
import { ENQUIRY_STATUS_LABELS } from "@/domain/states";
import { DataRows, PageHeader } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { requirePermission, requireUser } from "@/server/guard";
import { listEnquiries, listStaff } from "@/server/services/crm";

export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  requirePermission(user, "enquiries.read");
  const params = await searchParams;
  const [rows, staff] = await Promise.all([
    listEnquiries({ stage: params.stage, ownerId: params.owner, q: params.q, attention: params.attention }),
    listStaff(),
  ]);
  return (
    <div>
      <PageHeader eyebrow="Sales" title="Enquiries" description="Every WhatsApp, call, walk-in and form becomes a record with an owner and a next action." actions={<Button asChild><Link href="/enquiries/new">New enquiry</Link></Button>} />
      <form className="mb-4 grid gap-2 sm:grid-cols-4">
        <input name="q" defaultValue={params.q} placeholder="Name, phone, reference" className="h-9 rounded-md border border-border bg-card px-3 text-sm" />
        <select name="stage" defaultValue={params.stage || ""} className="h-9 rounded-md border border-border bg-card px-2 text-sm">
          <option value="">All stages</option>
          {Object.entries(ENQUIRY_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select name="owner" defaultValue={params.owner || ""} className="h-9 rounded-md border border-border bg-card px-2 text-sm">
          <option value="">All owners</option>
          <option value="none">No owner</option>
          {staff.map((person) => <option key={String(person._id)} value={String(person._id)}>{person.name}</option>)}
        </select>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="attention" value="yes" defaultChecked={params.attention === "yes"} /> Needs attention</label>
          <Button type="submit" variant="secondary">Filter</Button>
        </div>
      </form>
      <DataRows
        columns={[{ key: "ref", header: "Enquiry" }, { key: "client", header: "Client" }, { key: "stage", header: "Stage" }, { key: "when", header: "Event date" }, { key: "value", header: "Value" }, { key: "flags", header: "Attention" }]}
        rows={rows.map((row) => ({
          id: String(row._id),
          href: `/enquiries/${row._id}`,
          cells: {
            ref: row.reference,
            client: row.contact?.fullName || "—",
            stage: <StatusPill value={row.stage} label={ENQUIRY_STATUS_LABELS[row.stage as keyof typeof ENQUIRY_STATUS_LABELS]} />,
            when: formatWhen(row.preferredDate),
            value: formatKsh(row.estimatedValueCents || 0),
            flags: row.flags.length ? row.flags.join(" · ") : "—",
          },
        }))}
        empty={<p className="text-sm text-muted-foreground">No enquiries match. If a conversation happened, it should be here.</p>}
      />
    </div>
  );
}
