import { VendorForm } from "@/components/forms/vendor-form";
import { PageHeader } from "@/components/page";
import { requirePermission, requireUser } from "@/server/guard";
import { VendorCategory } from "@/server/models";

export default async function NewVendorPage() {
  const user = await requireUser();
  requirePermission(user, "vendors.write");
  const categories = await VendorCategory.find({ active: true }).sort({ name: 1 }).lean();
  return <div><PageHeader title="New vendor" description="Pricing notes are guidance. The agreed cost is entered on the event, so a package price is never assumed." /><VendorForm categories={categories.map((category) => ({ id: String(category._id), name: category.name }))} /></div>;
}
