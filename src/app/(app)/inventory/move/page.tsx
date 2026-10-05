import { NewItemForm, StockForm } from "@/components/forms/stock-form";
import { PageHeader } from "@/components/page";
import { requirePermission, requireUser } from "@/server/guard";
import { InventoryCategory } from "@/server/models";
import { listItems } from "@/server/services/inventory";

export default async function StockMovePage() {
  const user = await requireUser();
  requirePermission(user, "inventory.move");
  const [items, categories] = await Promise.all([listItems(), InventoryCategory.find({ active: true }).lean()]);
  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <div>
        <PageHeader title="Stock movement" description="Stock in, stock out, damage and loss are recorded with a reason and the person who did it." />
        <StockForm items={items.map((item) => ({ id: String(item._id), name: item.name }))} />
      </div>
      <div>
        <h2 className="mb-3 font-medium">New item</h2>
        <NewItemForm categories={categories.map((category) => ({ id: String(category._id), name: category.name }))} />
      </div>
    </div>
  );
}
