"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acceptProposalAction, declineProposalAction } from "@/server/actions";
import { Button } from "@/components/ui/button";

const REASONS = ["Budget", "Date", "Requirements changed", "Chose another venue", "Event cancelled", "Other"];

export function ProposalResponse({
  token,
  summary,
}: {
  token: string;
  summary: { organization: string; date: string; total: string; deposit: string };
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <section className="no-print mt-12 border-t border-[#d9d0c3] pt-8">
      <h2 className="text-[11px] uppercase tracking-[0.18em] text-[#73695f]">Accept this proposal</h2>
      <dl className="mt-4 space-y-1 text-sm">
        <div className="flex justify-between gap-6"><dt className="text-[#73695f]">Client</dt><dd>{summary.organization}</dd></div>
        <div className="flex justify-between gap-6"><dt className="text-[#73695f]">Event date</dt><dd>{summary.date}</dd></div>
        <div className="flex justify-between gap-6"><dt className="text-[#73695f]">Total investment</dt><dd>{summary.total}</dd></div>
        <div className="flex justify-between gap-6"><dt className="text-[#73695f]">Deposit</dt><dd>{summary.deposit}</dd></div>
      </dl>
      <label className="mt-6 block text-sm">
        Name of the person accepting
        <input className="mt-1 h-10 w-full border-b border-[#d9d0c3] bg-transparent outline-none" value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="mt-4 flex items-start gap-2 text-sm">
        <input className="mt-1" type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
        I accept this proposal and the terms shown above. This is not a payment.
      </label>
      {error ? <p className="mt-3 text-sm text-[#9f1239]">{error}</p> : null}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={async () => {
          const result = await acceptProposalAction({ token, name, acceptTerms: accepted ? true : undefined });
          if (!result.ok) setError(result.error);
          else router.refresh();
        }}>Accept proposal</Button>
        <Button variant="outline" onClick={() => setDeclining((open) => !open)}>Decline</Button>
      </div>
      {declining ? (
        <form className="mt-4 space-y-3" onSubmit={async (event) => {
          event.preventDefault();
          const result = await declineProposalAction({ token, reason });
          if (!result.ok) setError(result.error);
          else router.refresh();
        }}>
          <label className="block text-sm">
            Reason, if you would like to share one
            <select className="mt-1 h-10 w-full bg-transparent text-sm" value={reason} onChange={(event) => setReason(event.target.value)}>
              <option value="">No reason given</option>
              {REASONS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <Button type="submit" variant="secondary">Decline proposal</Button>
        </form>
      ) : null}
    </section>
  );
}
