import Link from "next/link";
import { formatKsh } from "@/domain/money";
import { QUOTE_STATUS_LABELS } from "@/domain/states";
import { DataRows, PageHeader } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { requirePermission, requireUser } from "@/server/guard";
import { Client } from "@/server/models";
import { listQuotations } from "@/server/services/commercial";

export default async function QuotationsPage() {
  const user = await requireUser();
  requirePermission(user, "quotes.read");
  const quotes = await listQuotations();
  const clients = await Client.find({ _id: { $in: quotes.map((quote) => quote.clientId) } }).lean();
  return (
    <div>
      <PageHeader eyebrow="Sales" title="Quotations" description="A sent quote is never overwritten. The next price is a new version, with the person and reason kept." actions={<Button asChild variant="secondary"><Link href="/enquiries">Start from an enquiry</Link></Button>} />
      <DataRows
        columns={[{ key: "ref", header: "Quote" }, { key: "client", header: "Client" }, { key: "version", header: "Version" }, { key: "total", header: "Total" }, { key: "status", header: "Status" }]}
        rows={quotes.map((quote) => ({
          id: String(quote._id),
          href: `/quotations/${quote._id}`,
          cells: {
            ref: quote.reference,
            client: clients.find((client) => String(client._id) === String(quote.clientId))?.name || "—",
            version: `V${quote.currentVersion}`,
            total: formatKsh(quote.version?.totalCents || 0),
            status: <StatusPill value={quote.status} label={QUOTE_STATUS_LABELS[quote.status as keyof typeof QUOTE_STATUS_LABELS]} />,
          },
        }))}
        empty={<p className="text-sm text-muted-foreground">No quotations yet.</p>}
      />
    </div>
  );
}
