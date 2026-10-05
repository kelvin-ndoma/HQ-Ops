"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, { error: "" });
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      <section className="hidden bg-sidebar px-12 py-14 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <p className="font-display text-5xl">HQ</p>
        <div>
          <p className="max-w-md font-display text-4xl leading-tight">The operating record for HQ events.</p>
          <p className="mt-4 max-w-sm text-sm text-sidebar-muted">Enquiries, holds, quotations, deposits, preparation and closeout stay in one place so the next person can take over without a private notebook.</p>
        </div>
        <p className="text-xs uppercase tracking-[0.18em] text-sidebar-muted">Nairobi · Private events</p>
      </section>
      <section className="flex items-center px-6 py-16">
        <form action={action} className="mx-auto w-full max-w-sm space-y-4">
          <p className="font-display text-4xl lg:hidden">HQ</p>
          <h1 className="font-display text-3xl">Sign in</h1>
          <input type="hidden" name="next" value={next} />
          <label className="block text-sm">
            Email
            <input name="email" type="email" required autoComplete="username" className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3" />
          </label>
          <label className="block text-sm">
            Password
            <input name="password" type="password" required autoComplete="current-password" className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input name="remember" type="checkbox" className="h-4 w-4" />
            Remember me on this device for 30 days
          </label>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <button disabled={pending} className="h-10 w-full rounded-md bg-primary text-sm text-primary-foreground">
            {pending ? "Signing in…" : "Enter HQ Operations"}
          </button>
        </form>
      </section>
    </div>
  );
}
