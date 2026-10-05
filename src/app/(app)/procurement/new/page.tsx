import { ProcurementForm } from "@/components/forms/finance-forms";
import { PageHeader } from "@/components/page";
import { requirePermission, requireUser } from "@/server/guard";
import { EventRecord, Vendor } from "@/server/models";

export default async function NewProcurementPage() {
  const user = await requireUser();
  requirePermission(user, "procurement.write");
  const [vendors, events] = await Promise.all([
    Vendor.find({ active: true, archivedAt: null }).lean(),
    EventRecord.find({ archivedAt: null }).select("reference").lean(),
  ]);
  return (
    <div>
      <PageHeader title="Procurement request" description="Say what is needed and why. Approval is a separate step." />
      <ProcurementForm vendors={vendors.map((vendor) => ({ id: String(vendor._id), name: vendor.name }))} events={events.map((event) => ({ id: String(event._id), label: event.reference }))} />
    </div>
  );
}
