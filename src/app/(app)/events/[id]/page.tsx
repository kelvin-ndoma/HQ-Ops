import Link from "next/link";
import { formatKsh, formatPercent } from "@/domain/money";
import { formatWhen } from "@/domain/operations";
import { CloseoutList, EventActions, RequirementsForm, ReservationActions, ReserveForm, TaskToggle, VendorStatus } from "@/components/forms/event-widgets";
import { PageHeader } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { requirePermission, requireUser } from "@/server/guard";
import { InventoryItem } from "@/server/models";
import { getEventWorkspace } from "@/server/services/events";
import { ActivityEvent } from "@/server/models";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  requirePermission(user, "events.read");
  const { id } = await params;
  const data = await getEventWorkspace(user, id);
  const items = await InventoryItem.find({ active: true, archivedAt: null }).select("name").lean();
  const activity = await ActivityEvent.find({ entityType: "event", entityId: id }).sort({ createdAt: -1 }).limit(20).lean();
  const event = data.event;
  return (
    <div>
      <PageHeader eyebrow={event.reference} title={data.client?.name || "Event"} description={`${formatWhen(event.startAt, "Africa/Nairobi", true)} · ${event.guestCount || "—"} guests · ${data.owner?.name || "No owner"}`} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusPill value={event.status} />
        <StatusPill value={event.preparationStatus || "on_track"} />
        {data.financials && data.booking ? <span className="text-sm">{formatKsh(data.booking.agreedAmountCents)} · <StatusPill value={data.booking.financialStatus} /></span> : null}
      </div>
      <EventActions id={id} status={event.status} />
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 font-medium">Requirements</h2>
          <RequirementsForm id={id} notes={event.notes || ""} requirements={(event.requirements || []).map((item: { label: string; value: string }) => ({ label: item.label, value: item.value }))} />
        </section>
        <section>
          <h2 className="mb-2 font-medium">Preparation tasks</h2>
          <ul className="space-y-2">
            {data.tasks.map((task) => (
              <li key={String(task._id)} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
                <span><span className="block">{task.title}</span><span className="text-xs text-muted-foreground">{formatWhen(task.dueAt)} · {task.status}</span></span>
                <TaskToggle id={String(task._id)} status={task.status} />
              </li>
            ))}
          </ul>
          <Link className="mt-2 inline-block text-sm underline" href={`/tasks/new?event=${id}`}>Add task</Link>
        </section>
        <section>
          <h2 className="mb-2 font-medium">Vendors</h2>
          {data.vendors.map((vendor) => (
            <div key={String(vendor._id)} className="mb-2 rounded-md border border-border bg-card p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span>{data.vendorDocs.find((item) => String(item._id) === String(vendor.vendorId))?.name} · {vendor.service}</span>
                <StatusPill value={vendor.confirmationStatus} />
              </div>
              {data.financials ? <p className="text-xs text-muted-foreground">Agreed {formatKsh(vendor.agreedCostCents || 0)}</p> : null}
              <VendorStatus id={String(vendor._id)} />
            </div>
          ))}
          <Link className="text-sm underline" href={`/vendors/new?event=${id}`}>Assign a vendor from the vendor list, or add one.</Link>
        </section>
        <section>
          <h2 className="mb-2 font-medium">Inventory</h2>
          <ReserveForm eventId={id} items={items.map((item) => ({ id: String(item._id), name: item.name }))} />
          <ul className="mt-3 space-y-2">
            {data.reservations.map((reservation) => (
              <li key={String(reservation._id)} className="rounded-md border border-border bg-card p-3 text-sm">
                {items.find((item) => String(item._id) === String(reservation.itemId))?.name || "Item"} · reserved {reservation.quantityReserved} · issued {reservation.quantityIssued} · returned {reservation.quantityReturned} · damaged {reservation.quantityDamaged} · lost {reservation.quantityLost}
                <ReservationActions id={String(reservation._id)} reserved={reservation.quantityReserved || reservation.quantityIssued} />
              </li>
            ))}
          </ul>
        </section>
        {data.financials ? (
          <section>
            <h2 className="mb-2 font-medium">Gross contribution</h2>
            <p className="text-sm">Revenue {formatKsh(data.contribution.revenueCents)}</p>
            <p className="text-sm">Direct costs {formatKsh(data.contribution.directCostCents)}</p>
            <p className="text-sm font-medium">Contribution {formatKsh(data.contribution.grossContributionCents)} · {formatPercent(data.contribution.margin)}</p>
            <p className="mt-1 text-xs text-muted-foreground">This is not company profit. Overhead is not included.</p>
            <Link className="mt-2 inline-block text-sm underline" href={`/event-costs?event=${id}`}>Add a direct cost</Link>
          </section>
        ) : null}
        <section>
          <h2 className="mb-2 font-medium">Closeout</h2>
          <CloseoutList eventId={id} items={event.closeout?.items || []} />
        </section>
      </div>
      <h2 className="mt-8 font-medium">Timeline</h2>
      <ol className="mt-2 space-y-2 text-sm">
        {activity.map((item) => <li key={String(item._id)}>{item.summary} <span className="text-xs text-muted-foreground">{formatWhen(item.createdAt, "Africa/Nairobi", true)}</span></li>)}
      </ol>
    </div>
  );
}
