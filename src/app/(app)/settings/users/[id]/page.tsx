import Link from "next/link";
import { notFound } from "next/navigation";
import { can, ROLE_LABELS } from "@/domain/permissions";
import { formatWhen } from "@/domain/operations";
import { PageHeader } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { UserControls } from "@/components/forms/user-access";
import { requirePermission, requireUser } from "@/server/guard";
import { AppError } from "@/server/errors";
import { getManagedUser, listActiveAssignees } from "@/server/services/users";

const STATUS_LABELS = { invited: "Invited", active: "Active", suspended: "Suspended", deactivated: "Deactivated" };

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireUser();
  requirePermission(actor, "users.read");
  const { id } = await params;
  let data;
  try {
    data = await getManagedUser(id);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
  const manage = can(actor.role, "users.manage");
  const assignees = manage ? (await listActiveAssignees()).map((person) => ({ id: String(person._id), name: person.name })) : [];
  const person = data.user;
  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
      <div>
        <PageHeader eyebrow="Users and access" title={person.name} description={[person.jobTitle, person.email].filter(Boolean).join(" · ")} />
        <div className="mb-4"><StatusPill value={person.status} label={STATUS_LABELS[person.status]} /></div>
        <dl className="grid gap-3 rounded-md border border-border bg-card p-4 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Role</dt><dd>{ROLE_LABELS[person.role]}</dd></div>
          <div><dt className="text-muted-foreground">Phone</dt><dd>{person.phone || "—"}</dd></div>
          <div><dt className="text-muted-foreground">Last login</dt><dd>{formatWhen(person.lastLoginAt, "Africa/Nairobi", true)}</dd></div>
          <div><dt className="text-muted-foreground">Invited</dt><dd>{formatWhen(person.invitedAt, "Africa/Nairobi", true)}</dd></div>
          <div><dt className="text-muted-foreground">Joined</dt><dd>{formatWhen(person.joinedAt, "Africa/Nairobi", true)}</dd></div>
          <div><dt className="text-muted-foreground">Created by</dt><dd>{person.createdBy || "—"}</dd></div>
        </dl>
        <h2 className="mt-8 font-medium">Invitation history</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {data.invitations.map((invitation) => (
            <li key={invitation.id}>
              Sent {formatWhen(invitation.createdAt, "Africa/Nairobi", true)} · {invitation.usedAt ? "Accepted" : invitation.revokedAt ? "Replaced" : `Expires ${formatWhen(invitation.expiresAt, "Africa/Nairobi", true)}`}
              {invitation.devPreviewUrl ? <span className="mt-1 block break-all text-muted-foreground">{invitation.devPreviewUrl}</span> : null}
            </li>
          ))}
          {data.invitations.length === 0 ? <li className="text-muted-foreground">No invitations on record.</li> : null}
        </ul>
        <h2 className="mt-8 font-medium">Assigned enquiries</h2>
        <ul className="mt-2 space-y-2 text-sm">{data.enquiries.map((enquiry) => <li key={String(enquiry._id)}><Link className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2" href={`/enquiries/${enquiry._id}`}><span>{enquiry.reference} · {enquiry.contact?.fullName}</span><StatusPill value={String(enquiry.stage)} /></Link></li>)}{data.enquiries.length === 0 ? <li className="text-muted-foreground">None assigned.</li> : null}</ul>
        <h2 className="mt-6 font-medium">Assigned tasks</h2>
        <ul className="mt-2 space-y-1 text-sm">{data.tasks.map((task) => <li key={String(task._id)}>{task.title} · {task.status}</li>)}{data.tasks.length === 0 ? <li className="text-muted-foreground">None assigned.</li> : null}</ul>
        <h2 className="mt-6 font-medium">Upcoming events</h2>
        <ul className="mt-2 space-y-1 text-sm">{data.events.map((event) => <li key={String(event._id)}><Link className="underline" href={`/events/${event._id}`}>{event.reference}</Link> · {formatWhen(event.startAt, "Africa/Nairobi", true)}</li>)}{data.events.length === 0 ? <li className="text-muted-foreground">None coming up.</li> : null}</ul>
        <h2 className="mt-6 font-medium">Recent activity</h2>
        <ul className="mt-2 space-y-1 text-sm">{data.activity.map((item) => <li key={String(item._id)}>{item.summary}</li>)}{data.activity.length === 0 ? <li className="text-muted-foreground">No recent activity.</li> : null}</ul>
      </div>
      {manage ? (
        <aside className="rounded-md border border-border bg-card p-4">
          <h2 className="mb-3 font-medium">Access</h2>
          <UserControls userId={person.id} name={person.name} role={person.role} status={person.status} assignees={assignees} />
        </aside>
      ) : null}
    </div>
  );
}
