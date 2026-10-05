import Link from "next/link";
import { can, ROLE_LABELS, ROLES } from "@/domain/permissions";
import { formatWhen } from "@/domain/operations";
import { PageHeader } from "@/components/page";
import { InviteUserForm } from "@/components/forms/user-access";
import { requirePermission, requireUser } from "@/server/guard";
import { listUsers } from "@/server/services/users";

const STATUS_LABELS = { invited: "Invited", active: "Active", suspended: "Suspended", deactivated: "Deactivated" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; status?: string }> }) {
  const actor = await requireUser();
  requirePermission(actor, "users.read");
  const params = await searchParams;
  const manage = can(actor.role, "users.manage");
  const users = await listUsers({ q: params.q, role: params.role, status: params.status });
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Settings" title="Users and access" description="Invite people, change roles, and turn access on or off. Historical work stays with the person who did it." />
      <form className="grid gap-2 sm:grid-cols-4">
        <input name="q" defaultValue={params.q || ""} placeholder="Name or email" className="h-9 rounded-md border border-border bg-card px-3 text-sm" />
        <select name="role" defaultValue={params.role || ""} className="h-9 rounded-md border border-border bg-card px-2 text-sm">
          <option value="">All roles</option>
          {ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
        </select>
        <select name="status" defaultValue={params.status || ""} className="h-9 rounded-md border border-border bg-card px-2 text-sm">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button className="h-9 rounded-md bg-secondary px-3 text-sm" type="submit">Filter</button>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Role</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium">Last login</th>
              <th className="py-2 font-medium">Invited</th>
              <th className="py-2 font-medium">Joined</th>
              <th className="py-2 font-medium">Created by</th>
            </tr>
          </thead>
          <tbody>
            {users.map((person) => (
              <tr key={person.id} className="border-t border-border">
                <td className="py-2"><Link className="font-medium underline" href={`/settings/users/${person.id}`}>{person.name}</Link><div className="text-muted-foreground">{person.email}</div></td>
                <td className="py-2">{ROLE_LABELS[person.role]}</td>
                <td className="py-2">{STATUS_LABELS[person.status]}</td>
                <td className="py-2">{formatWhen(person.lastLoginAt, "Africa/Nairobi", true)}</td>
                <td className="py-2">{formatWhen(person.invitedAt)}</td>
                <td className="py-2">{formatWhen(person.joinedAt)}</td>
                <td className="py-2">{person.createdBy || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No people match.</p> : null}
      </div>
      {manage ? (
        <section>
          <h2 className="mb-3 font-medium">Invite user</h2>
          <InviteUserForm />
        </section>
      ) : <p className="text-sm text-muted-foreground">You can review access. An administrator changes roles and invitations.</p>}
    </div>
  );
}
