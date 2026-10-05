import { formatWhen } from "@/domain/operations";
import { DataRows, PageHeader } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { requirePermission, requireUser } from "@/server/guard";
import { Client } from "@/server/models";
import { listEvents } from "@/server/services/events";

export default async function EventsPage() {
  const user = await requireUser();
  requirePermission(user, "events.read");
  const events = await listEvents(user);
  const clients = await Client.find({ _id: { $in: events.map((event) => event.clientId) } }).lean();
  return (
    <div>
      <PageHeader eyebrow="Events" title="Events" description="A confirmed booking opens a working file. Preparation, vendors, stock and closeout live there." />
      <DataRows
        columns={[{ key: "ref", header: "Event" }, { key: "client", header: "Client" }, { key: "when", header: "When" }, { key: "guests", header: "Guests" }, { key: "status", header: "Status" }, { key: "prep", header: "Preparation" }]}
        rows={events.map((event) => ({
          id: String(event._id),
          href: `/events/${event._id}`,
          cells: {
            ref: event.reference,
            client: clients.find((client) => String(client._id) === String(event.clientId))?.name || "—",
            when: formatWhen(event.startAt, "Africa/Nairobi", true),
            guests: event.guestCount || "—",
            status: <StatusPill value={event.status} />,
            prep: <StatusPill value={event.preparationStatus || "on_track"} />,
          },
        }))}
        empty={<p className="text-sm text-muted-foreground">No event workspaces yet. Confirm a booking to create one.</p>}
      />
    </div>
  );
}
