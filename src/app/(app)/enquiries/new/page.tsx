import { EnquiryForm } from "@/components/forms/enquiry-form";
import { PageHeader } from "@/components/page";
import { requirePermission, requireUser } from "@/server/guard";
import { activeCatalog, listSpaces, listStaff } from "@/server/services/crm";
import { EventType, LeadSource } from "@/server/models";

export default async function NewEnquiryPage() {
  const user = await requireUser();
  requirePermission(user, "enquiries.write");
  const [eventTypes, sources, spaces, owners] = await Promise.all([
    activeCatalog(EventType),
    activeCatalog(LeadSource),
    listSpaces(),
    listStaff(),
  ]);
  const option = (rows: { _id: unknown; name: string }[]) => rows.map((row) => ({ id: String(row._id), name: row.name }));
  return (
    <div>
      <PageHeader eyebrow="Sales" title="Capture an enquiry" description="If it is not in HQ, it does not exist. Link it to an existing client when the phone matches." />
      <EnquiryForm eventTypes={option(eventTypes)} sources={option(sources)} spaces={option(spaces)} owners={option(owners)} />
    </div>
  );
}
