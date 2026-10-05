import { AssignVendorForm } from "@/components/forms/vendor-form";
import { PageHeader } from "@/components/page";
import { requirePermission, requireUser } from "@/server/guard";
import { EventRecord } from "@/server/models";
import { getVendor } from "@/server/services/events";

export default async function VendorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ event?: string }> }) {
  const user = await requireUser();
  requirePermission(user, "vendors.read");
  const { id } = await params;
  const query = await searchParams;
  const data = await getVendor(id);
  const events = await EventRecord.find({ archivedAt: null, status: { $nin: ["closed", "cancelled"] } }).select("reference").lean();
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <PageHeader eyebrow={data.vendor.preferred ? "Preferred" : "Vendor"} title={data.vendor.name} description={data.vendor.pricingNotes || data.vendor.paymentTerms} />
        <dl className="space-y-2 text-sm">
          <div><dt className="text-muted-foreground">Contact</dt><dd>{data.vendor.contactName} · {data.vendor.phone} · {data.vendor.email}</dd></div>
          <div><dt className="text-muted-foreground">Services</dt><dd>{(data.vendor.services || []).join(", ") || "—"}</dd></div>
          <div><dt className="text-muted-foreground">Notes</dt><dd>{data.vendor.notes || "—"}</dd></div>
        </dl>
      </div>
      <div>
        <h2 className="mb-3 font-medium">Assign to an event</h2>
        {events.map((event) => (
          <details key={String(event._id)} open={query.event === String(event._id)} className="mb-2 rounded-md border border-border bg-card p-3">
            <summary className="cursor-pointer text-sm">{event.reference}</summary>
            <div className="mt-3"><AssignVendorForm eventId={String(event._id)} vendorId={id} /></div>
          </details>
        ))}
      </div>
    </div>
  );
}
