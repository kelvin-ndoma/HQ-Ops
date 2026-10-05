import { QuoteForm } from "@/components/forms/quote-form";
import { PageHeader } from "@/components/page";
import { can } from "@/domain/permissions";
import { formatWhen } from "@/domain/operations";
import { requirePermission, requireUser } from "@/server/guard";
import { Client, Enquiry, EventType, ServiceItem } from "@/server/models";
import { listSpaces } from "@/server/services/crm";
import { getCommercial } from "@/server/settings";

function dateInput(value?: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ enquiry?: string }> }) {
  const user = await requireUser();
  requirePermission(user, "quotes.write");
  const { enquiry } = await searchParams;
  if (!enquiry) return <PageHeader title="Choose an enquiry" description="Open the opportunity and use Create quotation." />;
  const [record, spaces, services, commercial] = await Promise.all([
    Enquiry.findById(enquiry).lean(),
    listSpaces(),
    ServiceItem.find({ active: true }).sort({ category: 1, name: 1 }).lean(),
    getCommercial(),
  ]);
  if (!record) return <PageHeader title="Enquiry not found" />;
  const [client, eventType] = await Promise.all([
    Client.findById(record.clientId).lean(),
    record.eventTypeId ? EventType.findById(record.eventTypeId).lean() : null,
  ]);
  const requested = new Set((record.requestedServiceIds || []).map(String));
  const seeded = services.filter((service) => requested.has(String(service._id)));
  const lines = (seeded.length ? seeded : []).map((service) => ({
    serviceItemId: String(service._id),
    description: service.name,
    quantity: service.unit === "guest" ? record.estimatedGuests || 1 : 1,
    unitPriceShillings: service.unitPriceCents / 100,
    discountShillings: 0,
    taxRate: service.taxBehavior === "exempt" || !commercial.taxEnabled ? 0 : commercial.defaultTaxRate,
    unit: service.unit || "item",
    internalNote: "",
  }));
  const organization = client?.organizationName || record.contact?.organization || client?.name || "Client";
  return (
    <div>
      <PageHeader
        eyebrow={record.reference}
        title={organization}
        description={[eventType?.name, record.preferredDate ? formatWhen(record.preferredDate) : null, record.estimatedGuests ? `${record.estimatedGuests} guests` : null].filter(Boolean).join(" · ")}
      />
      <QuoteForm
        enquiryId={enquiry}
        mode="create"
        spaces={spaces.map((space) => ({ id: String(space._id), name: space.name }))}
        services={services.map((service) => ({
          id: String(service._id),
          name: service.name,
          description: service.description || "",
          category: service.category || "Other",
          unit: service.unit || "item",
          price: service.unitPriceCents / 100,
          taxBehavior: service.taxBehavior || "default",
        }))}
        selectedSpaceIds={(record.spaceIds || []).map(String)}
        lines={lines}
        inclusions={[]}
        arrangements=""
        clientRequirements={record.requirements || ""}
        notes=""
        headerDiscountShillings={0}
        eventDate={dateInput(record.preferredDate)}
        startTime={record.startTime || ""}
        endTime={record.endTime || ""}
        guestCount={record.estimatedGuests || undefined}
        canOverridePrice={can(user.role, "quotes.override_price")}
        taxEnabled={commercial.taxEnabled}
        defaultTaxRate={commercial.defaultTaxRate}
        deposit={commercial.deposit}
      />
    </div>
  );
}
