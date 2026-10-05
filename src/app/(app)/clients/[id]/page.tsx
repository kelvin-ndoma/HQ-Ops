import { formatKsh } from "@/domain/money";
import { formatWhen } from "@/domain/operations";
import { PageHeader } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { requirePermission, requireUser } from "@/server/guard";
import { getClientProfile } from "@/server/services/crm";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  requirePermission(user, "clients.read");
  const { id } = await params;
  const profile = await getClientProfile(id);
  const client = profile.client;
  return (
    <div>
      <PageHeader eyebrow={profile.repeat ? "Returning client" : client.kind} title={client.name} description={client.organizationName || client.phone} />
      <dl className="mb-6 grid gap-3 text-sm sm:grid-cols-3">
        <div><dt className="text-muted-foreground">Phone</dt><dd>{client.phone}</dd></div>
        <div><dt className="text-muted-foreground">Email</dt><dd>{client.email || "—"}</dd></div>
        <div><dt className="text-muted-foreground">Lifetime contracted</dt><dd>{formatKsh(profile.contracted)}</dd></div>
        <div><dt className="text-muted-foreground">Upcoming</dt><dd>{profile.upcoming[0] ? formatWhen(profile.upcoming[0].startAt) : "None"}</dd></div>
        <div><dt className="text-muted-foreground">Last event</dt><dd>{profile.lastEvent ? formatWhen(profile.lastEvent.startAt) : "None yet"}</dd></div>
      </dl>
      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 font-medium">Enquiries</h2>
          {profile.enquiries.map((enquiry) => <a key={String(enquiry._id)} href={`/enquiries/${enquiry._id}`} className="mb-2 flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"><span>{enquiry.reference}</span><StatusPill value={enquiry.stage} /></a>)}
        </section>
        <section>
          <h2 className="mb-2 font-medium">Bookings</h2>
          {profile.bookings.map((booking) => <a key={String(booking._id)} href={`/bookings/${booking._id}`} className="mb-2 flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"><span>{booking.reference} · {formatWhen(booking.startAt)}</span><StatusPill value={booking.status} /></a>)}
        </section>
      </div>
      {client.notes ? <p className="mt-4 text-sm">{client.notes}</p> : null}
    </div>
  );
}
