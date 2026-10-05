import { PageHeader } from "@/components/page";
import { requirePermission, requireUser } from "@/server/guard";
import { LeadSource } from "@/server/models";
import { listStaff } from "@/server/services/crm";
import { listEnquiryLinks } from "@/server/services/public-enquiry";
import { ShareEnquiryForm } from "./share-form";

export default async function ShareEnquiryPage() {
  const user = await requireUser();
  requirePermission(user, "enquiries.write");
  const [sources, staff, links] = await Promise.all([
    LeadSource.find({ active: true }).sort({ name: 1 }).select("name").lean(),
    listStaff(),
    listEnquiryLinks(),
  ]);
  return (
    <div>
      <PageHeader eyebrow="Sales" title="Share enquiry form" description="Copy the public link, or generate one that records the source, campaign, and referring staff. The URL carries a token, not an internal id." />
      <ShareEnquiryForm
        sources={sources.map((source) => ({ id: String(source._id), name: source.name }))}
        staff={staff.map((person) => ({ id: String(person._id), name: person.name }))}
        links={links}
      />
    </div>
  );
}
