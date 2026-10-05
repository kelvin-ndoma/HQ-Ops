import { TaskForm } from "@/components/forms/task-form";
import { PageHeader } from "@/components/page";
import { requirePermission, requireUser } from "@/server/guard";
import { listStaff } from "@/server/services/crm";

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const user = await requireUser();
  requirePermission(user, "tasks.write");
  const { event } = await searchParams;
  const staff = await listStaff();
  return (
    <div>
      <PageHeader title="New task" description="Tie it to an event when it is part of preparation. General tasks stay on the same list." />
      <TaskForm eventId={event} owners={staff.map((person) => ({ id: String(person._id), name: person.name }))} />
    </div>
  );
}
