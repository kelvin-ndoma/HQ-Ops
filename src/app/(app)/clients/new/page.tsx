import { ClientForm } from "@/components/forms/client-form";
import { PageHeader } from "@/components/page";
import { requirePermission, requireUser } from "@/server/guard";

export default async function NewClientPage() {
  const user = await requireUser();
  requirePermission(user, "clients.write");
  return <div><PageHeader eyebrow="Sales" title="New client" description="HQ will warn you if this phone or email already belongs to someone." /><ClientForm /></div>;
}
