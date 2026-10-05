"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { quoteStatusAction, sendProposalAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";

export function SendProposal({
  id,
  recipient,
  email,
  version,
  total,
  validUntil,
}: {
  id: string;
  recipient: string;
  email: string;
  version: number;
  total: string;
  validUntil: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("Hi, please find your event proposal from HQ. You can review the details and accept the proposal using the secure link below.");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  return (
    <div>
      <Button onClick={() => setOpen(true)}>Send to client</Button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-[360px] rounded-md border border-border bg-card p-4 text-sm shadow-sm">
          <p className="font-medium">Send proposal</p>
          <dl className="mt-3 space-y-1">
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Recipient</dt><dd>{recipient}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Email</dt><dd>{email || "Missing"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Version</dt><dd>V{version}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Total</dt><dd>{total}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Valid until</dt><dd>{validUntil}</dd></div>
          </dl>
          <Field label="Message">
            <Textarea value={message} onChange={(event) => setMessage(event.target.value)} />
          </Field>
          {error ? <p className="mt-2 text-destructive">{error}</p> : null}
          {notice ? <p className="mt-2">{notice}</p> : null}
          <div className="mt-3 flex gap-2">
            <Button onClick={async () => {
              const result = await sendProposalAction({ id, message });
              if (!result.ok) {
                setError(result.error);
                setNotice("");
                return;
              }
              const data = result.data as { delivery?: string; previewUrl?: string } | undefined;
              if (data?.delivery === "development" && data.previewUrl) setNotice(`Development preview only. No email provider is configured. ${data.previewUrl}`);
              else if (data?.delivery === "skipped") setNotice("The message was not delivered. No email provider is configured.");
              else setNotice("The proposal was handed to the email provider.");
              setError("");
              router.refresh();
            }}>Send</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function QuoteMenu({
  id,
  status,
  canExpire,
}: {
  id: string;
  status: string;
  canExpire: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <details className="relative">
      <summary className="flex h-9 cursor-pointer list-none items-center rounded-md border border-border bg-card px-3 text-sm">···</summary>
      <div className="absolute right-0 z-20 mt-1 w-52 rounded-md border border-border bg-card p-1 text-sm shadow-sm">
        <Link className="block rounded px-2 py-1.5 hover:bg-muted" href={`/quotations/${id}/print`}>Print / save as PDF</Link>
        <Link className="block rounded px-2 py-1.5 hover:bg-muted" href={`/enquiries`}>Open pipeline</Link>
        {status === "accepted" ? <Link className="block rounded px-2 py-1.5 hover:bg-muted" href={`/bookings/new?quotation=${id}`}>Create booking</Link> : null}
        {canExpire && (status === "sent" || status === "viewed") ? (
          <button className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted" onClick={async () => {
            const result = await quoteStatusAction({ id, status: "expired" });
            if (!result.ok) setError(result.error);
            else router.refresh();
          }}>Mark expired</button>
        ) : null}
        {error ? <p className="px-2 py-1 text-destructive">{error}</p> : null}
      </div>
    </details>
  );
}

export function RevisionToggle({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!open) return <Button variant="secondary" onClick={() => setOpen(true)}>Create revision</Button>;
  return <div className="mt-8">{children}</div>;
}
