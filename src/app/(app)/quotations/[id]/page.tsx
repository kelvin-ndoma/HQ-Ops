import Link from "next/link";
import { formatKsh } from "@/domain/money";
import { formatWhen } from "@/domain/operations";
import { QuoteActions } from "@/components/forms/quote-actions";
import { QuoteForm } from "@/components/forms/quote-form";
import { PageHeader } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { requirePermission, requireUser } from "@/server/guard";
import { ServiceItem } from "@/server/models";
import { listSpaces } from "@/server/services/crm";
import { getQuotation } from "@/server/services/commercial";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  requirePermission(user, "quotes.read");
  const { id } = await params;
  const data = await getQuotation(id);
  const [spaces, services] = await Promise.all([listSpaces(), ServiceItem.find({ active: true }).lean()]);
  const current = data.versions.find((version) => version.version === data.quote.currentVersion);
  return (
    <div>
      <PageHeader
        eyebrow={data.quote.reference}
        title={`${data.client?.name || "Quotation"} · V${data.quote.currentVersion}`}
        description={data.quote.validUntil ? `Valid until ${formatWhen(data.quote.validUntil)}` : "Draft — not yet issued"}
        actions={<Button asChild variant="secondary"><Link href={`/quotations/${id}/print`}>Print view</Link></Button>}
      />
      <div className="mb-4 flex items-center gap-3"><StatusPill value={data.quote.status} />{data.quote.needsFollowUp ? <span className="text-sm text-warning">Flagged for follow-up</span> : null}</div>
      <QuoteActions id={id} status={data.quote.status} />
      {data.quote.status === "accepted" ? <div className="mt-4"><Button asChild><Link href={`/bookings/new?quotation=${id}`}>Create booking from this version</Link></Button></div> : null}
      <div className="mt-6 overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead>
          <tbody>
            {(current?.lines || []).map((line: { description: string; quantity: number; unitPriceCents: number; totalCents: number }, index: number) => (
              <tr key={index} className="border-t border-border"><td className="px-3 py-2">{line.description}</td><td>{line.quantity}</td><td>{formatKsh(line.unitPriceCents)}</td><td>{formatKsh(line.totalCents)}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="px-3 py-3 text-right font-medium">{formatKsh(current?.totalCents || 0)}</p>
      </div>
      <h2 className="mt-8 font-medium">Version history</h2>
      <ul className="mt-2 space-y-2 text-sm">
        {data.versions.map((version) => (
          <li key={version.version} className="flex justify-between rounded-md border border-border bg-card px-3 py-2">
            <span>V{version.version} · {version.status}{version.reason ? ` · ${version.reason}` : ""}</span>
            <span>{formatKsh(version.totalCents || 0)}</span>
          </li>
        ))}
      </ul>
      <h2 className="mt-8 font-medium">Revise</h2>
      <p className="mb-3 text-sm text-muted-foreground">Editing a sent quote opens the next version. The previous total stays on the record.</p>
      <QuoteForm
        enquiryId={String(data.quote.enquiryId)}
        quotationId={id}
        spaces={spaces.map((space) => ({ id: String(space._id), name: space.name }))}
        services={services.map((service) => ({ id: String(service._id), name: service.name, price: service.unitPriceCents / 100 }))}
      />
    </div>
  );
}
