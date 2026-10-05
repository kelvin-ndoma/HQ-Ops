"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROLE_LABELS, ROLES, type Role } from "@/domain/permissions";
import { changeRoleAction, deactivateUserAction, deleteInvitedUserAction, inviteUserAction, reactivateUserAction, resendInvitationAction, suspendUserAction, workloadAction } from "@/app/(app)/settings/users/actions";
import { acceptInvitationAction } from "@/app/accept-invite/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";

export function InviteUserForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  return (
    <form className="grid gap-3 md:grid-cols-2" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const result = await inviteUserAction({
        name: String(form.get("name") || ""),
        email: String(form.get("email") || ""),
        phone: String(form.get("phone") || ""),
        jobTitle: String(form.get("jobTitle") || ""),
        role: String(form.get("role") || ""),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError("");
      setLink(result.data?.inviteUrl || "");
      router.refresh();
    }}>
      <Field label="Full name"><Input name="name" required /></Field>
      <Field label="Email"><Input name="email" type="email" required /></Field>
      <Field label="Job title" hint="Optional"><Input name="jobTitle" /></Field>
      <Field label="Phone" hint="Optional"><Input name="phone" /></Field>
      <Field label="Role">
        <Select name="role" defaultValue="sales_coordinator">
          {ROLES.filter((role) => role !== "super_admin").map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
        </Select>
      </Field>
      <div className="flex items-end"><Button type="submit">Send invitation</Button></div>
      {error ? <p className="text-sm text-destructive md:col-span-2">{error}</p> : null}
      {link ? <p className="break-all text-sm md:col-span-2">Development invitation link: {link}</p> : null}
    </form>
  );
}

export function UserControls({
  userId,
  name,
  role,
  status,
  assignees,
}: {
  userId: string;
  name: string;
  role: Role;
  status: string;
  assignees: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [nextRole, setNextRole] = useState(role);
  const [confirmRole, setConfirmRole] = useState(false);
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [deactivate, setDeactivate] = useState<{ enquiries: number; tasks: number; bookings: number; events: number; approvals: number } | null>(null);
  const [reassignTo, setReassignTo] = useState(assignees.find((person) => person.id !== userId)?.id || "");
  const [link, setLink] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-2 rounded-md border border-border p-3">
        <p className="font-medium">Role</p>
        <Select value={nextRole} onChange={(event) => { setNextRole(event.target.value as Role); setConfirmRole(false); }}>
          {ROLES.filter((item) => item !== "super_admin" || role === "super_admin").map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}
        </Select>
        {confirmRole ? (
          <div className="space-y-2">
            <p>Change {name} to {ROLE_LABELS[nextRole]}? Their current sign-in will end.</p>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={async () => {
                const result = await changeRoleAction(userId, nextRole);
                if (!result.ok) setError(result.error);
                else { setConfirmRole(false); router.refresh(); }
              }}>Confirm role change</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setConfirmRole(false)}>Cancel</Button>
            </div>
          </div>
        ) : <Button type="button" size="sm" variant="secondary" onClick={() => setConfirmRole(true)} disabled={nextRole === role}>Change role</Button>}
      </div>

      {status === "invited" ? (
        <div className="space-y-2">
          <Button type="button" variant="secondary" onClick={async () => {
            const result = await resendInvitationAction(userId);
            if (!result.ok) setError(result.error);
            else { setLink(result.data?.inviteUrl || ""); router.refresh(); }
          }}>Resend invitation</Button>
          {confirmRemove ? (
            <div className="space-y-2 rounded-md border border-border p-3">
              <p>Remove this unused invitation for {name}? They have not joined, and the current link will stop working.</p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="destructive" onClick={async () => {
                  const result = await deleteInvitedUserAction(userId);
                  if (!result.ok) setError(result.error);
                  else router.push("/settings/users");
                }}>Remove invitation</Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setConfirmRemove(false)}>Cancel</Button>
              </div>
            </div>
          ) : <Button type="button" variant="destructive" onClick={() => setConfirmRemove(true)}>Remove unused invitation</Button>}
          {link ? <p className="break-all">Development invitation link: {link}</p> : null}
        </div>
      ) : null}

      {status === "active" ? (
        confirmSuspend ? (
          <div className="space-y-2 rounded-md border border-border p-3">
            <p>Suspend {name}? They will lose access until an administrator turns it back on. Their records stay in place.</p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="destructive" onClick={async () => {
                const result = await suspendUserAction(userId);
                if (!result.ok) setError(result.error);
                else { setConfirmSuspend(false); router.refresh(); }
              }}>Suspend {name}</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setConfirmSuspend(false)}>Cancel</Button>
            </div>
          </div>
        ) : <Button type="button" variant="secondary" onClick={() => setConfirmSuspend(true)}>Suspend access</Button>
      ) : null}

      {status === "suspended" || status === "deactivated" ? (
        <Button type="button" onClick={async () => {
          const result = await reactivateUserAction(userId);
          if (!result.ok) setError(result.error);
          else router.refresh();
        }}>Restore access</Button>
      ) : null}

      {status === "active" || status === "suspended" ? (
        deactivate ? (
          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="font-medium">Deactivate {name}?</p>
            <p>{name} will immediately lose access to HQ Operations.</p>
            <p>{deactivate.enquiries} open enquiries, {deactivate.tasks} incomplete tasks, {deactivate.bookings} upcoming bookings and {deactivate.events} live events are currently with them.{deactivate.approvals ? ` ${deactivate.approvals} approval requests stay in their name.` : ""}</p>
            {deactivate.enquiries + deactivate.tasks + deactivate.bookings + deactivate.events > 0 ? (
              <Field label="Move open work to">
                <Select value={reassignTo} onChange={(event) => setReassignTo(event.target.value)}>
                  {assignees.filter((person) => person.id !== userId).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </Select>
              </Field>
            ) : null}
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="destructive" onClick={async () => {
                const open = deactivate.enquiries + deactivate.tasks + deactivate.bookings + deactivate.events;
                const result = await deactivateUserAction(userId, open > 0 ? reassignTo : undefined);
                if (!result.ok) setError(result.error);
                else { setDeactivate(null); router.refresh(); }
              }}>{deactivate.enquiries + deactivate.tasks + deactivate.bookings + deactivate.events > 0 ? "Deactivate and reassign" : `Deactivate ${name}`}</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setDeactivate(null)}>Cancel</Button>
            </div>
          </div>
        ) : <Button type="button" variant="destructive" onClick={async () => {
          const result = await workloadAction(userId);
          if (!result.ok || !result.data) setError(result.ok ? "The workload could not be loaded." : result.error);
          else setDeactivate(result.data);
        }}>Deactivate</Button>
      ) : null}
      {error ? <p className="text-destructive">{error}</p> : null}
    </div>
  );
}

