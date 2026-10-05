import Link from "next/link";
import { DataRows, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { requirePermission, requireUser } from "@/server/guard";
import { listItems } from "@/server/services/inventory";

export default async function InventoryPage() {
  const user = await requireUser();
  requirePermission(user, "inventory.read");
  const items = await listItems();
  return (
    <div>
      <PageHeader eyebrow="Operations" title="Inventory" description="Chairs, glassware and equipment. Reservations cannot exceed what is available unless an authorised person overrides it, and that override is audited." actions={<Button asChild><Link href="/inventory/move">Stock movement</Link></Button>} />
      <DataRows
        columns={[{ key: "name", header: "Item" }, { key: "sku", header: "SKU" }, { key: "on", header: "On hand" }, { key: "reserved", header: "Reserved" }, { key: "out", header: "Out" }, { key: "available", header: "Available" }]}
        rows={items.map((item) => ({
          id: String(item._id),
          href: `/inventory/${item._id}`,
          cells: {
            name: item.available <= item.reorderLevel ? `${item.name} · low` : item.name,
            sku: item.sku,
            on: item.quantityOnHand,
            reserved: item.quantityReserved,
            out: item.quantityCheckedOut,
            available: item.available,
          },
        }))}
        empty={<p className="text-sm text-muted-foreground">No inventory yet. Add items from a stock movement, or seed the database.</p>}
      />
    </div>
  );
}
