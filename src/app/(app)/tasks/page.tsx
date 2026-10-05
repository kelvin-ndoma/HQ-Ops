import Link from "next/link";
import { can } from "@/domain/permissions";
import { formatWhen, isPastDue } from "@/domain/operations";
import { CompleteTask } from "@/components/forms/task-form";
import { DataRows, PageHeader } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { requirePermission, requireUser } from "@/server/guard";
import { User } from "@/server/models";
import { listTasks } from "@/server/services/events";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const user = await requireUser();
  requirePermission(user, "tasks.read");
  const params = await searchParams;
  const scope = params.scope === "team" && can(user.role, "tasks.view_team") ? "team" : "mine";
  const tasks = await listTasks(user, scope);
  const owners = await User.find({ _id: { $in: tasks.map((task) => task.ownerId) } }).select("name").lean();
  return (
    <div>
      <PageHeader eyebrow="Events" title={scope === "team" ? "Team tasks" : "My tasks"} description="Overdue work is marked. Leadership can switch to the team list." actions={<span className="flex gap-2">{can(user.role, "tasks.view_team") ? <Button asChild variant="secondary"><Link href={scope === "team" ? "/tasks" : "/tasks?scope=team"}>{scope === "team" ? "My tasks" : "Team"}</Link></Button> : null}<Button asChild><Link href="/tasks/new">New task</Link></Button></span>} />
      <DataRows
        columns={[{ key: "title", header: "Task" }, { key: "owner", header: "Owner" }, { key: "due", header: "Due" }, { key: "priority", header: "Priority" }, { key: "status", header: "Status" }, { key: "action", header: "" }]}
        rows={tasks.map((task) => ({
          id: String(task._id),
          cells: {
            title: task.title,
            owner: owners.find((owner) => String(owner._id) === String(task.ownerId))?.name || "—",
            due: <span className={isPastDue(task.dueAt, task.status) ? "text-destructive" : ""}>{formatWhen(task.dueAt, "Africa/Nairobi", true)}</span>,
            priority: <StatusPill value={task.priority || "normal"} />,
            status: <StatusPill value={task.status} />,
            action: <CompleteTask id={String(task._id)} />,
          },
        }))}
        empty={<p className="text-sm text-muted-foreground">Nothing assigned.</p>}
      />
    </div>
  );
}
