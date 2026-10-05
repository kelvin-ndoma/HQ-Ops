import Link from "next/link";
import { formatKsh } from "@/domain/money";
import { ProcurementDecision } from "@/components/forms/finance-forms";
import { DataRows, PageHeader } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/permissions";
import { requirePermission, requireUser } from "@/server/guard";
import { listProcurement } from "@/server/services/events";

export default async function ProcurementPage() {
  const user = await requireUser();
  requirePermission(user, "procurement.read");
  const rows = await listProcurement();
  return (
    <div>
      <PageHeader eyebrow="Operations" title="Procurement" description="A request, an approval, then the order. This is not an accounts payable system." actions={<Button asChild><Link href="/procurement/new">New request</Link></Button>} />
      <DataRows
        columns={[{ key: "ref", header: "Request" }, { key: "item", header: "Item" }, { key: "status", header: "Status" }, { key: "estimate", header: "Estimate" }, { key: "action", header: "" }]}
        rows={rows.map((row) => ({
          id: String(row._id),
          cells: {
            ref: row.reference,
            item: `${row.item} × ${row.quantity}`,
            status: <StatusPill value={row.status} />,
            estimate: formatKsh(row.estimatedCostCents || 0),
            action: can(user.role, "procurement.write") || can(user.role, "procurement.approve") ? <ProcurementDecision id={String(row._id)} /> : null,
          },
        }))}
        empty={<p className="text-sm text-muted-foreground">No purchase requests.</p>}
      />
    </div>
  );
}
