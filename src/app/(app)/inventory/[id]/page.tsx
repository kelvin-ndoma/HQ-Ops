import { formatWhen } from "@/domain/operations";
import { PageHeader } from "@/components/page";
import { requirePermission, requireUser } from "@/server/guard";
import { getItem } from "@/server/services/inventory";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  requirePermission(user, "inventory.read");
  const { id } = await params;
  const data = await getItem(id);
  const item = data.item;
  return (
    <div>
      <PageHeader eyebrow={item.sku} title={item.name} description={`${item.assetType} · ${item.location || "No location"} · reorder at ${item.reorderLevel}`} />
      <dl className="mb-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-muted-foreground">On hand</dt><dd>{item.quantityOnHand}</dd></div>
        <div><dt className="text-muted-foreground">Reserved</dt><dd>{item.quantityReserved}</dd></div>
        <div><dt className="text-muted-foreground">Checked out</dt><dd>{item.quantityCheckedOut}</dd></div>
        <div><dt className="text-muted-foreground">Available</dt><dd>{item.available}</dd></div>
      </dl>
      <h2 className="font-medium">Movements</h2>
      <ul className="mt-2 space-y-2 text-sm">
        {data.movements.map((movement) => <li key={String(movement._id)} className="border-b border-border py-2">{movement.type.replaceAll("_", " ")} · {movement.quantity} · {movement.reason} <span className="text-xs text-muted-foreground">{formatWhen(movement.createdAt, "Africa/Nairobi", true)}{movement.override ? " · override" : ""}</span></li>)}
      </ul>
    </div>
  );
}
