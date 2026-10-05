import Link from "next/link";
import { formatKsh, requiredDeposit } from "@/domain/money";
import { formatWhen } from "@/domain/operations";
import { can } from "@/domain/permissions";
import { QUOTE_STATUS_LABELS } from "@/domain/states";
import { QuoteForm } from "@/components/forms/quote-form";
import { QuoteMenu, SendProposal } from "@/components/forms/quote-actions";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { requirePermission, requireUser } from "@/server/guard";
import { ApprovalRequest, ServiceItem, User } from "@/server/models";
import { listSpaces } from "@/server/services/crm";
import { getQuotation } from "@/server/services/commercial";
import { quotationActivity } from "@/server/services/proposal";
import { getCommercial } from "@/server/settings";

function dateInput(value?: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export default async function QuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ revise?: string }>;
}) {
  const user = await requireUser();
  requirePermission(user, "quotes.read");
  const { id } = await params;
  const { revise } = await searchParams;
  const data = await getQuotation(id);
  const [spaces, services, commercial, activity, approval] = await Promise.all([
    listSpaces(),
    ServiceItem.find({ active: true }).sort({ category: 1, name: 1 }).lean(),
    getCommercial(),
    quotationActivity(id),
    ApprovalRequest.findOne({ entityType: "quotation", entityId: id, status: "pending" }).lean(),
  ]);
  const current = data.versions.find((version) => version.version === data.quote.currentVersion);
  const people = await User.find({
    _id: { $in: data.versions.map((version) => version.createdBy).filter(Boolean) },
  }).select("name").lean();
  const nameOf = (personId: unknown) => people.find((person) => String(person._id) === String(personId))?.name || "HQ";
  const clientName = data.client?.organizationName || data.client?.name || "Client";
  const contact = data.enquiry?.contact?.fullName || data.client?.name || clientName;
  const eventTitle = data.enquiry?.contact?.organization && data.enquiry.contact.organization !== clientName ? data.enquiry.contact.organization : clientName;
  const when = data.enquiry?.preferredDate ? formatWhen(data.enquiry.preferredDate) : "Date to be confirmed";
  const guests = data.enquiry?.estimatedGuests ? `${data.enquiry.estimatedGuests} guests` : "Guests to be confirmed";
  const total = current?.totalCents || 0;
  const deposit = current?.sentAt ? current.depositCents || 0 : requiredDeposit(total, commercial.deposit);
  const editable = data.quote.status === "draft";
  const revising = !editable && revise === "1" && can(user.role, "quotes.write");
  const catalogue = services.map((service) => ({
    id: String(service._id),
    name: service.name,
    description: service.description || "",
    category: service.category || "Other",
    unit: service.unit || "item",
    price: service.unitPriceCents / 100,
    taxBehavior: service.taxBehavior || "default",
  }));
  const initialLines = (current?.lines || []).map((line: { serviceItemId?: unknown; description: string; quantity: number; unitPriceCents: number; discountCents?: number; taxRate?: number; unit?: string; internalNote?: string }) => ({
    serviceItemId: line.serviceItemId ? String(line.serviceItemId) : "",
    description: line.description,
    quantity: line.quantity,
    unitPriceShillings: (line.unitPriceCents || 0) / 100,
    discountShillings: (line.discountCents || 0) / 100,
    taxRate: line.taxRate || 0,
    unit: line.unit || "item",
    internalNote: line.internalNote || "",
  }));
  const clientVersion = [...data.versions].reverse().find((version) => ["sent", "viewed", "accepted"].includes(version.status));

  return (
    <div>
      <header className="mb-6 flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{data.quote.reference}</p>
          <h1 className="font-display text-3xl leading-tight">{eventTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{contact} · {when} · {guests}</p>
          <p className="mt-3 font-display text-3xl">{formatKsh(total)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded bg-muted px-2 py-0.5">V{data.quote.currentVersion}</span>
            <StatusPill value={data.quote.status} label={QUOTE_STATUS_LABELS[data.quote.status as keyof typeof QUOTE_STATUS_LABELS]} />
            <span className="text-muted-foreground">{data.quote.validUntil ? `Valid until ${formatWhen(data.quote.validUntil)}` : "Not yet issued"}</span>
          </div>
        </div>
        <div className="relative flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary"><Link href={`/quotations/${id}/print`}>Preview proposal</Link></Button>
          {can(user.role, "quotes.send") && (editable || data.quote.status === "sent" || data.quote.status === "viewed") ? (
            <SendProposal
              id={id}
              recipient={contact}
              email={data.client?.email || data.enquiry?.contact?.email || ""}
              version={data.quote.currentVersion}
              total={formatKsh(total)}
              validUntil={data.quote.validUntil ? formatWhen(data.quote.validUntil) : "Set when sent"}
            />
          ) : null}
          {!editable && can(user.role, "quotes.write") ? <Button asChild variant="secondary"><Link href={`/quotations/${id}?revise=1`}>Create revision</Link></Button> : null}
          <QuoteMenu id={id} status={data.quote.status} canExpire={can(user.role, "quotes.write")} />
        </div>
      </header>

      {approval ? <p className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">This draft is waiting on approval before it can be sent.</p> : null}
      {data.quote.needsFollowUp ? <p className="mb-4 text-sm text-warning">Flagged for follow-up.</p> : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          {editable || revising ? (
            <QuoteForm
              enquiryId={String(data.quote.enquiryId || "")}
              quotationId={id}
              mode={editable ? "draft" : "revision"}
              spaces={spaces.map((space) => ({ id: String(space._id), name: space.name }))}
              services={catalogue}
              selectedSpaceIds={(data.quote.spaceIds || []).map(String)}
              lines={initialLines}
              inclusions={current?.inclusions || []}
              arrangements={current?.arrangements || ""}
              clientRequirements={current?.clientRequirements || data.enquiry?.requirements || ""}
              notes={data.quote.notes || ""}
              headerDiscountShillings={(current?.headerDiscountCents || 0) / 100}
              eventDate={dateInput(data.enquiry?.preferredDate)}
              startTime={data.enquiry?.startTime || ""}
              endTime={data.enquiry?.endTime || ""}
              guestCount={data.enquiry?.estimatedGuests || undefined}
              canOverridePrice={can(user.role, "quotes.override_price")}
              taxEnabled={commercial.taxEnabled}
              defaultTaxRate={commercial.defaultTaxRate}
              deposit={commercial.deposit}
            />
          ) : (
            <div>
              <section>
                <h2 className="text-sm font-medium">Event details</h2>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">Client</dt><dd>{clientName}</dd></div>
                  <div><dt className="text-muted-foreground">Contact</dt><dd>{contact}</dd></div>
                  <div><dt className="text-muted-foreground">Date</dt><dd>{when}</dd></div>
                  <div><dt className="text-muted-foreground">Time</dt><dd>{[data.enquiry?.startTime, data.enquiry?.endTime].filter(Boolean).join(" – ") || "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Guests</dt><dd>{guests}</dd></div>
                  <div><dt className="text-muted-foreground">Spaces</dt><dd>{data.spaces.map((space) => space.name).join(", ") || "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Enquiry</dt><dd>{data.enquiry ? <Link className="underline" href={`/enquiries/${data.enquiry._id}`}>{data.enquiry.reference}</Link> : "—"}</dd></div>
                </dl>
              </section>
              <div className="mt-6 overflow-x-auto rounded-md border border-border bg-card">
                <table className="w-full text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr><th className="px-3 py-2">Item</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Total</th></tr>
                  </thead>
                  <tbody>
                    {(current?.lines || []).map((line: { description: string; quantity: number; unit?: string; unitPriceCents: number; totalCents: number }, index: number) => (
                      <tr key={index} className="border-t border-border">
                        <td className="px-3 py-2">{line.description}</td>
                        <td>{line.quantity}</td>
                        <td className="capitalize">{line.unit || "item"}</td>
                        <td>{formatKsh(line.unitPriceCents)}</td>
                        <td>{formatKsh(line.totalCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className="mt-4 max-w-sm space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{formatKsh(current?.subtotalCents || 0)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd>{formatKsh(current?.discountCents || 0)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Tax</dt><dd>{formatKsh(current?.taxCents || 0)}</dd></div>
                <div className="flex justify-between border-t border-border pt-2 font-medium"><dt>Total investment</dt><dd>{formatKsh(total)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Required deposit</dt><dd>{formatKsh(deposit)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Remaining balance</dt><dd>{formatKsh(Math.max(0, total - deposit))}</dd></div>
              </dl>
              {(current?.inclusions || []).length ? (
                <section className="mt-6">
                  <h2 className="text-sm font-medium">Included in the proposal</h2>
                  <ul className="mt-2 list-disc pl-5 text-sm">{current?.inclusions.map((item: string) => <li key={item}>{item}</li>)}</ul>
                </section>
              ) : null}
              {current?.arrangements ? <p className="mt-4 text-sm"><span className="text-muted-foreground">Arrangements. </span>{current.arrangements}</p> : null}
              {(current?.lines || []).some((line: { internalNote?: string }) => line.internalNote) || data.quote.notes ? (
                <section className="mt-6 rounded-md bg-muted/60 p-3 text-sm">
                  <h2 className="font-medium">Internal notes</h2>
                  {data.quote.notes ? <p className="mt-2">{data.quote.notes}</p> : null}
                  <ul className="mt-2 space-y-1">
                    {(current?.lines || []).filter((line: { internalNote?: string }) => line.internalNote).map((line: { description: string; internalNote?: string }) => (
                      <li key={line.description}>{line.description}: {line.internalNote}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          )}
        </div>
        <aside className="space-y-6">
          <section>
            <h2 className="text-sm font-medium">Proposal history</h2>
            <ul className="mt-3 space-y-3 text-sm">
              {[...data.versions].reverse().map((version) => (
                <li key={version.version}>
                  <p className="font-medium">V{version.version} · {QUOTE_STATUS_LABELS[version.status as keyof typeof QUOTE_STATUS_LABELS] || version.status}</p>
                  <p>{formatKsh(version.totalCents || 0)}</p>
                  <p className="text-muted-foreground">
                    {version.sentAt ? `Sent ${formatWhen(version.sentAt)}` : `Created ${formatWhen(version.createdAt)}`} by {nameOf(version.sentBy || version.createdBy)}
                  </p>
                  {clientVersion?.version === version.version ? <p className="text-muted-foreground">Current client version</p> : null}
                  {version.reason ? <p className="text-muted-foreground">{version.reason}</p> : null}
                  <Link className="underline" href={`/quotations/${id}/print?version=${version.version}`}>Preview</Link>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="text-sm font-medium">Communication</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {activity.length === 0 ? <li className="text-muted-foreground">Nothing sent yet.</li> : null}
              {activity.map((item) => (
                <li key={String(item._id)}>
                  <span className="text-muted-foreground">{formatWhen(item.createdAt)} · </span>
                  {item.summary}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
