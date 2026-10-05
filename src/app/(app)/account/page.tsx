import { PasswordForm } from "./password-form";
import { PageHeader } from "@/components/page";
import { requireUser } from "@/server/guard";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div>
      <PageHeader eyebrow="Account" title="Password" description={`${user.name} · ${user.email}. Use at least 10 characters. Changing it signs out every other session.`} />
      <PasswordForm />
    </div>
  );
}
