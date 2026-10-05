import { BookingForm } from "@/components/forms/booking-form";
import { PageHeader } from "@/components/page";
import { requirePermission, requireUser } from "@/server/guard";
import { listSpaces, listStaff, listClients } from "@/server/services/crm";
import { getQuotation } from "@/server/services/commercial";

export default async function NewBookingPage({ searchParams }: { searchParams: Promise<{ quotation?: string }> }) {
  const user = await requireUser();
  requirePermission(user, "bookings.write");
  const { quotation } = await searchParams;
  const [clients, spaces, staff] = await Promise.all([listClients(), listSpaces(), listStaff()]);
  let preset: { quotationId?: string; enquiryId?: string; clientId?: string; agreed?: number } | undefined;
  if (quotation) {
    const data = await getQuotation(quotation);
    const version = data.versions.find((item) => item.version === data.quote.currentVersion);
    preset = {
      quotationId: quotation,
      enquiryId: data.quote.enquiryId ? String(data.quote.enquiryId) : "",
      clientId: String(data.quote.clientId),
      agreed: (version?.totalCents || 0) / 100,
    };
  }
  return (
    <div>
      <PageHeader eyebrow="Events" title="New booking" description="Choose a hold if the client is not ready to commit. Choose commit when they have accepted the quotation." />
      <BookingForm
        preset={preset}
        clients={clients.map((client) => ({ id: String(client._id), name: client.name }))}
        spaces={spaces.map((space) => ({ id: String(space._id), name: space.name }))}
        owners={staff.map((person) => ({ id: String(person._id), name: person.name }))}
      />
    </div>
  );
}