export function AcceptInviteForm({ token, name, email, phone, jobTitle }: { token: string; name: string; email: string; phone: string; jobTitle: string }) {
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <section className="rounded-md border border-border bg-card px-5 py-8">
        <h1 className="font-display text-4xl text-primary">Your account is ready.</h1>
        <p className="mt-3 text-sm">Sign in with {email} and the password you just chose.</p>
        <a className="mt-4 inline-block text-sm underline" href="/login">Go to sign in</a>
      </section>
    );
  }
  return (
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const result = await acceptInvitationAction({
        token,
        name: String(form.get("name") || ""),
        phone: String(form.get("phone") || ""),
        jobTitle: String(form.get("jobTitle") || ""),
        password: String(form.get("password") || ""),
        confirmPassword: String(form.get("confirmPassword") || ""),
      });
      if (!result.ok) setError(result.error);
      else setDone(true);
    }}>
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">HQ Operations</p>
        <h1 className="mt-2 font-display text-4xl text-primary">Set up your account</h1>
        <p className="mt-2 text-sm text-muted-foreground">This invitation is for {email}.</p>
      </header>
      <Field label="Name"><Input name="name" defaultValue={name} required /></Field>
      <Field label="Job title" hint="Optional"><Input name="jobTitle" defaultValue={jobTitle} /></Field>
      <Field label="Phone" hint="Optional"><Input name="phone" defaultValue={phone} /></Field>
      <Field label="Password"><Input name="password" type="password" minLength={10} required /></Field>
      <Field label="Confirm password"><Input name="confirmPassword" type="password" minLength={10} required /></Field>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button className="h-11 w-full" type="submit">Activate account</Button>
    </form>
  );
}
