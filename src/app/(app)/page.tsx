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
  const counts = [
    [data.kpis.newEnquiries, "new enquiries"],
    [data.kpis.followUpsDue, "follow-ups due"],
    [data.kpis.overdueFollowUps, "overdue"],
    [data.kpis.siteVisits, "site visits"],
    [data.kpis.quotesWaiting, "quotes waiting"],
    [data.kpis.confirmedEvents, "confirmed events"],
    [data.kpis.upcomingEvents, "upcoming"],
    [data.kpis.lowStock, "low stock"],
  ] as const;
  return (
    <div>
      <PageHeader eyebrow="Today" title="Command Centre" />
      {data.kpis.depositUnconfigured ? (
        <p className="mb-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">Deposit rules are not configured. Bookings will not demand a deposit until leadership sets one in Settings.</p>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-3">
        {[
          ["Pipeline", formatKsh(data.kpis.pipelineCents)],
          ["Confirmed revenue", formatKsh(data.kpis.confirmedCents)],
          ["Outstanding", formatKsh(data.kpis.outstandingCents)],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 font-display text-3xl leading-none">{value}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {counts.map(([value, label]) => (
          <span key={label}><span className="font-medium text-foreground">{value}</span> {label}</span>
        ))}
      </p>

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
        <section className="rounded-md border border-border bg-card">
          <h2 className="border-b border-border px-4 py-3 text-sm font-medium">Needs attention</h2>
          {data.attention.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Nothing is overdue. Check today&apos;s tasks before you leave the desk.</p>
          ) : (
            <ul>
              {data.attention.map((item) => (
                <li key={item.id} className="border-t border-border first:border-t-0">
                  <a href={item.href} className="grid grid-cols-[4.5rem_1fr] items-baseline gap-3 px-4 py-2 hover:bg-muted/50">
                    <span className={item.tone === "bad" ? "text-xs text-destructive" : "text-xs text-warning"}>{item.tone === "bad" ? "Overdue" : "Due"}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{item.title}</span>
                      {item.name ? <span className="block truncate text-xs font-semibold">{item.name}</span> : null}
                      {item.detail ? <span className="block truncate text-xs text-muted-foreground">{item.detail}</span> : null}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid gap-4">
          <section className="rounded-md border border-border bg-card">
            <h2 className="border-b border-border px-4 py-3 text-sm font-medium">Today&apos;s actions</h2>
            {data.tasks.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground">No tasks due today.</p> : (
              <ul>
                {data.tasks.map((task) => (
                  <li key={String(task._id)} className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-sm first:border-t-0">
                    <span className="min-w-0">
                      <span className="block truncate">{task.title}</span>
                      <span className="text-xs text-muted-foreground">{formatWhen(task.dueAt, "Africa/Nairobi", true)}</span>
                    </span>
                    <StatusPill value={task.priority || "normal"} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-md border border-border bg-card">
            <h2 className="border-b border-border px-4 py-3 text-sm font-medium">Upcoming events</h2>
            {data.events.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground">No confirmed events on the horizon.</p> : (
              <ul>
                {data.events.map((event) => (
                  <li key={String(event._id)} className="border-t border-border first:border-t-0">
                    <a href={`/events/${event._id}`} className="block px-4 py-2 hover:bg-muted/50">
                      <span className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">{event.reference} · {event.clientName}</span>
                        <StatusPill value={event.preparationStatus || "on_track"} />
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{formatWhen(event.startAt, "Africa/Nairobi", true)} · {event.guestCount || "—"} guests</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section className="mt-4 rounded-md border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium">Pipeline</h2>
          <a href="/pipeline" className="text-xs text-muted-foreground hover:text-foreground">Open pipeline</a>
        </div>
        <ul>
          {data.pipeline.map((stage) => (
            <li key={stage.stage} className="grid grid-cols-[1fr_4rem_8rem] items-baseline gap-3 border-t border-border px-4 py-2 text-sm first:border-t-0">
              <span>{ENQUIRY_STATUS_LABELS[stage.stage as EnquiryStatus]}</span>
              <span className="text-right text-muted-foreground">{stage.count}</span>
              <span className="text-right">{formatKsh(stage.valueCents)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
