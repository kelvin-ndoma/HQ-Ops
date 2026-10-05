import Link from "next/link";
import { formatKsh } from "@/domain/money";
import { formatWhen } from "@/domain/operations";
import { QUOTE_STATUS_LABELS, type QuoteStatus } from "@/domain/states";
import { DataRows, PageHeader } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { requirePermission, requireUser } from "@/server/guard";
import { Client, Enquiry, EventType, User } from "@/server/models";
import { listQuotations } from "@/server/services/commercial";
import { pendingQuoteApprovals } from "@/server/services/proposal";

const VIEWS = [
  ["all", "All"],
  ["draft", "Draft"],
  ["awaiting", "Awaiting approval"],
  ["sent", "Sent"],
  ["viewed", "Viewed"],
  ["accepted", "Accepted"],
  ["declined", "Declined"],
  ["expired", "Expired"],
] as const;

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireUser();
  requirePermission(user, "quotes.read");
  const { view = "all" } = await searchParams;
  const quotes = await listQuotations();
  const ids = quotes.map((quote) => String(quote._id));
  const [clients, enquiries, approvals, owners] = await Promise.all([
    Client.find({ _id: { $in: quotes.map((quote) => quote.clientId) } }).lean(),
    Enquiry.find({ _id: { $in: quotes.map((quote) => quote.enquiryId).filter(Boolean) } }).lean(),
    pendingQuoteApprovals(ids),
    User.find({ _id: { $in: quotes.map((quote) => quote.ownerId).filter(Boolean) } }).select("name").lean(),
  ]);
  const types = await EventType.find({ _id: { $in: enquiries.map((enquiry) => enquiry.eventTypeId).filter(Boolean) } }).lean();
  const pending = new Set(approvals.map((item) => item.entityId));
  const soon = Date.now() + 3 * 24 * 60 * 60 * 1000;
  const rows = quotes.filter((quote) => {
    if (view === "awaiting") return pending.has(String(quote._id));
    if (view === "all") return true;
    return quote.status === view;
  });
  return (
    <div>
      <PageHeader eyebrow="Sales" title="Quotations" description="A sent version stays as it was issued. The next price is a new version." actions={<Button asChild variant="secondary"><Link href="/enquiries">Start from an enquiry</Link></Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {VIEWS.map(([key, label]) => (
          <Link key={key} href={key === "all" ? "/quotations" : `/quotations?view=${key}`} className={`rounded-md px-2.5 py-1 text-sm ${view === key ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{label}</Link>
        ))}
      </div>
      <DataRows
        columns={[
          { key: "ref", header: "Reference" },
          { key: "client", header: "Client" },
          { key: "event", header: "Event" },
          { key: "date", header: "Event date" },
          { key: "version", header: "Version" },
          { key: "total", header: "Total" },
          { key: "status", header: "Status" },
          { key: "until", header: "Valid until" },
          { key: "owner", header: "Owner" },
          { key: "activity", header: "Last activity" },
        ]}
        rows={rows.map((quote) => {
          const enquiry = enquiries.find((item) => String(item._id) === String(quote.enquiryId));
          const expiring = quote.validUntil && new Date(quote.validUntil).getTime() < soon && ["sent", "viewed"].includes(quote.status);
          const flags = [
            pending.has(String(quote._id)) ? "Approval" : "",
            quote.needsFollowUp ? "Follow up" : "",
            expiring ? "Expiring" : "",
          ].filter(Boolean);
          return {
            id: String(quote._id),
            href: `/quotations/${quote._id}`,
            cells: {
              ref: quote.reference,
              client: clients.find((client) => String(client._id) === String(quote.clientId))?.name || "—",
              event: types.find((type) => String(type._id) === String(enquiry?.eventTypeId))?.name || "—",
              date: enquiry?.preferredDate ? formatWhen(enquiry.preferredDate) : "—",
              version: `V${quote.currentVersion}`,
              total: formatKsh(quote.version?.totalCents || 0),
              status: (
                <span className="inline-flex flex-col gap-1">
                  <StatusPill value={quote.status} label={QUOTE_STATUS_LABELS[quote.status as QuoteStatus]} />
                  {flags.length ? <span className="text-xs text-warning">{flags.join(" · ")}</span> : null}
                </span>
              ),
              until: quote.validUntil ? formatWhen(quote.validUntil) : "—",
              owner: owners.find((owner) => String(owner._id) === String(quote.ownerId))?.name || "—",
              activity: formatWhen(quote.lastActivityAt),
            },
          };
        })}
        empty={<p className="text-sm text-muted-foreground">No quotations in this view.</p>}
      />
    </div>
  );
}
