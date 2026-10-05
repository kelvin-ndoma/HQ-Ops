import Link from "next/link";
import { DataRows, EmptyState, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { requirePermission, requireUser } from "@/server/guard";
import { listClients } from "@/server/services/crm";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  requirePermission(user, "clients.read");
  const { q } = await searchParams;
  const clients = await listClients(q);
  return (
    <div>
      <PageHeader eyebrow="Sales" title="Clients" description="People and organisations stay here after the first enquiry, so a return booking is obvious." actions={<Button asChild><Link href="/clients/new">New client</Link></Button>} />
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={q} placeholder="Name, company, phone" className="h-9 flex-1 rounded-md border border-border bg-card px-3 text-sm" /><Button variant="secondary" type="submit">Search</Button></form>
      <DataRows
        columns={[{ key: "name", header: "Client" }, { key: "org", header: "Organisation" }, { key: "phone", header: "Phone" }, { key: "email", header: "Email" }]}
        rows={clients.map((client) => ({ id: String(client._id), href: `/clients/${client._id}`, cells: { name: client.name, org: client.organizationName || "—", phone: client.phone, email: client.email || "—" } }))}
        empty={<EmptyState title="No clients yet" body="Capture an enquiry and HQ will open the client profile with it." />}
      />
    </div>
  );
}
