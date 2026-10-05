import { formatKsh } from "@/domain/money";
import { ENQUIRY_STATUS_LABELS, type EnquiryStatus } from "@/domain/states";
import { formatWhen } from "@/domain/operations";
import { PageHeader } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { commandCentre } from "@/server/services/insights";
import { requireUser } from "@/server/guard";

export default async function CommandCentrePage() {
  const user = await requireUser();
  const data = await commandCentre(user);
  return (
    <div>
      <PageHeader eyebrow="Today" title="What needs attention" description="Open work comes first. Numbers are here to tell you where to act, not to decorate the page." />
      {data.kpis.depositUnconfigured ? (
        <p className="mb-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">Deposit rules are not configured. Bookings will not demand a deposit until leadership sets one in Settings.</p>
      ) : null}
      <section className="rounded-md border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-medium">Needs attention</h2>
        </div>
        {data.attention.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nothing is overdue. Check today&apos;s tasks before you leave the desk.</p>
        ) : (
          <ul>
            {data.attention.map((item) => (
              <li key={item.id} className="border-t border-border first:border-t-0">
                <a href={item.href} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50">
                  <span>
                    <span className="block text-sm font-medium">{item.title}</span>
                    <span className="text-xs text-muted-foreground">{item.detail}</span>
                  </span>
                  <span className={item.tone === "bad" ? "text-xs text-destructive" : "text-xs text-warning"}>{item.tone === "bad" ? "Overdue" : "Due"}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["New enquiries", data.kpis.newEnquiries],
          ["Follow-ups due", data.kpis.followUpsDue],
          ["Overdue", data.kpis.overdueFollowUps],
          ["Site visits", data.kpis.siteVisits],
          ["Quotes waiting", data.kpis.quotesWaiting],
          ["Confirmed events", data.kpis.confirmedEvents],
          ["Upcoming", data.kpis.upcomingEvents],
          ["Pipeline", formatKsh(data.kpis.pipelineCents)],
          ["Confirmed revenue", formatKsh(data.kpis.confirmedCents)],
          ["Outstanding", formatKsh(data.kpis.outstandingCents)],
          ["Low stock", data.kpis.lowStock],
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-card px-3 py-3">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-lg font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-md border border-border bg-card">
          <h2 className="border-b border-border px-4 py-3 font-medium">Today&apos;s actions</h2>
          {data.tasks.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground">No tasks due today.</p> : (
            <ul>
              {data.tasks.map((task) => (
                <li key={String(task._id)} className="flex items-start justify-between gap-3 border-t border-border px-4 py-3 text-sm">
                  <span>
                    <span className="block font-medium">{task.title}</span>
                    <span className="text-xs text-muted-foreground">{formatWhen(task.dueAt, "Africa/Nairobi", true)}</span>
                  </span>
                  <StatusPill value={task.priority || "normal"} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-md border border-border bg-card">
          <h2 className="border-b border-border px-4 py-3 font-medium">Upcoming events</h2>
          {data.events.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground">No confirmed events on the horizon.</p> : (
            <ul>
              {data.events.map((event) => (
                <li key={String(event._id)} className="border-t border-border">
                  <a href={`/events/${event._id}`} className="block px-4 py-3 hover:bg-muted/50">
                    <span className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{event.reference} · {event.clientName}</span>
                      <StatusPill value={event.preparationStatus || "on_track"} />
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{formatWhen(event.startAt, "Africa/Nairobi", true)} · {event.guestCount || "—"} guests</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <section className="mt-4 rounded-md border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 font-medium">Pipeline snapshot</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-2">Stage</th><th className="px-4 py-2">Opportunities</th><th className="px-4 py-2">Value</th></tr>
            </thead>
            <tbody>
              {data.pipeline.map((stage) => (
                <tr key={stage.stage} className="border-t border-border">
                  <td className="px-4 py-2">{ENQUIRY_STATUS_LABELS[stage.stage as EnquiryStatus]}</td>
                  <td className="px-4 py-2">{stage.count}</td>
                  <td className="px-4 py-2">{formatKsh(stage.valueCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
