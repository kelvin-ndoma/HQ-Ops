import Link from "next/link";
import { formatKsh } from "@/domain/money";
import { formatWhen } from "@/domain/operations";
import { DataRows, PageHeader } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { requirePermission, requireUser } from "@/server/guard";
import { Booking, Client, Payment } from "@/server/models";

export default async function PaymentsPage() {
  const user = await requireUser();
  requirePermission(user, "payments.read");
  const payments = await Payment.find().sort({ paidAt: -1 }).limit(200).lean();
  const [clients, bookings] = await Promise.all([
    Client.find({ _id: { $in: payments.map((payment) => payment.clientId) } }).lean(),
    Booking.find({ _id: { $in: payments.map((payment) => payment.bookingId) } }).lean(),
  ]);
  return (
    <div>
      <PageHeader eyebrow="Finance" title="Payments" description="Deposits, balances, extra charges and refunds. A payment is not edited; a mistake is corrected with another entry." actions={<Button asChild><Link href="/payments/new">Record payment</Link></Button>} />
      <DataRows
        columns={[{ key: "when", header: "Date" }, { key: "client", header: "Client" }, { key: "booking", header: "Booking" }, { key: "type", header: "Type" }, { key: "amount", header: "Amount" }]}
        rows={payments.map((payment) => ({
          id: String(payment._id),
          href: `/bookings/${payment.bookingId}`,
          cells: {
            when: formatWhen(payment.paidAt),
            client: clients.find((client) => String(client._id) === String(payment.clientId))?.name || "—",
            booking: bookings.find((booking) => String(booking._id) === String(payment.bookingId))?.reference || "—",
            type: <StatusPill value={payment.type} />,
            amount: formatKsh(payment.amountCents),
          },
        }))}
        empty={<p className="text-sm text-muted-foreground">No payments recorded.</p>}
      />
    </div>
  );
}
