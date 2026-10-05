import Link from "next/link";
import { formatKsh } from "@/domain/money";
import { formatWhen } from "@/domain/operations";
import { DataRows, PageHeader } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { requirePermission, requireUser } from "@/server/guard";
import { Client } from "@/server/models";
import { listBookings } from "@/server/services/commercial";

export default async function BookingsPage() {
  const user = await requireUser();
  requirePermission(user, "bookings.read");
  const bookings = await listBookings();
  const clients = await Client.find({ _id: { $in: bookings.map((booking) => booking.clientId) } }).lean();
  return (
    <div>
      <PageHeader eyebrow="Events" title="Bookings" description="A hold is not a booking. Confirmation creates the event workspace only when the deposit rule is met, or an authorised person overrides it." actions={<Button asChild><Link href="/bookings/new">New booking</Link></Button>} />
      <DataRows
        columns={[{ key: "ref", header: "Booking" }, { key: "client", header: "Client" }, { key: "when", header: "When" }, { key: "status", header: "Status" }, { key: "agreed", header: "Agreed" }, { key: "balance", header: "Outstanding" }]}
        rows={bookings.map((booking) => ({
          id: String(booking._id),
          href: `/bookings/${booking._id}`,
          cells: {
            ref: booking.reference,
            client: clients.find((client) => String(client._id) === String(booking.clientId))?.name || "—",
            when: formatWhen(booking.startAt, "Africa/Nairobi", true),
            status: <StatusPill value={booking.status} />,
            agreed: formatKsh(booking.agreedAmountCents || 0),
            balance: formatKsh(booking.outstandingCents || 0),
          },
        }))}
        empty={<p className="text-sm text-muted-foreground">No bookings yet.</p>}
      />
    </div>
  );
}
