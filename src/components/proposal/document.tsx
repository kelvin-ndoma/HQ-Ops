import type { ClientProposal } from "@/domain/proposal";

export function ProposalDocument({
  proposal,
  children,
}: {
  proposal: ClientProposal;
  children?: React.ReactNode;
}) {
  return (
    <article className="proposal-sheet mx-auto max-w-[820px] bg-[#f7f3ec] px-8 py-12 text-[#1c1917] sm:px-14">
      <style>{`
        .proposal-sheet { font-family: var(--font-geist-sans), sans-serif; }
        .proposal-display { font-family: var(--font-fraunces), Georgia, serif; }
        @media print {
          @page { size: A4; margin: 14mm 14mm 18mm; }
          body { background: white !important; }
          .proposal-sheet { max-width: none; background: white; padding: 0 0 14mm; }
          .proposal-table thead { display: table-header-group; }
          .proposal-keep, .proposal-table tr { break-inside: avoid; }
          .proposal-foot {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            font-size: 10px;
            color: #73695f;
          }
        }
      `}</style>
      <header className="proposal-keep border-b border-[#d9d0c3] pb-8">
        <p className="text-[11px] uppercase tracking-[0.28em] text-[#1b3a34]">{proposal.hqName}</p>
        <p className="mt-6 text-[11px] uppercase tracking-[0.22em] text-[#73695f]">Private events</p>
        <h1 className="proposal-display mt-2 text-4xl text-[#1b3a34]">Event proposal</h1>
        <p className="mt-8 text-sm text-[#73695f]">Prepared for</p>
        <p className="proposal-display mt-1 text-3xl">{proposal.organization}</p>
        <p className="mt-3 text-lg">{proposal.eventTitle}</p>
        <p className="mt-1 text-sm text-[#73695f]">
          {proposal.eventDateLabel}
          {proposal.guestsLabel ? ` · ${proposal.guestsLabel}` : ""}
        </p>
      </header>

      <section className="proposal-keep mt-10">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-[#73695f]">Your event</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4 text-sm sm:grid-cols-3">
          <div><dt className="text-[#73695f]">Date</dt><dd className="mt-1">{proposal.date}</dd></div>
          <div><dt className="text-[#73695f]">Time</dt><dd className="mt-1">{proposal.time}</dd></div>
          <div><dt className="text-[#73695f]">Venue</dt><dd className="mt-1">{proposal.venue}</dd></div>
          <div><dt className="text-[#73695f]">Guests</dt><dd className="mt-1">{proposal.guestCount}</dd></div>
          <div><dt className="text-[#73695f]">Event</dt><dd className="mt-1">{proposal.eventType}</dd></div>
        </dl>
      </section>

      <section className="mt-12">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-[#73695f]">Your proposal</h2>
        <table className="proposal-table mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-[#d9d0c3] text-left text-[11px] uppercase tracking-[0.14em] text-[#73695f]">
              <th className="py-2 font-medium">Item</th>
              <th className="py-2 font-medium">Qty</th>
              <th className="py-2 font-medium">Unit</th>
              <th className="py-2 text-right font-medium">Rate</th>
              <th className="py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {proposal.lines.map((line, index) => (
              <tr key={`${line.description}-${index}`} className="border-b border-[#ebe4d9]">
                <td className="py-3 pr-4">{line.description}</td>
                <td className="py-3">{line.quantity}</td>
                <td className="py-3 capitalize">{line.unit}</td>
                <td className="py-3 text-right">{line.rateLabel}</td>
                <td className="py-3 text-right">{line.totalLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="proposal-keep mt-10 border-t border-[#1b3a34] pt-6">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-[#73695f]">Total investment</h2>
        <p className="proposal-display mt-3 text-4xl text-[#1b3a34]">{proposal.totalLabel}</p>
        <dl className="mt-4 max-w-sm space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-[#73695f]">Subtotal</dt><dd>{proposal.subtotalLabel}</dd></div>
          <div className="flex justify-between"><dt className="text-[#73695f]">Discount</dt><dd>{proposal.discountLabel}</dd></div>
          <div className="flex justify-between"><dt className="text-[#73695f]">Tax</dt><dd>{proposal.taxLabel}</dd></div>
        </dl>
      </section>

      {proposal.inclusions.length ? (
        <section className="proposal-keep mt-10">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-[#73695f]">What&apos;s included</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {proposal.inclusions.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      ) : null}

      {proposal.arrangements ? (
        <section className="proposal-keep mt-10">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-[#73695f]">Special arrangements</h2>
          <p className="mt-4 max-w-xl text-sm leading-6">{proposal.arrangements}</p>
        </section>
      ) : null}

      {proposal.requirements ? (
        <section className="proposal-keep mt-10">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-[#73695f]">Noted from your brief</h2>
          <p className="mt-4 max-w-xl text-sm leading-6">{proposal.requirements}</p>
        </section>
      ) : null}

      <section className="proposal-keep mt-10">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-[#73695f]">Payment terms</h2>
        {proposal.showDeposit ? (
          <dl className="mt-4 max-w-sm space-y-1 text-sm">
            <div className="flex justify-between"><dt>Total investment</dt><dd>{proposal.totalLabel}</dd></div>
            <div className="flex justify-between"><dt>Required deposit</dt><dd>{proposal.depositLabel}</dd></div>
            <div className="flex justify-between"><dt>Remaining balance</dt><dd>{proposal.balanceLabel}</dd></div>
          </dl>
        ) : (
          <p className="mt-4 text-sm leading-6">No deposit is required by the current commercial rule. The total investment is {proposal.totalLabel}.</p>
        )}
        <p className="mt-4 text-sm text-[#73695f]">Accepting this proposal confirms the event details. It is not a payment.</p>
      </section>

      <section className="proposal-keep mt-10">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-[#73695f]">Proposal validity</h2>
        <p className="mt-4 text-sm">{proposal.validUntil ? `Valid until ${proposal.validUntil}.` : "This draft has not been issued."}</p>
      </section>

      {proposal.terms.length ? (
        <section className="mt-10">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-[#73695f]">Terms</h2>
          <div className="mt-4 space-y-5">
            {proposal.terms.map((term) => (
              <div key={term.title} className="proposal-keep">
                <h3 className="text-sm font-medium">{term.title}</h3>
                <p className="mt-1 text-sm leading-6 text-[#44403c]">{term.content}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <footer className="proposal-keep mt-14 border-t border-[#d9d0c3] pt-6 text-sm">
        <p className="proposal-display text-xl text-[#1b3a34]">{proposal.hqName}</p>
        <p className="mt-2 text-[#73695f]">{proposal.hqAddress}</p>
        <p className="text-[#73695f]">{[proposal.hqPhone, proposal.hqEmail].filter(Boolean).join(" · ")}</p>
      </footer>
      <p className="proposal-foot mt-8 text-[11px] tracking-[0.14em] text-[#73695f]">{proposal.reference} · V{proposal.version}</p>
      {children}
    </article>
  );
}
