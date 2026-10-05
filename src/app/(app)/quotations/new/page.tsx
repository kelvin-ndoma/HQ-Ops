import { QuoteForm } from "@/components/forms/quote-form";
import { PageHeader } from "@/components/page";
import { requirePermission, requireUser } from "@/server/guard";
import { Enquiry, ServiceItem } from "@/server/models";
import { listSpaces } from "@/server/services/crm";

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ enquiry?: string }> }) {
  const user = await requireUser();
  requirePermission(user, "quotes.write");
  const { enquiry } = await searchParams;
  if (!enquiry) return <PageHeader title="Choose an enquiry" description="Quotations belong to an opportunity. Open the enquiry and use Send quotation." />;
  const [record, spaces, services] = await Promise.all([
    Enquiry.findById(enquiry).lean(),
    listSpaces(),
    ServiceItem.find({ active: true }).sort({ name: 1 }).lean(),
  ]);
  if (!record) return <PageHeader title="Enquiry not found" />;
  return (
    <div>
      <PageHeader eyebrow={record.reference} title="Draft quotation" description="Prices come from the service catalogue. Change them here for this quote only." />
      <QuoteForm
        enquiryId={enquiry}
        spaces={spaces.map((space) => ({ id: String(space._id), name: space.name }))}
        services={services.map((service) => ({ id: String(service._id), name: service.name, price: service.unitPriceCents / 100 }))}
      />
    </div>
  );
}
