import { PaymentForm } from "@/components/forms/finance-forms";
import { PageHeader } from "@/components/page";
import { requirePermission, requireUser } from "@/server/guard";
import { Booking, Client, PaymentMethod } from "@/server/models";

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<{ booking?: string; client?: string }> }) {
  const user = await requireUser();
  requirePermission(user, "payments.write");
  const params = await searchParams;
  const [bookings, clients, methods] = await Promise.all([
    Booking.find({ archivedAt: null, status: { $ne: "cancelled" } }).lean(),
    Client.find({ archivedAt: null }).lean(),
    PaymentMethod.find({ active: true }).lean(),
  ]);
  return (
    <div>
      <PageHeader title="Record a payment" description="Submitting twice with the same form will not double-count. Refunds cannot exceed what has been collected." />
      <PaymentForm
        preset={{ bookingId: params.booking, clientId: params.client }}
        methods={methods.map((method) => ({ id: String(method._id), name: method.name }))}
        bookings={bookings.map((booking) => ({
          id: String(booking._id),
          clientId: String(booking.clientId),
          label: `${booking.reference} · ${clients.find((client) => String(client._id) === String(booking.clientId))?.name || ""}`,
        }))}
      />
    </div>
  );
}
