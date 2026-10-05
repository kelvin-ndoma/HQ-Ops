"use client";

import { useActionState } from "react";
import { changePasswordAction } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, { error: "", ok: false });
  return (
    <form action={action} className="grid max-w-md gap-3">
      <label className="block text-sm">
        Current password
        <input name="currentPassword" type="password" required autoComplete="current-password" className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3" />
      </label>
      <label className="block text-sm">
        New password
        <input name="newPassword" type="password" required minLength={10} autoComplete="new-password" className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3" />
      </label>
      <label className="block text-sm">
        Confirm new password
        <input name="confirmPassword" type="password" required minLength={10} autoComplete="new-password" className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3" />
      </label>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-primary">Password updated. Other sessions for this account have been signed out.</p> : null}
      <button disabled={pending} className="h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground">
        {pending ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}
