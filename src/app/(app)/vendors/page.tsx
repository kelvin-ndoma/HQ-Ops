import Link from "next/link";
import { DataRows, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { requirePermission, requireUser } from "@/server/guard";
import { VendorCategory } from "@/server/models";
import { listVendors } from "@/server/services/events";

export default async function VendorsPage() {
  const user = await requireUser();
  requirePermission(user, "vendors.read");
  const [vendors, categories] = await Promise.all([listVendors(), VendorCategory.find().lean()]);
  return (
    <div>
      <PageHeader eyebrow="Operations" title="Vendors" description="Catering, décor, security and the rest. Agreed costs flow into the event contribution, not into a general ledger." actions={<Button asChild><Link href="/vendors/new">New vendor</Link></Button>} />
      <DataRows
        columns={[{ key: "name", header: "Vendor" }, { key: "category", header: "Category" }, { key: "phone", header: "Phone" }, { key: "preferred", header: "Preferred" }]}
        rows={vendors.map((vendor) => ({
          id: String(vendor._id),
          href: `/vendors/${vendor._id}`,
          cells: {
            name: vendor.name,
            category: categories.find((category) => String(category._id) === String(vendor.categoryId))?.name || "—",
            phone: vendor.phone || "—",
            preferred: vendor.preferred ? "Yes" : "—",
          },
        }))}
        empty={<p className="text-sm text-muted-foreground">No vendors yet.</p>}
      />
    </div>
  );
}
