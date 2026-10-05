import { formatWhen } from "@/domain/operations";
import { PageHeader } from "@/components/page";
import { requirePermission, requireUser } from "@/server/guard";
import { Client, Space } from "@/server/models";
import { calendarItems } from "@/server/services/commercial";

function monthGrid(anchor: Date) {
  const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const gridStart = new Date(start);
  const day = gridStart.getUTCDay();
  gridStart.setUTCDate(gridStart.getUTCDate() - ((day + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + index);
    return date;
  });
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; view?: string }> }) {
  const user = await requireUser();
  requirePermission(user, "bookings.read");
  const params = await searchParams;
  const anchor = params.month ? new Date(`${params.month}-01T00:00:00Z`) : new Date();
  const days = monthGrid(anchor);
  const items = await calendarItems(days[0], new Date(days[41].getTime() + 86400000));
  const clients = await Client.find({ _id: { $in: items.bookings.map((booking) => booking.clientId) } }).select("name").lean();
  const spaces = await Space.find().lean();
  const clientName = (id: unknown) => clients.find((client) => String(client._id) === String(id))?.name || "Client";
  const spaceName = (ids: unknown[]) => (ids || []).map((id) => spaces.find((space) => String(space._id) === String(id))?.name).filter(Boolean).join(", ");
  const previous = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
  return (
    <div>
      <PageHeader eyebrow="Events" title="Calendar" description="Tentative holds, deposit-pending bookings and confirmed events share the diary. An expired hold stops blocking the space." actions={<span className="flex gap-2 text-sm"><a className="rounded-md border border-border px-3 py-1.5" href={`/calendar?month=${previous}`}>Previous</a><a className="rounded-md border border-border px-3 py-1.5" href={`/calendar?month=${next}`}>Next</a></span>} />
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-border bg-border text-xs">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day} className="bg-muted px-2 py-1 text-muted-foreground">{day}</div>)}
        {days.map((day) => {
          const key = day.toISOString().slice(0, 10);
          const bookings = items.bookings.filter((booking) => new Date(booking.startAt).toISOString().slice(0, 10) === key);
          const visits = items.visits.filter((visit) => new Date(visit.scheduledAt).toISOString().slice(0, 10) === key);
          return (
            <div key={key} className="min-h-28 bg-card p-1.5">
              <p className="text-muted-foreground">{day.getUTCDate()}</p>
              {bookings.map((booking) => (
                <a key={String(booking._id)} href={`/bookings/${booking._id}`} className={`mt-1 block rounded px-1 py-0.5 ${booking.status === "confirmed" ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground"}`}>
                  {booking.reference} {clientName(booking.clientId)}
                  <span className="block text-[10px] opacity-70">{spaceName(booking.spaceIds)} · {booking.status.replaceAll("_", " ")}</span>
                </a>
              ))}
              {visits.map((visit) => <a key={String(visit._id)} href={`/site-visits/${visit._id}`} className="mt-1 block rounded bg-muted px-1 py-0.5">Visit · {formatWhen(visit.scheduledAt, "Africa/Nairobi", true)}</a>)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
