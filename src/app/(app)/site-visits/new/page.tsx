import { VisitForm } from "@/components/forms/visit-form";
import { PageHeader } from "@/components/page";
import { requirePermission, requireUser } from "@/server/guard";
import { Enquiry } from "@/server/models";
import { listSpaces, listStaff } from "@/server/services/crm";

export default async function NewVisitPage({ searchParams }: { searchParams: Promise<{ enquiry?: string }> }) {
  const user = await requireUser();
  requirePermission(user, "visits.write");
  const params = await searchParams;
  const [enquiries, staff, spaces] = await Promise.all([
    Enquiry.find({ archivedAt: null, stage: { $nin: ["lost", "cancelled"] } }).sort({ createdAt: -1 }).limit(100).lean(),
    listStaff(),
    listSpaces(),
  ]);
  return (
    <div>
      <PageHeader eyebrow="Sales" title="Schedule a site visit" description="The assignee gets a reminder, and a post-visit follow-up is created so the quotation does not depend on memory." />
      <VisitForm
        enquiryId={params.enquiry}
        enquiries={enquiries.map((enquiry) => ({ id: String(enquiry._id), label: `${enquiry.reference} · ${enquiry.contact?.fullName}` }))}
        staff={staff.map((person) => ({ id: String(person._id), name: person.name }))}
        spaces={spaces.map((space) => ({ id: String(space._id), name: space.name }))}
      />
    </div>
  );
}
