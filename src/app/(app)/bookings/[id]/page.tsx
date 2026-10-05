import Link from "next/link";
import { formatKsh } from "@/domain/money";
import { formatWhen } from "@/domain/operations";
import { BookingDecisions } from "@/components/forms/booking-form";
import { PageHeader } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/permissions";
import { requirePermission, requireUser } from "@/server/guard";
import { getBooking } from "@/server/services/commercial";

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  requirePermission(user, "bookings.read");
  const { id } = await params;
  const data = await getBooking(id);
  const booking = data.booking;
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_0.7fr]">
      <div>
        <PageHeader eyebrow={booking.reference} title={data.client?.name || "Booking"} description={formatWhen(booking.startAt, "Africa/Nairobi", true)} actions={data.event ? <Button asChild><Link href={`/events/${data.event._id}`}>Open event</Link></Button> : null} />
        <div className="mb-4 flex flex-wrap gap-2">
          <StatusPill value={booking.status} />
          <StatusPill value={booking.financialStatus} />
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] uppercase tracking-wide">{data.spaceReserved ? "Venue reserved" : "Venue not reserved"}</span>
        </div>
        {!data.spaceReserved && (booking.status === "awaiting_deposit" || booking.status === "tentative") ? <p className="mb-4 text-sm text-warning">The hold has expired. This record is still {booking.status.replaceAll("_", " ")}, and the space can be booked by someone else until the hold is reinstated.</p> : null}
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Spaces</dt><dd>{data.spaces.map((space) => space.name).join(", ")}</dd></div>
          <div><dt className="text-muted-foreground">Guests</dt><dd>{booking.guestCount}</dd></div>
          <div><dt className="text-muted-foreground">Agreed</dt><dd>{formatKsh(booking.agreedAmountCents)}</dd></div>
          <div><dt className="text-muted-foreground">Deposit required</dt><dd>{formatKsh(booking.depositRequiredCents || 0)}</dd></div>
          <div><dt className="text-muted-foreground">Deposit received</dt><dd>{formatKsh(booking.depositReceivedCents || 0)}</dd></div>
          <div><dt className="text-muted-foreground">Outstanding</dt><dd>{formatKsh(booking.outstandingCents || 0)}</dd></div>
        </dl>
        {booking.specialConditions ? <p className="mt-4 text-sm">{booking.specialConditions}</p> : null}
        {booking.cancellationReason ? <p className="mt-4 text-sm">Cancelled: {booking.cancellationReason}</p> : null}
        <h2 className="mt-6 font-medium">Payments</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {data.payments.map((payment) => <li key={String(payment._id)} className="flex justify-between border-b border-border py-2"><span>{payment.type} · {formatWhen(payment.paidAt)}</span><span>{formatKsh(payment.amountCents)}</span></li>)}
        </ul>
        <div className="mt-4"><Button asChild variant="secondary"><Link href={`/payments/new?booking=${id}&client=${booking.clientId}`}>Record payment</Link></Button></div>
      </div>
      <aside className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-3 font-medium">Decision</h2>
        <BookingDecisions id={id} status={booking.status} reserved={data.spaceReserved} canExtend={can(user.role, "bookings.extend_hold")} canRequest={can(user.role, "bookings.request_hold")} />
      </aside>
    </div>
  );
}
