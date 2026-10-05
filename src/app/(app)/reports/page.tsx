import { formatKsh, formatPercent } from "@/domain/money";
import { PageHeader } from "@/components/page";
import { requireUser } from "@/server/guard";
import { can } from "@/domain/permissions";
import { operationsReport, revenueReport, salesReport } from "@/server/services/insights";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; view?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const to = params.to ? new Date(params.to) : new Date();
  const from = params.from ? new Date(params.from) : new Date(to.getFullYear(), to.getMonth(), 1);
  const view = params.view || "sales";
  const allowed = view === "operations" ? can(user.role, "reports.operations") || can(user.role, "reports.finance") : view === "profit" ? can(user.role, "reports.finance") : can(user.role, "reports.sales") || can(user.role, "reports.finance");
  if (!allowed) return <PageHeader title="Reports" description="Your role does not include this report." />;
  const sales = view === "sales" || view === "lost" ? await salesReport(from, to) : null;
  const revenue = view === "revenue" ? await revenueReport(from, to) : null;
  const operations = view === "operations" || view === "profit" ? await operationsReport(from, to) : null;
  return (
    <div>
      <PageHeader eyebrow="Insights" title="Reports" description="Filter by date. Tables first. A chart only appears where a month trend is easier to read than a list." />
      <form className="mb-4 flex flex-wrap gap-2">
        <input type="date" name="from" defaultValue={from.toISOString().slice(0, 10)} className="h-9 rounded-md border border-border bg-card px-2 text-sm" />
        <input type="date" name="to" defaultValue={to.toISOString().slice(0, 10)} className="h-9 rounded-md border border-border bg-card px-2 text-sm" />
        <select name="view" defaultValue={view} className="h-9 rounded-md border border-border bg-card px-2 text-sm">
          <option value="sales">Sales</option>
          <option value="lost">Lost opportunities</option>
          <option value="revenue">Revenue</option>
          <option value="operations">Operations</option>
          <option value="profit">Contribution</option>
        </select>
        <button className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground">Apply</button>
      </form>
      {sales && view === "sales" ? (
        <dl className="grid gap-3 sm:grid-cols-3 text-sm">
          {[["Enquiries", sales.enquiries], ["Qualified", sales.qualified], ["Visits", sales.visits], ["Quotations", sales.quotations], ["Bookings", sales.bookings], ["Lost", sales.lost], ["Conversion", formatPercent(sales.conversion)], ["Average booking", formatKsh(sales.averageBooking)], ["Open pipeline", formatKsh(sales.pipelineCents)]].map(([label, value]) => (
            <div key={String(label)} className="rounded-md border border-border bg-card px-3 py-3"><dt className="text-muted-foreground">{label}</dt><dd className="text-lg">{value}</dd></div>
          ))}
        </dl>
      ) : null}
      {sales && view === "lost" ? (
        <table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th>Reason</th><th>Count</th><th>Estimated value</th></tr></thead><tbody>{sales.lostBreakdown.map((row) => <tr key={row.reason} className="border-t border-border"><td className="py-2">{row.reason}</td><td>{row.count}</td><td>{formatKsh(row.valueCents)}</td></tr>)}</tbody></table>
      ) : null}
      {revenue ? (
        <div className="space-y-4 text-sm">
          <p>Confirmed {formatKsh(revenue.confirmedCents)} · Collected {formatKsh(revenue.collectedCents)} · Outstanding {formatKsh(revenue.outstandingCents)}</p>
          <h2 className="font-medium">By month</h2>
          <div className="space-y-1">{revenue.byMonth.map((row) => <div key={row.month} className="grid grid-cols-[6rem_1fr_auto] items-center gap-2"><span>{row.month}</span><span className="h-2 rounded bg-primary/70" style={{ width: `${Math.min(100, row.cents / Math.max(...revenue.byMonth.map((item) => item.cents), 1) * 100)}%` }} /><span>{formatKsh(row.cents)}</span></div>)}</div>
          <h2 className="font-medium">By source</h2>
          {revenue.bySource.map((row) => <p key={row.name}>{row.name} · {formatKsh(row.cents)}</p>)}
          <h2 className="font-medium">By space</h2>
          {revenue.bySpace.map((row) => <p key={row.name}>{row.name} · {formatKsh(row.cents)}</p>)}
        </div>
      ) : null}
      {operations ? (
        <div className="space-y-2 text-sm">
          <p>Events {operations.events} · Completed {operations.completed} · Cancelled {operations.cancelled} · Average guests {Math.round(operations.averageGuests)}</p>
          <p>Low stock items {operations.low.length} · Damage/loss movements {operations.movements.filter((movement) => movement.type === "damage" || movement.type === "loss").length}</p>
          <p>Vendor spend {formatKsh(operations.vendorSpendCents)}</p>
          <p>Revenue {formatKsh(operations.contribution.revenueCents)} · Direct costs {formatKsh(operations.contribution.directCostCents)} · Gross contribution {formatKsh(operations.contribution.grossContributionCents)} ({formatPercent(operations.contribution.margin)})</p>
        </div>
      ) : null}
    </div>
  );
}
