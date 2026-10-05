import { formatWhen } from "@/domain/operations";
import { PageHeader } from "@/components/page";
import { requirePermission, requireUser } from "@/server/guard";
import { User } from "@/server/models";
import { listActivity, listAudit } from "@/server/services/insights";

export default async function ActivityPage() {
  const user = await requireUser();
  requirePermission(user, "audit.read");
  const [activity, audit, users] = await Promise.all([listActivity(), listAudit(), User.find().select("name").lean()]);
  const name = (id: unknown) => users.find((person) => String(person._id) === String(id))?.name || "System";
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section>
        <PageHeader title="Activity" description="The story staff can read on a record." />
        <ul className="space-y-3 text-sm">
          {activity.map((item) => <li key={String(item._id)}><p>{item.summary}</p><p className="text-xs text-muted-foreground">{item.entityType} · {name(item.actorId)} · {formatWhen(item.createdAt, "Africa/Nairobi", true)}</p></li>)}
        </ul>
      </section>
      <section>
        <h2 className="mb-3 font-display text-2xl">Audit</h2>
        <p className="mb-3 text-sm text-muted-foreground">These rows cannot be edited in the application.</p>
        <ul className="space-y-3 text-sm">
          {audit.map((item) => <li key={String(item._id)} className="border-b border-border pb-2"><p className="font-medium">{item.action}</p><p className="text-xs text-muted-foreground">{item.entityType} {item.entityId} · {name(item.actorId)} · {formatWhen(item.createdAt, "Africa/Nairobi", true)}</p>{item.reason ? <p>{item.reason}</p> : null}</li>)}
        </ul>
      </section>
    </div>
  );
}
