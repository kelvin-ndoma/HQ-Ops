import { formatKsh } from "@/domain/money";
import { formatWhen } from "@/domain/operations";
import { CostForm } from "@/components/forms/finance-forms";
import { PageHeader } from "@/components/page";
import { requirePermission, requireUser } from "@/server/guard";
import { EventRecord, Vendor } from "@/server/models";
import { listEventCosts } from "@/server/services/events";

export default async function CostsPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const user = await requireUser();
  requirePermission(user, "costs.read");
  const params = await searchParams;
  const [costs, events, vendors] = await Promise.all([
    listEventCosts(),
    EventRecord.find({ archivedAt: null }).select("reference").lean(),
    Vendor.find({ archivedAt: null }).select("name").lean(),
  ]);
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr]">
      <div>
        <PageHeader eyebrow="Finance" title="Event costs" description="Direct costs only. Contribution is revenue minus these costs, not company profit." />
        <ul className="space-y-2 text-sm">
          {costs.map((cost) => (
            <li key={String(cost._id)} className="flex justify-between rounded-md border border-border bg-card px-3 py-2">
              <span>{events.find((event) => String(event._id) === String(cost.eventId))?.reference} · {cost.category} · {cost.description}</span>
              <span>{formatKsh(cost.amountCents)} <span className="text-xs text-muted-foreground">{formatWhen(cost.incurredAt)}</span></span>
            </li>
          ))}
        </ul>
      </div>
      {user.role === "finance" || user.role === "leadership" || user.role === "operations_lead" ? (
        <CostForm eventId={params.event} events={events.map((event) => ({ id: String(event._id), label: event.reference }))} vendors={vendors.map((vendor) => ({ id: String(vendor._id), name: vendor.name }))} />
      ) : null}
    </div>
  );
}
