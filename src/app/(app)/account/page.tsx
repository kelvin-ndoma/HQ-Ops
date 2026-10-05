import { ROLE_LABELS } from "@/domain/permissions";
import { PasswordForm } from "./password-form";
import { PageHeader } from "@/components/page";
import { requireUser } from "@/server/guard";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="max-w-xl">
      <PageHeader eyebrow="Account" title={user.name} description={user.email} />
      <dl className="mb-8 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Role</dt><dd>{ROLE_LABELS[user.role]}</dd></div>
        <div><dt className="text-muted-foreground">Email</dt><dd>{user.email}</dd></div>
      </dl>
      <h2 className="mb-1 font-medium">Password</h2>
      <p className="mb-3 text-sm text-muted-foreground">Use at least 10 characters. Changing it signs out every other session.</p>
      <PasswordForm />
    </div>
  );
}
